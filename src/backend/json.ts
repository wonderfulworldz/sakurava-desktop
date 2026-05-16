const EMPTY_ARRAY_JSON = "[]";
const EMPTY_OBJECT_JSON = "{}";

export type RelatedPerformerReference = {
  performerId: string;
  nameSnapshot: string;
};

export type RelatedCatalogRecordReference = {
  recordId: string;
  titleSnapshot: string;
};

const MAX_PERFORMER_THUMBNAIL_PATHS = 4;

export function safeParseJson(value: string | null | undefined): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function parseTextLabelArray(value: string | null | undefined): string[] {
  const parsed = safeParseJson(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === "string");
}

export function stringifyTextLabelArray(labels: readonly string[]): string {
  const normalized = labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  return JSON.stringify(normalized);
}

export function parsePerformerThumbnailPathArray(
  value: string | null | undefined,
): string[] {
  const parsed = safeParseJson(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const paths: string[] = [];

  for (const item of parsed) {
    if (typeof item !== "string") {
      continue;
    }

    const path = item.trim();
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    paths.push(path);

    if (paths.length >= MAX_PERFORMER_THUMBNAIL_PATHS) {
      break;
    }
  }

  return paths;
}

export function parseGalleryImagePathArray(
  value: string | null | undefined,
): string[] {
  const parsed = safeParseJson(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const paths: string[] = [];

  for (const item of parsed) {
    if (typeof item !== "string") {
      continue;
    }

    const path = item.trim();
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    paths.push(path);
  }

  return paths;
}

export function stringifyGalleryImagePathArray(paths: readonly string[]): string {
  return JSON.stringify(normalizeGalleryImagePaths(paths));
}

export function normalizeGalleryImagePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of paths) {
    const path = item.trim();
    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);
    normalized.push(path);
  }

  return normalized;
}

export function normalizeGalleryImagePathsJson(
  value: string | null | undefined,
): string {
  return JSON.stringify(parseGalleryImagePathArray(value));
}

export function normalizePerformerThumbnailPathsJson(
  value: string | null | undefined,
): string {
  return JSON.stringify(parsePerformerThumbnailPathArray(value));
}

export function normalizeTextLabelArrayJson(
  value: string | null | undefined,
): string {
  return JSON.stringify(parseTextLabelArray(value));
}

export function parseRelatedPerformerArray(
  value: string | null | undefined,
): RelatedPerformerReference[] {
  const parsed = safeParseJson(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const references: RelatedPerformerReference[] = [];

  for (const item of parsed) {
    if (!item || Array.isArray(item) || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const performerId =
      typeof record.performerId === "string" ? record.performerId.trim() : "";
    const nameSnapshot =
      typeof record.nameSnapshot === "string" ? record.nameSnapshot.trim() : "";

    if (!performerId && !nameSnapshot) {
      continue;
    }

    const key = performerId || nameSnapshot.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push({ performerId, nameSnapshot });
  }

  return references;
}

export function normalizeRelatedPerformersJson(
  value: string | null | undefined,
): string {
  return JSON.stringify(parseRelatedPerformerArray(value));
}

export function parseRelatedCatalogRecordArray(
  value: string | null | undefined,
): RelatedCatalogRecordReference[] {
  const parsed = safeParseJson(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const references: RelatedCatalogRecordReference[] = [];

  for (const item of parsed) {
    if (!item || Array.isArray(item) || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const recordId =
      typeof record.recordId === "string" ? record.recordId.trim() : "";
    const titleSnapshot =
      typeof record.titleSnapshot === "string"
        ? record.titleSnapshot.trim()
        : "";

    if (!recordId && !titleSnapshot) {
      continue;
    }

    const key = recordId || titleSnapshot.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push({ recordId, titleSnapshot });
  }

  return references;
}

export function normalizeRelatedCatalogRecordsJson(
  value: string | null | undefined,
): string {
  return JSON.stringify(parseRelatedCatalogRecordArray(value));
}

export function parseRatingObject(
  value: string | null | undefined,
): Record<string, unknown> {
  const parsed = safeParseJson(value);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return {};
  }

  return parsed as Record<string, unknown>;
}

export function normalizeRatingJson(value: string | null | undefined): string {
  return JSON.stringify(parseRatingObject(value));
}

export function defaultCategoriesJson(value?: string | null): string {
  return value ? normalizeTextLabelArrayJson(value) : EMPTY_ARRAY_JSON;
}

export function defaultAliasesJson(value?: string | null): string {
  return value ? normalizeTextLabelArrayJson(value) : EMPTY_ARRAY_JSON;
}

export function defaultRatingJson(value?: string | null): string {
  return value ? normalizeRatingJson(value) : EMPTY_OBJECT_JSON;
}

export function defaultRelatedPerformersJson(value?: string | null): string {
  return value ? normalizeRelatedPerformersJson(value) : EMPTY_ARRAY_JSON;
}

export function defaultRelatedCatalogRecordsJson(value?: string | null): string {
  return value ? normalizeRelatedCatalogRecordsJson(value) : EMPTY_ARRAY_JSON;
}

export function defaultGalleryImagePathsJson(value?: string | null): string {
  return value ? normalizeGalleryImagePathsJson(value) : EMPTY_ARRAY_JSON;
}

export function defaultPerformerThumbnailPathsJson(value?: string | null): string {
  return value ? normalizePerformerThumbnailPathsJson(value) : EMPTY_ARRAY_JSON;
}
