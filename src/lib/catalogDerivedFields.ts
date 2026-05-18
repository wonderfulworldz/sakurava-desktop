type UnknownRecord = Record<string, unknown>;

const QUALITY_BUCKETS = ["SD", "HD", "FHD", "2K", "4K", "8K"] as const;

export type QualityBucket = (typeof QUALITY_BUCKETS)[number];

export function deriveReleaseYear(value: string | null | undefined) {
  return yearFromText(value);
}

export function deriveQualityBucket(record: unknown): QualityBucket | null {
  if (!isRecord(record)) {
    return null;
  }

  const directQuality = directQualityBucket(
    textValue(record.quality) ?? textValue(record.qualityLabel),
  );
  if (directQuality) {
    return directQuality;
  }

  const resolutionText =
    textValue(record.resolution) ??
    textValue(record.resolutionLabel) ??
    textValue(record.mainResolution) ??
    textValue(record.videoResolution);
  const resolutionFromText = resolutionText
    ? dimensionsFromResolutionText(resolutionText)
    : null;
  const dimensions =
    resolutionFromText ??
    dimensionsFromWidthHeight(
      numberValue(record.width) ??
        numberValue(record.videoWidth) ??
        numberValue(record.imageWidth) ??
        numberValue(record.mainWidth),
      numberValue(record.height) ??
        numberValue(record.videoHeight) ??
        numberValue(record.imageHeight) ??
        numberValue(record.mainHeight),
    );

  return dimensions ? qualityFromHeight(dimensions.height) : null;
}

export function deriveDebutYear(record: unknown) {
  if (!isRecord(record)) {
    return null;
  }

  return (
    yearFromValue(record.debutYear) ??
    yearFromValue(record.debutDate) ??
    yearFromValue(record.startYear) ??
    yearFromValue(record.yearsActive)
  );
}

function directQualityBucket(value: string | null): QualityBucket | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized === "FULLHD" || normalized === "1080P") {
    return "FHD";
  }

  if (normalized === "2160P" || normalized === "UHD" || normalized === "ULTRAHD") {
    return "4K";
  }

  if (normalized === "4320P") {
    return "8K";
  }

  return QUALITY_BUCKETS.find((bucket) => bucket === normalized) ?? null;
}

function qualityFromHeight(height: number): QualityBucket | null {
  if (!Number.isFinite(height) || height <= 0) {
    return null;
  }

  if (height >= 4320) {
    return "8K";
  }

  if (height >= 2160) {
    return "4K";
  }

  if (height >= 1440) {
    return "2K";
  }

  if (height >= 1080) {
    return "FHD";
  }

  if (height >= 720) {
    return "HD";
  }

  return "SD";
}

function dimensionsFromResolutionText(value: string) {
  const match = value.match(/(\d{3,5})\s*[xX×]\s*(\d{3,5})/);
  if (!match) {
    return null;
  }

  return dimensionsFromWidthHeight(Number(match[1]), Number(match[2]));
}

function dimensionsFromWidthHeight(width: number | null, height: number | null) {
  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function yearFromValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1000 && value <= 9999 ? value : null;
  }

  return yearFromText(textValue(value));
}

function yearFromText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
