use std::fmt;
use std::io::{BufReader, Cursor};

use exif::{In, Tag};
use image::codecs::gif::GifDecoder;
use image::codecs::jpeg::{JpegDecoder, JpegEncoder};
use image::codecs::png::PngDecoder;
use image::codecs::webp::WebPDecoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{
    AnimationDecoder, DynamicImage, ExtendedColorType, GenericImageView, ImageDecoder,
    ImageEncoder, ImageFormat, Limits, RgbaImage,
};

use super::contract::{
    load_contract, target_for_role, thumbnail_target_for_role, FamilyId, ProfileVersion, RoleId,
    TierId,
};
use super::fingerprint::{fingerprint_reader, FingerprintError};
use super::identity::ValidatedSha256;

pub const MAX_SOURCE_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_DECODED_PIXELS: u64 = 64_000_000;
pub const MAX_AXIS: u32 = 32_768;
pub const JPEG_QUALITY: u8 = 85;
pub const PROCESSING_POLICY_VERSION: &str = "managed-media-processor-v1";
pub const RESIZE_FILTER: &str = "Lanczos3";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProcessorLimits {
    pub maximum_source_bytes: u64,
    pub maximum_decoded_pixels: u64,
    pub maximum_axis: u32,
}

impl Default for ProcessorLimits {
    fn default() -> Self {
        Self {
            maximum_source_bytes: MAX_SOURCE_BYTES,
            maximum_decoded_pixels: MAX_DECODED_PIXELS,
            maximum_axis: MAX_AXIS,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputFormat {
    Jpeg,
    Png,
    Gif,
    WebP,
}

impl InputFormat {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Jpeg => "JPEG",
            Self::Png => "PNG",
            Self::Gif => "GIF",
            Self::WebP => "WEBP",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Jpeg,
    Png,
}

impl OutputFormat {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Jpeg => "JPEG",
            Self::Png => "PNG",
        }
    }

    const fn image_format(self) -> ImageFormat {
        match self {
            Self::Jpeg => ImageFormat::Jpeg,
            Self::Png => ImageFormat::Png,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrientationApplied {
    Identity,
    FlipHorizontal,
    Rotate180,
    FlipVertical,
    Rotate90FlipHorizontal,
    Rotate90,
    Rotate270FlipHorizontal,
    Rotate270,
}

impl OrientationApplied {
    pub const fn exif_value(self) -> u8 {
        match self {
            Self::Identity => 1,
            Self::FlipHorizontal => 2,
            Self::Rotate180 => 3,
            Self::FlipVertical => 4,
            Self::Rotate90FlipHorizontal => 5,
            Self::Rotate90 => 6,
            Self::Rotate270FlipHorizontal => 7,
            Self::Rotate270 => 8,
        }
    }

    fn image_orientation(self) -> Orientation {
        Orientation::from_exif(self.exif_value()).expect("validated EXIF orientation")
    }
}

impl TryFrom<u32> for OrientationApplied {
    type Error = ProcessorError;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Identity),
            2 => Ok(Self::FlipHorizontal),
            3 => Ok(Self::Rotate180),
            4 => Ok(Self::FlipVertical),
            5 => Ok(Self::Rotate90FlipHorizontal),
            6 => Ok(Self::Rotate90),
            7 => Ok(Self::Rotate270FlipHorizontal),
            8 => Ok(Self::Rotate270),
            _ => Err(ProcessorError::MalformedOrientation),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CropRectangle {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessorVariant {
    Standard(TierId),
    NativeFallback,
}

#[derive(Debug, Clone)]
pub struct ProcessorRequest<'a> {
    pub source_bytes: &'a [u8],
    pub role: RoleId,
    pub tier: TierId,
}

#[derive(Debug, Clone)]
pub struct ProcessorResult {
    pub output_bytes: Vec<u8>,
    pub output_format: OutputFormat,
    pub width: u32,
    pub height: u32,
    pub byte_length: u64,
    pub output_sha256: ValidatedSha256,
    pub source_sha256: ValidatedSha256,
    pub profile_version: ProfileVersion,
    pub role: RoleId,
    pub family: FamilyId,
    pub variant: ProcessorVariant,
    pub normalized_source_width: u32,
    pub normalized_source_height: u32,
    pub crop: CropRectangle,
    pub orientation_applied: OrientationApplied,
    pub input_format: InputFormat,
    pub input_was_animated: bool,
    pub resize_filter: &'static str,
    pub jpeg_quality: Option<u8>,
    pub processing_policy_version: &'static str,
}

#[derive(Debug)]
pub enum ProcessorError {
    EmptySource,
    UnsupportedFormat,
    UnknownFormat,
    InvalidOrTruncatedImage,
    SourceTooLarge { limit: u64 },
    DimensionsTooLarge,
    PixelCountTooLarge,
    ArithmeticOverflow,
    ZeroDimensions,
    MalformedOrientation,
    UnsupportedColorProfile,
    UnsupportedAnimatedWebP,
    Contract(String),
    IneligibleStandardTier,
    InvalidNativeFallback,
    EncodeFailure,
    ReopenFailure,
    ValidationMismatch,
    IoFailure,
    HashingFailure,
}

impl fmt::Display for ProcessorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptySource => formatter.write_str("Managed-media source is empty."),
            Self::UnsupportedFormat => formatter.write_str("Image format is not approved."),
            Self::UnknownFormat => formatter.write_str("Image format could not be identified."),
            Self::InvalidOrTruncatedImage => formatter.write_str("Image is invalid or truncated."),
            Self::SourceTooLarge { limit } => {
                write!(formatter, "Image exceeds the {limit}-byte source limit.")
            }
            Self::DimensionsTooLarge => formatter.write_str("Image axis exceeds the limit."),
            Self::PixelCountTooLarge => {
                formatter.write_str("Decoded pixel count exceeds the limit.")
            }
            Self::ArithmeticOverflow => formatter.write_str("Image arithmetic overflowed."),
            Self::ZeroDimensions => formatter.write_str("Image dimensions must be positive."),
            Self::MalformedOrientation => {
                formatter.write_str("Image orientation metadata is malformed or contradictory.")
            }
            Self::UnsupportedColorProfile => {
                formatter.write_str("Embedded color profile cannot be converted safely.")
            }
            Self::UnsupportedAnimatedWebP => {
                formatter.write_str("Animated WebP is not enabled in this foundation.")
            }
            Self::Contract(_) => formatter.write_str("Managed-media contract lookup failed."),
            Self::IneligibleStandardTier => {
                formatter.write_str("Canonical crop cannot satisfy the requested standard tier.")
            }
            Self::InvalidNativeFallback => {
                formatter.write_str("Native fallback dimensions are invalid.")
            }
            Self::EncodeFailure => formatter.write_str("Managed output could not be encoded."),
            Self::ReopenFailure => formatter.write_str("Managed output could not be reopened."),
            Self::ValidationMismatch => {
                formatter.write_str("Managed output validation did not match its descriptor.")
            }
            Self::IoFailure => formatter.write_str("Image input could not be read."),
            Self::HashingFailure => {
                formatter.write_str("Image fingerprint could not be calculated.")
            }
        }
    }
}

impl std::error::Error for ProcessorError {}

impl From<FingerprintError> for ProcessorError {
    fn from(error: FingerprintError) -> Self {
        match error {
            FingerprintError::SourceTooLarge { limit } => Self::SourceTooLarge { limit },
            FingerprintError::UnreadableSource
            | FingerprintError::InterruptedRead
            | FingerprintError::IoFailure(_) => Self::IoFailure,
            FingerprintError::InvalidResult => Self::HashingFailure,
        }
    }
}

#[derive(Debug)]
struct DecodedSource {
    image: DynamicImage,
    format: InputFormat,
    orientation: OrientationApplied,
    animated: bool,
}

#[derive(Debug, Clone)]
struct PreparedPixels {
    pixels: RgbaImage,
    crop: CropRectangle,
    normalized_width: u32,
    normalized_height: u32,
    variant: ProcessorVariant,
}

#[derive(Debug, Clone)]
pub struct ManagedMediaProcessor {
    limits: ProcessorLimits,
}

impl Default for ManagedMediaProcessor {
    fn default() -> Self {
        Self {
            limits: ProcessorLimits::default(),
        }
    }
}

impl ManagedMediaProcessor {
    pub const fn with_limits(limits: ProcessorLimits) -> Self {
        Self { limits }
    }

