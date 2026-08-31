use std::{
    fs,
    io::BufWriter,
    path::{Path, PathBuf},
};

use image::{
    codecs::jpeg::JpegEncoder,
    imageops::{overlay, resize, FilterType},
    DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat, Rgb, RgbImage,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSheetGenerateInput {
    pub source_identity: String,
    pub grid: u8,
    pub width: u32,
    pub quality: u8,
    pub timestamp: bool,
    pub header: bool,
    pub format: ContactSheetFormat,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContactSheetFormat {
    Jpeg,
    Png,
}

impl ContactSheetFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
        }
    }
}

#[derive(Debug, Clone)]
pub struct TrustedContactSheetRequest {
    pub source_identity: String,
    pub canonical_path: PathBuf,
    pub display_name: String,
    pub grid: u8,
    pub width: u32,
    pub quality: u8,
    pub timestamp: bool,
    pub header: bool,
    pub format: ContactSheetFormat,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSheetGenerationResult {
    pub request_id: String,
    pub preview_path: String,
    pub format: ContactSheetFormat,
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub sample_seconds: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSheetExtractionRequest {
    pub source_path: String,
    pub grid: u8,
    pub frame_directory: String,
    pub result_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSheetExtractionResult {
    pub duration_seconds: f64,
    pub sample_seconds: Vec<f64>,
    pub frame_paths: Vec<String>,
}

pub fn validate_request(input: &ContactSheetGenerateInput) -> Result<(), String> {
    if !matches!(input.grid, 3 | 4 | 5) {
        return Err("CONTACT_SHEET_GRID_INVALID".into());
    }
    if !(640..=3840).contains(&input.width) {
        return Err("CONTACT_SHEET_WIDTH_INVALID".into());
    }
    if !(1..=100).contains(&input.quality) {
        return Err("CONTACT_SHEET_QUALITY_INVALID".into());
    }
    Ok(())
}

pub fn sample_schedule(duration_seconds: f64, count: usize) -> Result<Vec<f64>, String> {
    if !duration_seconds.is_finite() || duration_seconds <= 0.0 {
        return Err("CONTACT_SHEET_DURATION_INVALID".into());
    }
    if count == 0 || count > 25 {
        return Err("CONTACT_SHEET_SAMPLE_COUNT_INVALID".into());
    }
    if count == 1 {
        return Ok(vec![duration_seconds * 0.5]);
    }
    Ok((0..count)
        .map(|index| {
            let fraction = 0.05 + 0.90 * index as f64 / (count - 1) as f64;
            (duration_seconds * fraction).clamp(0.0, duration_seconds)
        })
        .collect())
}

pub fn compose_contact_sheet(
    request: &TrustedContactSheetRequest,
    extraction: &ContactSheetExtractionResult,
    output_path: &Path,
) -> Result<(u32, u32), String> {
    let expected = usize::from(request.grid) * usize::from(request.grid);
    if extraction.frame_paths.len() != expected || extraction.sample_seconds.len() != expected {
        return Err("CONTACT_SHEET_FRAME_SET_INCOMPLETE".into());
    }
    let gap = 6u32;
    let header_height = if request.header { 42 } else { 0 };
    let inner_width = request
        .width
        .saturating_sub(gap * (u32::from(request.grid) + 1));
    let cell_width = inner_width / u32::from(request.grid);
    let first = image::open(&extraction.frame_paths[0])
        .map_err(|error| format!("CONTACT_SHEET_FRAME_INVALID: {error}"))?;
    let ratio = first.width() as f64 / first.height().max(1) as f64;
    let cell_height = ((cell_width as f64 / ratio).round() as u32).max(1);
    let height =
        header_height + gap * (u32::from(request.grid) + 1) + cell_height * u32::from(request.grid);
    let mut sheet = RgbImage::from_pixel(request.width, height, Rgb([15, 23, 42]));
    if request.header {
        draw_text(
            &mut sheet,
            12,
            12,
            &request.display_name,
            2,
            Rgb([241, 245, 249]),
        );
    }
    for (index, frame_path) in extraction.frame_paths.iter().enumerate() {
        let frame = image::open(frame_path)
            .map_err(|error| format!("CONTACT_SHEET_FRAME_INVALID: {error}"))?
            .to_rgb8();
        let resized = resize(&frame, cell_width, cell_height, FilterType::Lanczos3);
        let column = index as u32 % u32::from(request.grid);
        let row = index as u32 / u32::from(request.grid);
        let x = gap + column * (cell_width + gap);
        let y = header_height + gap + row * (cell_height + gap);
        overlay(&mut sheet, &resized, i64::from(x), i64::from(y));
        if request.timestamp {
            let label = format_timestamp(extraction.sample_seconds[index]);
            let text_width = label.chars().count() as u32 * 12 + 8;
            let box_x = x + cell_width.saturating_sub(text_width + 5);
            let box_y = y + cell_height.saturating_sub(22);
            fill_rect(&mut sheet, box_x, box_y, text_width, 18, Rgb([0, 0, 0]));
            draw_text(
                &mut sheet,
                box_x + 4,
                box_y + 4,
                &label,
                1,
                Rgb([255, 255, 255]),
            );
        }
    }
    let image = DynamicImage::ImageRgb8(sheet);
    match request.format {
        ContactSheetFormat::Png => image
            .save_with_format(output_path, ImageFormat::Png)
            .map_err(|error| format!("CONTACT_SHEET_ENCODE_FAILED: {error}"))?,
        ContactSheetFormat::Jpeg => {
            let file = fs::File::create(output_path)
                .map_err(|error| format!("CONTACT_SHEET_OUTPUT_CREATE_FAILED: {error}"))?;
            let mut writer = BufWriter::new(file);
            JpegEncoder::new_with_quality(&mut writer, request.quality)
                .write_image(
                    image.as_bytes(),
                    image.width(),
                    image.height(),
                    ExtendedColorType::Rgb8,
                )
                .map_err(|error| format!("CONTACT_SHEET_ENCODE_FAILED: {error}"))?;
        }
    }
    Ok((request.width, height))
}

pub fn cleanup_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("CONTACT_SHEET_CLEANUP_FAILED: {error}"))?;
    }
    Ok(())
}

