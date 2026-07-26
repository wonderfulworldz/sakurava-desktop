use std::io::Cursor;
use std::time::Instant;

use image::codecs::gif::{GifEncoder, Repeat};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::codecs::webp::WebPEncoder;
use image::{
    Delay, DynamicImage, ExtendedColorType, Frame, ImageDecoder, ImageEncoder, ImageFormat, Rgba,
    RgbaImage,
};

use super::contract::{FamilyId, RoleId, TierId};
use super::processor::{
    canonical_center_crop, standard_tier_is_eligible, CropRectangle, InputFormat,
    ManagedMediaProcessor, OrientationApplied, OutputFormat, ProcessorError, ProcessorLimits,
    ProcessorRequest, ProcessorVariant, JPEG_QUALITY, MAX_AXIS, MAX_DECODED_PIXELS,
    MAX_SOURCE_BYTES, PROCESSING_POLICY_VERSION, RESIZE_FILTER,
};

fn opaque_pattern(width: u32, height: u32) -> RgbaImage {
    RgbaImage::from_fn(width, height, |x, y| {
        let noise = ((x.wrapping_mul(17) ^ y.wrapping_mul(31)) & 15) as u8;
        Rgba([
            ((x * 255 / width.max(1)) as u8).saturating_add(noise / 2),
            ((y * 255 / height.max(1)) as u8).saturating_add(noise / 3),
            ((x + y) & 0xff) as u8,
            255,
        ])
    })
}

fn transparent_pattern(width: u32, height: u32) -> RgbaImage {
    RgbaImage::from_fn(width, height, |x, y| {
        Rgba([
            (x & 0xff) as u8,
            (y & 0xff) as u8,
            ((x + y) & 0xff) as u8,
            if (x + y) % 7 == 0 { 96 } else { 255 },
        ])
    })
}

fn encode_png(image: &RgbaImage) -> Vec<u8> {
    let mut output = Vec::new();
    PngEncoder::new(&mut output)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .expect("png");
    output
}

fn encode_png_with_icc(image: &RgbaImage) -> Vec<u8> {
    let mut output = Vec::new();
    let mut encoder = PngEncoder::new(&mut output);
    encoder
        .set_icc_profile(vec![0, 0, 0, 4, b't', b'e', b's', b't'])
        .expect("set profile");
    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .expect("profile png");
    output
}

fn encode_jpeg(image: &RgbaImage) -> Vec<u8> {
    let rgb = DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    let mut output = Vec::new();
    JpegEncoder::new_with_quality(&mut output, 92)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            ExtendedColorType::Rgb8,
        )
        .expect("jpeg");
    output
}

fn encode_webp(image: &RgbaImage) -> Vec<u8> {
    let mut output = Vec::new();
    WebPEncoder::new_lossless(&mut output)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .expect("webp");
    output
}

fn encode_animated_gif(first: &RgbaImage, second: &RgbaImage) -> Vec<u8> {
    let mut output = Vec::new();
    {
        let mut encoder = GifEncoder::new(&mut output);
        encoder.set_repeat(Repeat::Infinite).expect("repeat");
        encoder
            .encode_frame(Frame::from_parts(
                first.clone(),
                0,
                0,
                Delay::from_numer_denom_ms(100, 1),
            ))
            .expect("first");
        encoder
            .encode_frame(Frame::from_parts(
                second.clone(),
                0,
                0,
                Delay::from_numer_denom_ms(100, 1),
            ))
            .expect("second");
    }
    output
}

fn process(bytes: &[u8], role: RoleId, tier: TierId) -> super::processor::ProcessorResult {
    ManagedMediaProcessor::default()
        .process(ProcessorRequest {
            source_bytes: bytes,
            role,
            tier,
        })
        .expect("processed")
}

