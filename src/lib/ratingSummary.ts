export type RatingDimension = {
  key: string;
  label: string;
  value: number;
};

export type RatingFieldLabel = {
  name: string;
  label: string;
};

export type RatingSummary = {
  dimensions: RatingDimension[];
  average: number | null;
  displayScore: string | null;
  bucket: number | null;
  isRated: boolean;
};

export function parseRatingJson(
  ratingJson: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!ratingJson) {
    return null;
  }

  if (typeof ratingJson === "object" && !Array.isArray(ratingJson)) {
    return ratingJson;
  }

  if (typeof ratingJson !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(ratingJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function normalizeRatingScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value >= 1 && value <= 5 ? value : null;
}

export function getRatingDimensions(
  ratingJson: string | Record<string, unknown> | null | undefined,
  fields: RatingFieldLabel[] = [],
): RatingDimension[] {
  const rating = parseRatingJson(ratingJson);
  if (!rating) {
    return [];
  }

  const labelByKey = new Map(
    fields
      .map((field) => [field.name, field.label.trim()] as const)
      .filter(([, label]) => label.length > 0),
  );

  return Object.entries(rating)
    .map(([key, rawValue]) => {
      const value = normalizeRatingScore(rawValue);
      const label = labelByKey.get(key) ?? formatRatingKey(key);
      return value === null || !label ? null : { key, label, value };
    })
    .filter((dimension): dimension is RatingDimension => dimension !== null);
}

export function calculateAverageRating(
  dimensions: Pick<RatingDimension, "value">[],
): number | null {
  const validValues = dimensions
    .map((dimension) => normalizeRatingScore(dimension.value))
    .filter((value): value is number => value !== null);

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

export function getRatingBucket(average: number | null | undefined): number | null {
  if (typeof average !== "number" || !Number.isFinite(average)) {
    return null;
  }

  if (average < 1 || average > 5) {
    return null;
  }

  return average === 5 ? 5 : Math.floor(average);
}

export function createRatingSummary(
  ratingJson: string | Record<string, unknown> | null | undefined,
  fields: RatingFieldLabel[] = [],
): RatingSummary {
  const dimensions = getRatingDimensions(ratingJson, fields);
  const average = calculateAverageRating(dimensions);
  const bucket = getRatingBucket(average);

  return {
    dimensions,
    average,
    bucket,
    displayScore: average === null ? null : `${average.toFixed(1)} / 5`,
    isRated: average !== null,
  };
}

function formatRatingKey(key: string) {
  const label = key
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ");

  if (!label) {
    return "";
  }

  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}
