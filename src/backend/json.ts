const EMPTY_ARRAY_JSON = "[]";
const EMPTY_OBJECT_JSON = "{}";

export type RelatedPerformerReference = {
  performerId: string;
  nameSnapshot: string;
};

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