fn inject_exif_orientations(jpeg: &[u8], values: &[u16]) -> Vec<u8> {
    assert!(jpeg.starts_with(&[0xff, 0xd8]));
    let mut tiff = Vec::new();
    tiff.extend_from_slice(b"II");
    tiff.extend_from_slice(&42_u16.to_le_bytes());
    tiff.extend_from_slice(&8_u32.to_le_bytes());
    tiff.extend_from_slice(&(values.len() as u16).to_le_bytes());
    for value in values {
        tiff.extend_from_slice(&0x0112_u16.to_le_bytes());
        tiff.extend_from_slice(&3_u16.to_le_bytes());
        tiff.extend_from_slice(&1_u32.to_le_bytes());
        tiff.extend_from_slice(&value.to_le_bytes());
        tiff.extend_from_slice(&0_u16.to_le_bytes());
    }
    tiff.extend_from_slice(&0_u32.to_le_bytes());
    let mut payload = b"Exif\0\0".to_vec();
    payload.extend_from_slice(&tiff);
    let length = u16::try_from(payload.len() + 2).expect("APP1 length");

    let mut output = vec![0xff, 0xd8, 0xff, 0xe1];
    output.extend_from_slice(&length.to_be_bytes());
    output.extend_from_slice(&payload);
    output.extend_from_slice(&jpeg[2..]);
    output
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb8_8320_u32 & (0_u32.wrapping_sub(crc & 1)));
        }
    }
    !crc
}

fn png_header(width: u32, height: u32) -> Vec<u8> {
    let mut output = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut chunk = b"IHDR".to_vec();
    chunk.extend_from_slice(&width.to_be_bytes());
    chunk.extend_from_slice(&height.to_be_bytes());
    chunk.extend_from_slice(&[8, 6, 0, 0, 0]);
    output.extend_from_slice(&13_u32.to_be_bytes());
    output.extend_from_slice(&chunk);
    output.extend_from_slice(&crc32(&chunk).to_be_bytes());
    output
}

fn psnr(expected: &RgbaImage, actual: &RgbaImage) -> f64 {
    assert_eq!(expected.dimensions(), actual.dimensions());
    let mut squared_error = 0_f64;
    let mut samples = 0_u64;
    for (left, right) in expected.pixels().zip(actual.pixels()) {
        for channel in 0..3 {
            let delta = f64::from(left.0[channel]) - f64::from(right.0[channel]);
            squared_error += delta * delta;
            samples += 1;
        }
    }
    if squared_error == 0.0 {
        return f64::INFINITY;
    }
    let mse = squared_error / samples as f64;
    10.0 * ((255_f64 * 255_f64) / mse).log10()
}