fn format_timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0).round() as u64;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;
    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn fill_rect(image: &mut RgbImage, x: u32, y: u32, width: u32, height: u32, color: Rgb<u8>) {
    for row in y..(y + height).min(image.height()) {
        for column in x..(x + width).min(image.width()) {
            image.put_pixel(column, row, color);
        }
    }
}

fn draw_text(image: &mut RgbImage, x: u32, y: u32, text: &str, scale: u32, color: Rgb<u8>) {
    let mut cursor = x;
    for character in text.to_ascii_uppercase().chars().take(80) {
        let glyph = glyph(character);
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..5u32 {
                if bits & (1 << (4 - column)) == 0 {
                    continue;
                }
                fill_rect(
                    image,
                    cursor + column * scale,
                    y + row as u32 * scale,
                    scale,
                    scale,
                    color,
                );
            }
        }
        cursor = cursor.saturating_add(6 * scale);
        if cursor >= image.width() {
            break;
        }
    }
}

fn glyph(character: char) -> [u8; 7] {
    match character {
        '0' => [14, 17, 19, 21, 25, 17, 14],
        '1' => [4, 12, 4, 4, 4, 4, 14],
        '2' => [14, 17, 1, 2, 4, 8, 31],
        '3' => [30, 1, 1, 14, 1, 1, 30],
        '4' => [2, 6, 10, 18, 31, 2, 2],
        '5' => [31, 16, 16, 30, 1, 1, 30],
        '6' => [14, 16, 16, 30, 17, 17, 14],
        '7' => [31, 1, 2, 4, 8, 8, 8],
        '8' => [14, 17, 17, 14, 17, 17, 14],
        '9' => [14, 17, 17, 15, 1, 1, 14],
        'A' => [14, 17, 17, 31, 17, 17, 17],
        'B' => [30, 17, 17, 30, 17, 17, 30],
        'C' => [14, 17, 16, 16, 16, 17, 14],
        'D' => [30, 17, 17, 17, 17, 17, 30],
        'E' => [31, 16, 16, 30, 16, 16, 31],
        'F' => [31, 16, 16, 30, 16, 16, 16],
        'G' => [14, 17, 16, 23, 17, 17, 15],
        'H' => [17, 17, 17, 31, 17, 17, 17],
        'I' => [14, 4, 4, 4, 4, 4, 14],
        'J' => [7, 2, 2, 2, 18, 18, 12],
        'K' => [17, 18, 20, 24, 20, 18, 17],
        'L' => [16, 16, 16, 16, 16, 16, 31],
        'M' => [17, 27, 21, 21, 17, 17, 17],
        'N' => [17, 25, 25, 21, 19, 19, 17],
        'O' => [14, 17, 17, 17, 17, 17, 14],
        'P' => [30, 17, 17, 30, 16, 16, 16],
        'Q' => [14, 17, 17, 17, 21, 18, 13],
        'R' => [30, 17, 17, 30, 20, 18, 17],
        'S' => [15, 16, 16, 14, 1, 1, 30],
        'T' => [31, 4, 4, 4, 4, 4, 4],
        'U' => [17, 17, 17, 17, 17, 17, 14],
        'V' => [17, 17, 17, 17, 17, 10, 4],
        'W' => [17, 17, 17, 21, 21, 21, 10],
        'X' => [17, 17, 10, 4, 10, 17, 17],
        'Y' => [17, 17, 10, 4, 4, 4, 4],
        'Z' => [31, 1, 2, 4, 8, 16, 31],
        ':' => [0, 4, 4, 0, 4, 4, 0],
        '-' => [0, 0, 0, 31, 0, 0, 0],
        '.' => [0, 0, 0, 0, 0, 6, 6],
        '/' => [1, 2, 2, 4, 8, 8, 16],
        ' ' => [0; 7],
        _ => [14, 17, 2, 4, 4, 0, 4],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn schedules_at_five_to_ninety_five_percent() {
        let samples = sample_schedule(100.0, 9).unwrap();
        assert_eq!(samples.len(), 9);
        assert!((samples[0] - 5.0).abs() < f64::EPSILON);
        assert!((samples[8] - 95.0).abs() < f64::EPSILON);
        assert!(samples.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn accepts_only_approved_grids_and_bounded_counts() {
        assert!(sample_schedule(10.0, 25).is_ok());
        assert!(sample_schedule(10.0, 26).is_err());
        assert!(sample_schedule(0.0, 9).is_err());
    }

    #[test]
    fn composes_real_frames_into_a_valid_jpeg_with_requested_timestamps() {
        let root = std::env::temp_dir().join(format!(
            "sakurava-contact-sheet-compose-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut frame_paths = Vec::new();
        for index in 0..9u8 {
            let frame = root.join(format!("frame-{index}.png"));
            RgbImage::from_pixel(160, 90, Rgb([index.saturating_mul(20), 40, 180]))
                .save(&frame)
                .unwrap();
            frame_paths.push(frame.display().to_string());
        }
        let request = TrustedContactSheetRequest {
            source_identity: "V-TEST".into(),
            canonical_path: root.join("fixture.mp4"),
            display_name: "Composition Fixture".into(),
            grid: 3,
            width: 900,
            quality: 90,
            timestamp: true,
            header: false,
            format: ContactSheetFormat::Jpeg,
        };
        let extraction = ContactSheetExtractionResult {
            duration_seconds: 100.0,
            sample_seconds: sample_schedule(100.0, 9).unwrap(),
            frame_paths,
        };
        let output = root.join("sheet.jpg");
        let (width, height) = compose_contact_sheet(&request, &extraction, &output).unwrap();
        let bytes = fs::read(&output).unwrap();
        assert_eq!(width, 900);
        assert!(height > 0);
        assert!(bytes.starts_with(&[0xff, 0xd8, 0xff]));
        assert_eq!(image::open(&output).unwrap().dimensions(), (width, height));
        fs::remove_dir_all(root).unwrap();
    }
}