    pub fn process(
        &self,
        request: ProcessorRequest<'_>,
    ) -> Result<ProcessorResult, ProcessorError> {
        self.validate_source_length(request.source_bytes)?;
        let source_fingerprint = fingerprint_reader(
            Cursor::new(request.source_bytes),
            self.limits.maximum_source_bytes,
        )?;
        let contract = load_contract().map_err(ProcessorError::Contract)?;
        let (family, target_width, target_height) =
            target_for_role(&contract, request.role, request.tier)
                .map_err(ProcessorError::Contract)?;
        let (thumbnail_family, thumbnail_width, thumbnail_height) =
            thumbnail_target_for_role(&contract, request.role).map_err(ProcessorError::Contract)?;
        if family != thumbnail_family {
            return Err(ProcessorError::Contract(
                "Role target family is inconsistent.".to_string(),
            ));
        }

        let mut decoded = self.decode_source(request.source_bytes)?;
        decoded
            .image
            .apply_orientation(decoded.orientation.image_orientation());
        let normalized_dimensions = decoded.image.dimensions();
        self.validate_dimensions(normalized_dimensions.0, normalized_dimensions.1)?;

        let family_ratio = contract
            .families
            .iter()
            .find(|candidate| candidate.id == family)
            .map(|candidate| (candidate.ratio.width, candidate.ratio.height))
            .ok_or_else(|| ProcessorError::Contract("Family ratio is missing.".to_string()))?;
        let prepared = prepare_pixels(
            &decoded.image,
            family_ratio,
            (target_width, target_height),
            (thumbnail_width, thumbnail_height),
            request.tier,
        )?;
        let (output_bytes, output_format) = encode_pixels(&prepared.pixels)?;
        let output_fingerprint =
            fingerprint_reader(Cursor::new(&output_bytes), self.limits.maximum_source_bytes)?;

        let result = ProcessorResult {
            width: prepared.pixels.width(),
            height: prepared.pixels.height(),
            byte_length: output_bytes.len() as u64,
            output_sha256: output_fingerprint.hash,
            source_sha256: source_fingerprint.hash,
            output_bytes,
            output_format,
            profile_version: contract.profile_version,
            role: request.role,
            family,
            variant: prepared.variant,
            normalized_source_width: prepared.normalized_width,
            normalized_source_height: prepared.normalized_height,
            crop: prepared.crop,
            orientation_applied: decoded.orientation,
            input_format: decoded.format,
            input_was_animated: decoded.animated,
            resize_filter: RESIZE_FILTER,
            jpeg_quality: (output_format == OutputFormat::Jpeg).then_some(JPEG_QUALITY),
            processing_policy_version: PROCESSING_POLICY_VERSION,
        };
        self.validate_result_internal(&result, Some(&prepared.pixels))?;
        Ok(result)
    }