#[test]
fn supports_the_exact_input_allowlist_and_gif_first_frame() {
    let first = opaque_pattern(320, 180);
    let mut second = RgbaImage::from_pixel(320, 180, Rgba([240, 5, 5, 255]));
    second.put_pixel(0, 0, Rgba([0, 255, 0, 255]));

    let jpeg = process(&encode_jpeg(&first), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(jpeg.input_format, InputFormat::Jpeg);
    let png = process(&encode_png(&first), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(png.input_format, InputFormat::Png);
    let gif = process(
        &encode_animated_gif(&first, &second),
        RoleId::VideoTable,
        TierId::Thumbnail,
    );
    assert_eq!(gif.input_format, InputFormat::Gif);
    assert!(gif.input_was_animated);
    let gif_reopened = image::load_from_memory_with_format(&gif.output_bytes, ImageFormat::Jpeg)
        .expect("gif output")
        .to_rgb8();
    let center = gif_reopened.get_pixel(160, 90).0;
    assert!(
        !(center[0] > 220 && center[1] < 30 && center[2] < 30),
        "second GIF frame was selected instead of the first"
    );
    let webp = process(&encode_webp(&first), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(webp.input_format, InputFormat::WebP);
    assert!(!webp.input_was_animated);
}

#[test]
fn rejects_empty_unknown_unsupported_and_truncated_sources() {
    let processor = ManagedMediaProcessor::default();
    let request = |bytes| ProcessorRequest {
        source_bytes: bytes,
        role: RoleId::VideoTable,
        tier: TierId::Thumbnail,
    };
    assert!(matches!(
        processor.process(request(&[])),
        Err(ProcessorError::EmptySource)
    ));
    assert!(matches!(
        processor.process(request(b"not an image")),
        Err(ProcessorError::UnknownFormat)
    ));
    assert!(matches!(
        processor.process(request(b"BM\0\0\0\0\0\0")),
        Err(ProcessorError::UnsupportedFormat)
    ));
    assert!(matches!(
        processor.process(request(&[0xff, 0xd8, 0xff, 0xe0, 0, 16])),
        Err(ProcessorError::InvalidOrTruncatedImage)
    ));
}

#[test]
fn enforces_source_axis_pixel_and_zero_dimension_limits_before_decode() {
    let processor = ManagedMediaProcessor::default();
    let request = |bytes| ProcessorRequest {
        source_bytes: bytes,
        role: RoleId::VideoTable,
        tier: TierId::Thumbnail,
    };
    let source_limit_processor = ManagedMediaProcessor::with_limits(ProcessorLimits {
        maximum_source_bytes: 7,
        ..ProcessorLimits::default()
    });
    assert!(matches!(
        source_limit_processor.process(request(b"12345678")),
        Err(ProcessorError::SourceTooLarge { limit: 7 })
    ));
    let over_axis = encode_png(&RgbaImage::from_pixel(100, 1, Rgba([1, 2, 3, 255])));
    let axis_limited = ManagedMediaProcessor::with_limits(ProcessorLimits {
        maximum_axis: 99,
        ..ProcessorLimits::default()
    });
    let over_axis_error = axis_limited
        .process(request(&over_axis))
        .expect_err("over-axis rejection");
    assert!(
        matches!(over_axis_error, ProcessorError::DimensionsTooLarge),
        "unexpected over-axis error: {over_axis_error:?}"
    );
    let over_pixels = encode_png(&RgbaImage::from_pixel(100, 100, Rgba([1, 2, 3, 255])));
    let pixel_limited = ManagedMediaProcessor::with_limits(ProcessorLimits {
        maximum_decoded_pixels: 9_999,
        ..ProcessorLimits::default()
    });
    assert!(matches!(
        pixel_limited.process(request(&over_pixels)),
        Err(ProcessorError::PixelCountTooLarge)
    ));
    let zero_width = png_header(0, 1);
    assert!(matches!(
        processor.process(request(&zero_width)),
        Err(ProcessorError::InvalidOrTruncatedImage) | Err(ProcessorError::ZeroDimensions)
    ));
    assert_eq!(MAX_SOURCE_BYTES, 256 * 1024 * 1024);
    assert_eq!(MAX_DECODED_PIXELS, 64_000_000);
    assert_eq!(MAX_AXIS, 32_768);
}

#[test]
fn normalizes_all_exif_orientations_and_rejects_malformed_or_conflicting_values() {
    let landscape = opaque_pattern(320, 180);
    let portrait = opaque_pattern(180, 320);
    for value in 1_u16..=8 {
        let stored = if matches!(value, 5..=8) {
            &portrait
        } else {
            &landscape
        };
        let bytes = inject_exif_orientations(&encode_jpeg(stored), &[value]);
        let result = process(&bytes, RoleId::VideoTable, TierId::Thumbnail);
        assert_eq!(result.orientation_applied.exif_value(), value as u8);
        assert_eq!((result.width, result.height), (320, 180));
        assert_eq!(
            (
                result.normalized_source_width,
                result.normalized_source_height
            ),
            (320, 180)
        );
    }

    let absent = process(
        &encode_jpeg(&landscape),
        RoleId::VideoTable,
        TierId::Thumbnail,
    );
    assert_eq!(absent.orientation_applied, OrientationApplied::Identity);

    let processor = ManagedMediaProcessor::default();
    for bytes in [
        inject_exif_orientations(&encode_jpeg(&landscape), &[9]),
        inject_exif_orientations(&encode_jpeg(&landscape), &[1, 3]),
    ] {
        assert!(matches!(
            processor.process(ProcessorRequest {
                source_bytes: &bytes,
                role: RoleId::VideoTable,
                tier: TierId::Thumbnail,
            }),
            Err(ProcessorError::MalformedOrientation)
        ));
    }
}

#[test]
fn calculates_integer_safe_centered_crops_without_stretch() {
    assert_eq!(
        canonical_center_crop(403, 303, (4, 3)).expect("odd crop"),
        CropRectangle {
            x: 1,
            y: 1,
            width: 400,
            height: 300,
        }
    );
    assert_eq!(
        canonical_center_crop(321, 180, (16, 9)).expect("one pixel remainder"),
        CropRectangle {
            x: 0,
            y: 0,
            width: 320,
            height: 180,
        }
    );
    assert_eq!(
        canonical_center_crop(301, 500, (4, 5)).expect("portrait"),
        CropRectangle {
            x: 0,
            y: 62,
            width: 300,
            height: 375,
        }
    );

    let mut marker = RgbaImage::from_pixel(321, 180, Rgba([20, 30, 40, 255]));
    marker.put_pixel(160, 90, Rgba([255, 0, 0, 64]));
    let result = process(&encode_png(&marker), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(result.output_format, OutputFormat::Png);
    let reopened = image::load_from_memory_with_format(&result.output_bytes, ImageFormat::Png)
        .expect("reopen")
        .to_rgba8();
    assert_eq!(reopened.get_pixel(160, 90), &Rgba([255, 0, 0, 64]));
}

#[test]
fn produces_every_approved_contract_target_dimension() {
    let targets = [
        (RoleId::VideoDetailPrimary, TierId::Thumbnail, 320, 180),
        (RoleId::VideoDetailPrimary, TierId::Medium, 1280, 720),
        (RoleId::VideoDetailPrimary, TierId::Large, 1920, 1080),
        (RoleId::VideoLiteCard, TierId::Thumbnail, 320, 240),
        (RoleId::VideoLiteCard, TierId::Medium, 1280, 960),
        (RoleId::ImageGalleryTile, TierId::Thumbnail, 320, 320),
        (RoleId::ImageGalleryTile, TierId::Medium, 1280, 1280),
        (RoleId::PerformerDetailPrimary, TierId::Thumbnail, 256, 320),
        (RoleId::PerformerDetailPrimary, TierId::Medium, 1024, 1280),
        (RoleId::PerformerDetailPrimary, TierId::Large, 1536, 1920),
    ];
    for (role, tier, width, height) in targets {
        let source = RgbaImage::from_pixel(width, height, Rgba([40, 80, 120, 255]));
        let result = process(&encode_png(&source), role, tier);
        assert_eq!((result.width, result.height), (width, height));
        assert_eq!(result.variant, ProcessorVariant::Standard(tier));
        assert_eq!(
            u64::from(result.width) * u64::from(height),
            u64::from(result.height) * u64::from(width)
        );
    }
}

#[test]
fn checks_both_crop_dimensions_for_no_upscale_eligibility() {
    let exact = CropRectangle {
        x: 0,
        y: 0,
        width: 320,
        height: 180,
    };
    assert!(standard_tier_is_eligible(exact, (320, 180)));
    assert!(!standard_tier_is_eligible(
        CropRectangle {
            width: 319,
            ..exact
        },
        (320, 180)
    ));
    assert!(!standard_tier_is_eligible(
        CropRectangle {
            height: 179,
            ..exact
        },
        (320, 180)
    ));
    assert!(standard_tier_is_eligible(
        CropRectangle {
            width: 321,
            height: 181,
            ..exact
        },
        (320, 180)
    ));

    let between = opaque_pattern(1504, 846);
    let bytes = encode_jpeg(&between);
    assert!(ManagedMediaProcessor::default()
        .process(ProcessorRequest {
            source_bytes: &bytes,
            role: RoleId::VideoDetailPrimary,
            tier: TierId::Medium,
        })
        .is_ok());
    assert!(matches!(
        ManagedMediaProcessor::default().process(ProcessorRequest {
            source_bytes: &bytes,
            role: RoleId::VideoDetailPrimary,
            tier: TierId::Large,
        }),
        Err(ProcessorError::IneligibleStandardTier)
    ));
}

#[test]
fn prepares_native_fallback_as_a_non_tier_without_upscaling() {
    let source = transparent_pattern(300, 200);
    let result = process(&encode_png(&source), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(result.variant, ProcessorVariant::NativeFallback);
    assert_eq!(result.family, FamilyId::Landscape16_9);
    assert_eq!((result.width, result.height), (288, 162));
    assert!(result.width <= result.crop.width && result.height <= result.crop.height);
    assert_eq!(result.output_format, OutputFormat::Png);
    ManagedMediaProcessor::default()
        .validate_result(&result)
        .expect("fallback validation");
}

#[test]
fn selects_png_for_alpha_and_jpeg_quality_85_for_opaque_pixels() {
    let alpha = transparent_pattern(320, 180);
    let png = process(&encode_png(&alpha), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(png.output_format, OutputFormat::Png);
    assert_eq!(png.jpeg_quality, None);
    assert_eq!(
        image::load_from_memory_with_format(&png.output_bytes, ImageFormat::Png)
            .expect("png reopen")
            .to_rgba8(),
        alpha
    );

    let opaque = opaque_pattern(320, 180);
    let jpeg = process(&encode_png(&opaque), RoleId::VideoTable, TierId::Thumbnail);
    assert_eq!(jpeg.output_format, OutputFormat::Jpeg);
    assert_eq!(jpeg.jpeg_quality, Some(JPEG_QUALITY));
    assert_eq!(jpeg.resize_filter, RESIZE_FILTER);
}

#[test]
fn fails_closed_on_profiles_and_strips_source_metadata() {
    let source = opaque_pattern(320, 180);
    let profile = encode_png_with_icc(&source);
    assert!(matches!(
        ManagedMediaProcessor::default().process(ProcessorRequest {
            source_bytes: &profile,
            role: RoleId::VideoTable,
            tier: TierId::Thumbnail,
        }),
        Err(ProcessorError::UnsupportedColorProfile)
    ));

    let oriented = inject_exif_orientations(&encode_jpeg(&source), &[3]);
    let output = process(&oriented, RoleId::VideoTable, TierId::Thumbnail);
    let mut decoder =
        image::codecs::jpeg::JpegDecoder::new(Cursor::new(&output.output_bytes)).expect("decoder");
    assert!(decoder.icc_profile().expect("icc").is_none());
    assert!(decoder.exif_metadata().expect("exif").is_none());
    assert_eq!(
        decoder.orientation().expect("orientation"),
        image::metadata::Orientation::NoTransforms
    );
}

#[test]
fn reopens_and_validates_checksums_dimensions_and_deterministic_metadata() {
    let source = encode_png(&opaque_pattern(640, 360));
    let processor = ManagedMediaProcessor::default();
    let request = || ProcessorRequest {
        source_bytes: &source,
        role: RoleId::VideoTable,
        tier: TierId::Thumbnail,
    };
    let first = processor.process(request()).expect("first");
    let second = processor.process(request()).expect("second");
    assert_eq!(first.output_bytes, second.output_bytes);
    assert_eq!(first.output_sha256, second.output_sha256);
    assert_eq!(first.source_sha256, second.source_sha256);
    assert_eq!(first.crop, second.crop);
    assert_eq!(first.processing_policy_version, PROCESSING_POLICY_VERSION);
    processor.validate_result(&first).expect("valid");

    let mut invalid_checksum = first.clone();
    invalid_checksum.output_sha256 =
        super::identity::ValidatedSha256::new("0".repeat(64)).expect("hash");
    assert!(matches!(
        processor.validate_result(&invalid_checksum),
        Err(ProcessorError::ValidationMismatch)
    ));

    let mut invalid_length = first;
    invalid_length.byte_length += 1;
    assert!(matches!(
        processor.validate_result(&invalid_length),
        Err(ProcessorError::ValidationMismatch)
    ));
}

#[test]
fn jpeg_psnr_and_png_equality_are_deterministic_synthetic_guards() {
    let opaque = opaque_pattern(320, 180);
    let jpeg = process(&encode_png(&opaque), RoleId::VideoTable, TierId::Thumbnail);
    let reopened_jpeg = image::load_from_memory_with_format(&jpeg.output_bytes, ImageFormat::Jpeg)
        .expect("jpeg reopen")
        .to_rgba8();
    let measured_psnr = psnr(&opaque, &reopened_jpeg);
    println!("synthetic_jpeg_psnr_db={measured_psnr:.3}");
    assert!(measured_psnr >= 30.0);

    let alpha = transparent_pattern(320, 180);
    let png = process(&encode_png(&alpha), RoleId::VideoTable, TierId::Thumbnail);
    let reopened_png = image::load_from_memory_with_format(&png.output_bytes, ImageFormat::Png)
        .expect("png reopen")
        .to_rgba8();
    assert_eq!(reopened_png, alpha);
    assert!(reopened_png.pixels().any(|pixel| pixel.0[3] != 255));
}

#[test]
fn sequential_processing_retains_no_global_state() {
    let processor = ManagedMediaProcessor::default();
    let started = Instant::now();
    let mut final_checksum = None;
    for index in 0..20_u32 {
        let source = if index % 2 == 0 {
            encode_png(&opaque_pattern(320 + index, 240 + index))
        } else {
            encode_webp(&opaque_pattern(320 + index, 240 + index))
        };
        let result = processor
            .process(ProcessorRequest {
                source_bytes: &source,
                role: RoleId::VideoLiteCard,
                tier: TierId::Thumbnail,
            })
            .expect("batch item");
        final_checksum = Some(result.output_sha256);
    }
    println!(
        "sequential_batch_count=20 elapsed_ms={} final_checksum={}",
        started.elapsed().as_millis(),
        final_checksum.expect("checksum").as_str()
    );
}

#[test]
fn bounded_large_processor_probes_complete_in_memory() {
    let opaque = opaque_pattern(4000, 3000);
    let opaque_bytes = encode_jpeg(&opaque);
    let started = Instant::now();
    let landscape = process(&opaque_bytes, RoleId::VideoDetailPrimary, TierId::Large);
    println!(
        "probe=opaque_4000x3000 input_bytes={} output={}x{} output_bytes={} elapsed_ms={}",
        opaque_bytes.len(),
        landscape.width,
        landscape.height,
        landscape.output_bytes.len(),
        started.elapsed().as_millis()
    );
    assert_eq!((landscape.width, landscape.height), (1920, 1080));

    let alpha = transparent_pattern(3000, 4000);
    let alpha_bytes = encode_png(&alpha);
    let started = Instant::now();
    let portrait = process(&alpha_bytes, RoleId::PerformerDetailPrimary, TierId::Large);
    println!(
        "probe=alpha_3000x4000 input_bytes={} output={}x{} output_bytes={} elapsed_ms={}",
        alpha_bytes.len(),
        portrait.width,
        portrait.height,
        portrait.output_bytes.len(),
        started.elapsed().as_millis()
    );
    assert_eq!((portrait.width, portrait.height), (1536, 1920));
    assert_eq!(portrait.output_format, OutputFormat::Png);
}
