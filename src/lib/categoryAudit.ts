import { parseTextLabelArray } from "../backend/json";
import type { Image, Performer, Video } from "../backend/types";

export type CategoryAuditRow = {
  name: string;
  videos: number;
  images: number;
  performers: number;
  total: number;
};

export type CategoryAuditSummary = {
  rows: CategoryAuditRow[];
  totalUnique: number;
  videoCategories: number;
  imageCategories: number;
  performerCategories: number;
};

type CategorySource = "videos" | "images" | "performers";
type CategoryRecord = Pick<Video | Image | Performer, "categoriesJson"> | {
  categoriesJson?: string | null;
};

export function buildCategoryAudit(input: {
  videos: CategoryRecord[];
  images: CategoryRecord[];
  performers: CategoryRecord[];
}): CategoryAuditSummary {
  const rowsByKey = new Map<string, CategoryAuditRow>();

  collectCategoryUsage(rowsByKey, input.videos, "videos");
  collectCategoryUsage(rowsByKey, input.images, "images");
  collectCategoryUsage(rowsByKey, input.performers, "performers");

  const rows = [...rowsByKey.values()]
    .map((row) => ({
      ...row,
      total: row.videos + row.images + row.performers,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    rows,
    totalUnique: rows.length,
    videoCategories: rows.filter((row) => row.videos > 0).length,
    imageCategories: rows.filter((row) => row.images > 0).length,
    performerCategories: rows.filter((row) => row.performers > 0).length,
  };
}

function collectCategoryUsage(
  rowsByKey: Map<string, CategoryAuditRow>,
  records: CategoryRecord[],
  source: CategorySource,
) {
  for (const record of records) {
    const namesInRecord = normalizeCategoryNames(record.categoriesJson);

    for (const name of namesInRecord) {
      const key = name.toLowerCase();
      const row =
        rowsByKey.get(key) ??
        rowsByKey
          .set(key, { name, videos: 0, images: 0, performers: 0, total: 0 })
          .get(key);

      if (row) {
        row[source] += 1;
      }
    }
  }
}

function normalizeCategoryNames(categoriesJson: string | null | undefined) {
  const namesByKey = new Map<string, string>();

  for (const label of parseTextLabelArray(categoriesJson)) {
    const name = label.trim();
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (!namesByKey.has(key)) {
      namesByKey.set(key, name);
    }
  }

  return [...namesByKey.values()];
}