    pub fn validate_result(&self, result: &ProcessorResult) -> Result<(), ProcessorError> {
        self.validate_result_internal(result, None)
    }

    fn validate_source_length(&self, source: &[u8]) -> Result<(), ProcessorError> {
        if source.is_empty() {
            return Err(ProcessorError::EmptySource);
        }
        if source.len() as u64 > self.limits.maximum_source_bytes {
            return Err(ProcessorError::SourceTooLarge {
                limit: self.limits.maximum_source_bytes,
            });
        }
        Ok(())
    }

    fn validate_dimensions(&self, width: u32, height: u32) -> Result<(), ProcessorError> {
        if width == 0 || height == 0 {
            return Err(ProcessorError::ZeroDimensions);
        }
        if width > self.limits.maximum_axis || height > self.limits.maximum_axis {
            return Err(ProcessorError::DimensionsTooLarge);
        }
        let pixels = u64::from(width)
            .checked_mul(u64::from(height))
            .ok_or(ProcessorError::ArithmeticOverflow)?;
        if pixels > self.limits.maximum_decoded_pixels {
            return Err(ProcessorError::PixelCountTooLarge);
        }
        Ok(())
    }

    fn decoder_limits(&self) -> Limits {
        let mut limits = Limits::no_limits();
        limits.max_image_width = Some(self.limits.maximum_axis);
        limits.max_image_height = Some(self.limits.maximum_axis);
        limits.max_alloc = Some(self.limits.maximum_decoded_pixels.saturating_mul(4));
        limits
    }

    fn decode_source(&self, source: &[u8]) -> Result<DecodedSource, ProcessorError> {
        let guessed = image::guess_format(source).map_err(|_| ProcessorError::UnknownFormat)?;
        let format = match guessed {
            ImageFormat::Jpeg => InputFormat::Jpeg,
            ImageFormat::Png => InputFormat::Png,
            ImageFormat::Gif => InputFormat::Gif,
            ImageFormat::WebP => InputFormat::WebP,
            _ => return Err(ProcessorError::UnsupportedFormat),
        };
        let cursor = Cursor::new(source);
        let reader = BufReader::new(cursor);

        match format {
            InputFormat::Jpeg => {
                let decoder = JpegDecoder::new(reader)
                    .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
                let (width, height) = decoder.dimensions();
                self.validate_dimensions(width, height)?;
                let orientation = read_orientation(source, format)?;
                self.decode_with(decoder, format, orientation, false)
            }
            InputFormat::Png => {
                let decoder =
                    PngDecoder::new(reader).map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
                let (width, height) = decoder.dimensions();
                self.validate_dimensions(width, height)?;
                let orientation = read_orientation(source, format)?;
                self.decode_with(decoder, format, orientation, false)
            }
            InputFormat::Gif => {
                let decoder =
                    GifDecoder::new(reader).map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
                let animated = gif_has_multiple_frames(source)?;
                self.decode_with(decoder, format, OrientationApplied::Identity, animated)
            }
            InputFormat::WebP => {
                let decoder = WebPDecoder::new(reader)
                    .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
                let (width, height) = decoder.dimensions();
                self.validate_dimensions(width, height)?;
                if decoder.has_animation() {
                    return Err(ProcessorError::UnsupportedAnimatedWebP);
                }
                let orientation = read_orientation(source, format)?;
                self.decode_with(decoder, format, orientation, false)
            }
        }
    }

    fn decode_with<D>(
        &self,
        mut decoder: D,
        format: InputFormat,
        orientation: OrientationApplied,
        animated: bool,
    ) -> Result<DecodedSource, ProcessorError>
    where
        D: ImageDecoder,
    {
        let (width, height) = decoder.dimensions();
        self.validate_dimensions(width, height)?;
        decoder
            .set_limits(self.decoder_limits())
            .map_err(|_| ProcessorError::DimensionsTooLarge)?;
        if decoder
            .icc_profile()
            .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?
            .is_some_and(|profile| !profile.is_empty())
        {
            return Err(ProcessorError::UnsupportedColorProfile);
        }
        let image = DynamicImage::from_decoder(decoder)
            .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
        Ok(DecodedSource {
            image,
            format,
            orientation,
            animated,
        })
    }

    fn validate_result_internal(
        &self,
        result: &ProcessorResult,
        expected_pixels: Option<&RgbaImage>,
    ) -> Result<(), ProcessorError> {
        if result.byte_length != result.output_bytes.len() as u64 {
            return Err(ProcessorError::ValidationMismatch);
        }
        let checksum = fingerprint_reader(
            Cursor::new(&result.output_bytes),
            self.limits.maximum_source_bytes,
        )
        .map_err(|_| ProcessorError::ValidationMismatch)?;
        if checksum.hash != result.output_sha256 {
            return Err(ProcessorError::ValidationMismatch);
        }
        let guessed =
            image::guess_format(&result.output_bytes).map_err(|_| ProcessorError::ReopenFailure)?;
        if guessed != result.output_format.image_format() {
            return Err(ProcessorError::ValidationMismatch);
        }
        let reopened = self
            .decode_source(&result.output_bytes)
            .map_err(|_| ProcessorError::ReopenFailure)?;
        if reopened.animated
            || reopened.orientation != OrientationApplied::Identity
            || reopened.image.dimensions() != (result.width, result.height)
        {
            return Err(ProcessorError::ValidationMismatch);
        }
        self.validate_dimensions(result.width, result.height)?;

        let contract = load_contract().map_err(ProcessorError::Contract)?;
        match result.variant {
            ProcessorVariant::Standard(tier) => {
                let (family, width, height) = target_for_role(&contract, result.role, tier)
                    .map_err(ProcessorError::Contract)?;
                if family != result.family || (width, height) != (result.width, result.height) {
                    return Err(ProcessorError::ValidationMismatch);
                }
            }
            ProcessorVariant::NativeFallback => {
                if result.width == 0
                    || result.height == 0
                    || result.width > result.crop.width
                    || result.height > result.crop.height
                {
                    return Err(ProcessorError::InvalidNativeFallback);
                }
            }
        }

        let rgba = reopened.image.to_rgba8();
        if result.output_format == OutputFormat::Jpeg
            && rgba.pixels().any(|pixel| pixel.0[3] != 255)
        {
            return Err(ProcessorError::ValidationMismatch);
        }
        if let Some(expected) = expected_pixels {
            if result.output_format == OutputFormat::Png && &rgba != expected {
                return Err(ProcessorError::ValidationMismatch);
            }
            if result.output_format == OutputFormat::Png
                && expected.pixels().any(|pixel| pixel.0[3] != 255)
                && !rgba.pixels().any(|pixel| pixel.0[3] != 255)
            {
                return Err(ProcessorError::ValidationMismatch);
            }
        }
        Ok(())
    }
}

fn gif_has_multiple_frames(source: &[u8]) -> Result<bool, ProcessorError> {
    let decoder = GifDecoder::new(BufReader::new(Cursor::new(source)))
        .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
    let mut frames = decoder.into_frames();
    let first = frames
        .next()
        .ok_or(ProcessorError::InvalidOrTruncatedImage)?
        .map_err(|_| ProcessorError::InvalidOrTruncatedImage)?;
    drop(first);
    match frames.next() {
        Some(Ok(_)) => Ok(true),
        Some(Err(_)) => Err(ProcessorError::InvalidOrTruncatedImage),
        None => Ok(false),
    }
}

fn read_orientation(
    source: &[u8],
    format: InputFormat,
) -> Result<OrientationApplied, ProcessorError> {
    if format == InputFormat::Gif {
        return Ok(OrientationApplied::Identity);
    }
    let mut reader = BufReader::new(Cursor::new(source));
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(exif) => exif,
        Err(exif::Error::NotFound(_)) => return Ok(OrientationApplied::Identity),
        Err(_) => return Err(ProcessorError::MalformedOrientation),
    };
    let mut orientation = None;
    for field in exif
        .fields()
        .filter(|field| field.tag == Tag::Orientation && field.ifd_num == In::PRIMARY)
    {
        let value = field
            .value
            .get_uint(0)
            .ok_or(ProcessorError::MalformedOrientation)?;
        let parsed = OrientationApplied::try_from(value)?;
        if orientation.is_some_and(|current| current != parsed) {
            return Err(ProcessorError::MalformedOrientation);
        }
        orientation = Some(parsed);
    }
    Ok(orientation.unwrap_or(OrientationApplied::Identity))
}

fn prepare_pixels(
    normalized: &DynamicImage,
    family_ratio: (u32, u32),
    target: (u32, u32),
    thumbnail: (u32, u32),
    tier: TierId,
) -> Result<PreparedPixels, ProcessorError> {
    let (source_width, source_height) = normalized.dimensions();
    let crop = canonical_center_crop(source_width, source_height, family_ratio)?;
    let eligible = standard_tier_is_eligible(crop, target);
    let variant = if eligible {
        ProcessorVariant::Standard(tier)
    } else if tier == TierId::Thumbnail && (crop.width < thumbnail.0 || crop.height < thumbnail.1) {
        ProcessorVariant::NativeFallback
    } else {
        return Err(ProcessorError::IneligibleStandardTier);
    };
    let cropped = normalized
        .crop_imm(crop.x, crop.y, crop.width, crop.height)
        .to_rgba8();
    let pixels = match variant {
        ProcessorVariant::Standard(_) => {
            image::imageops::resize(&cropped, target.0, target.1, FilterType::Lanczos3)
        }
        ProcessorVariant::NativeFallback => cropped,
    };
    if pixels.width() == 0
        || pixels.height() == 0
        || (variant == ProcessorVariant::NativeFallback
            && (pixels.width() > crop.width || pixels.height() > crop.height))
    {
        return Err(ProcessorError::InvalidNativeFallback);
    }
    Ok(PreparedPixels {
        pixels,
        crop,
        normalized_width: source_width,
        normalized_height: source_height,
        variant,
    })
}

pub const fn standard_tier_is_eligible(crop: CropRectangle, target: (u32, u32)) -> bool {
    crop.width >= target.0 && crop.height >= target.1
}

pub fn canonical_center_crop(
    source_width: u32,
    source_height: u32,
    ratio: (u32, u32),
) -> Result<CropRectangle, ProcessorError> {
    if source_width == 0 || source_height == 0 || ratio.0 == 0 || ratio.1 == 0 {
        return Err(ProcessorError::ZeroDimensions);
    }
    let scale = (source_width / ratio.0).min(source_height / ratio.1);
    if scale == 0 {
        return Err(ProcessorError::InvalidNativeFallback);
    }
    let width = ratio
        .0
        .checked_mul(scale)
        .ok_or(ProcessorError::ArithmeticOverflow)?;
    let height = ratio
        .1
        .checked_mul(scale)
        .ok_or(ProcessorError::ArithmeticOverflow)?;
    Ok(CropRectangle {
        x: (source_width - width) / 2,
        y: (source_height - height) / 2,
        width,
        height,
    })
}

fn encode_pixels(pixels: &RgbaImage) -> Result<(Vec<u8>, OutputFormat), ProcessorError> {
    let contains_alpha = pixels.pixels().any(|pixel| pixel.0[3] != 255);
    let mut output = Vec::new();
    if contains_alpha {
        image::codecs::png::PngEncoder::new(&mut output)
            .write_image(
                pixels.as_raw(),
                pixels.width(),
                pixels.height(),
                ExtendedColorType::Rgba8,
            )
            .map_err(|_| ProcessorError::EncodeFailure)?;
        Ok((output, OutputFormat::Png))
    } else {
        let rgb = DynamicImage::ImageRgba8(pixels.clone()).to_rgb8();
        JpegEncoder::new_with_quality(&mut output, JPEG_QUALITY)
            .encode(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                ExtendedColorType::Rgb8,
            )
            .map_err(|_| ProcessorError::EncodeFailure)?;
        Ok((output, OutputFormat::Jpeg))
    }
}
