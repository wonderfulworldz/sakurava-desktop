import {
  buildEntityCsv,
  exportEntityLabel,
  type ExportCsvEntity,
  type ExportFormat,
} from "./exportCsv";
import {
  buildXlsxWorkbook,
  type ExportDataSelection,
} from "./exportWorkbook";
import type {
  Credit,
  Image,
  ManagedCategory,
  Performer,
  Video,
} from "../backend/types";
import type { CreditCsvRecord } from "./exportCsv";
import { formatSakuravaRef } from "./sakuravaRef";
import { parseRelatedCatalogRecordArray, parseRelatedPerformerArray, parseTextLabelArray } from "../backend/json";

export function prepareSelectionsWithPublicRefs(
  selections: ExportDataSelection[],
): ExportDataSelection[] {
  const byType = new Map(selections.map((selection) => [selection.dataType, selection.records]));
  const publicRefMaps = {
    videos: recordRefMap(byType.get("videos") ?? []),
    images: recordRefMap(byType.get("images") ?? []),
    performers: recordRefMap(byType.get("performers") ?? []),
    glossary: recordRefMap(byType.get("glossary") ?? []),
  };
  const categoryRefsByName = new Map(
    (byType.get("categories") ?? []).flatMap((record) => {
      const category = record as ManagedCategory;
      return category.sakuravaRef
        ? [[category.name.trim().toLowerCase(), category.sakuravaRef] as const]
        : [];
    }),
  );
  return selections.map((selection) => ({
    ...selection,
    records: selection.records.map((record) => {
      if (selection.dataType === "videos") {
        const video = record as Video;
        return {
          ...video,
          categoriesJson: replaceCategoryLabels(video.categoriesJson, categoryRefsByName),
          relatedPerformersJson: replaceRelationshipIds(video.relatedPerformersJson, "performerId", publicRefMaps.performers),
          relatedImagesJson: replaceRelationshipIds(video.relatedImagesJson, "recordId", publicRefMaps.images),
          glossaryRefsJson: replaceReferenceIds(video.glossaryRefsJson ?? "[]", publicRefMaps.glossary),
        };
      }
      if (selection.dataType === "images") {
        const image = record as Image;
        return {
          ...image,
          categoriesJson: replaceCategoryLabels(image.categoriesJson, categoryRefsByName),
          relatedPerformersJson: replaceRelationshipIds(image.relatedPerformersJson, "performerId", publicRefMaps.performers),
          relatedVideosJson: replaceRelationshipIds(image.relatedVideosJson, "recordId", publicRefMaps.videos),
          glossaryRefsJson: replaceReferenceIds(image.glossaryRefsJson ?? "[]", publicRefMaps.glossary),
        };
      }
      if (selection.dataType === "performers") {
        const performer = record as Performer;
        return {
          ...performer,
          categoriesJson: replaceCategoryLabels(performer.categoriesJson, categoryRefsByName),
          relatedVideosJson: replaceRelationshipIds(performer.relatedVideosJson, "recordId", publicRefMaps.videos),
          relatedImagesJson: replaceRelationshipIds(performer.relatedImagesJson, "recordId", publicRefMaps.images),
          glossaryRefsJson: replaceReferenceIds(performer.glossaryRefsJson ?? "[]", publicRefMaps.glossary),
        };
      }
      if (selection.dataType === "credits") {
        return prepareCreditExportRecord(
          record as Credit,
          publicRefMaps,
          byType.get("categories") ?? [],
        );
      }
      return record;
    }),
  }));
}

function prepareCreditExportRecord(
  credit: Credit,
  publicRefMaps: {
    videos: Map<string, string>;
    images: Map<string, string>;
    performers: Map<string, string>;
  },
  categories: unknown[],
): CreditCsvRecord {
  const categoryByKey = new Map(
    categories.flatMap((record) => {
      const category = record as ManagedCategory;
      return category.key && category.sakuravaRef
        ? [[category.key, category.sakuravaRef] as const]
        : [];
    }),
  );
  return {
    ...credit,
    workType: credit.workType === "video" ? "Video" : "Image",
    creditedAsMode: credit.creditedAsMode === "auto" ? "Auto" : "Custom",
    characterMode: credit.characterMode === "self" ? "Self" : "Text",
    workRef: formatSakuravaRef((credit.workType === "video"
      ? publicRefMaps.videos.get(credit.workId)
      : publicRefMaps.images.get(credit.workId)) ?? ""),
    performerRef: formatSakuravaRef(publicRefMaps.performers.get(credit.performerId) ?? ""),
    roleImportanceRef: credit.roleImportanceCategoryId
      ? formatSakuravaRef(categoryByKey.get(credit.roleImportanceCategoryId) ?? "")
      : "",
  };
}

function replaceCategoryLabels(text: string, references: Map<string, string>) {
  try {
    const values = JSON.parse(text) as unknown;
    if (!Array.isArray(values)) return text;
    return JSON.stringify(values.map((value) => {
      if (typeof value !== "string") return value;
      const reference = references.get(value.trim().toLowerCase());
      return reference ? `${formatSakuravaRef(reference)} | ${value}` : value;
    }));
  } catch {
    return text;
  }
}

function recordRefMap(records: unknown[]) {
  return new Map(records.flatMap((record) => {
    const value = record as { id?: string; sakuravaRef?: string };
    return value.id && value.sakuravaRef ? [[value.id, value.sakuravaRef] as const] : [];
  }));
}

function replaceRelationshipIds(
  text: string,
  field: "recordId" | "performerId",
  references: Map<string, string>,
) {
  try {
    const values = JSON.parse(text) as Array<Record<string, unknown>>;
    return JSON.stringify(values.map((value) => ({
      ...value,
      [field]: references.get(String(value[field] ?? "")) ?? value[field],
    })));
  } catch {
    return text;
  }
}

/**
 * Safe Filter's export projection.  It is deliberately applied after the
 * complete authoritative catalog is loaded and before public references are
 * serialized.  No source record is changed by this projection.
 */
export function projectSafeExportSelections(
  selections: ExportDataSelection[],
  selectedTypes: ExportCsvEntity[],
): ExportDataSelection[] {
  const all = new Map(selections.map((selection) => [selection.dataType, selection.records]));
  const categories = (all.get("categories") ?? []) as ManagedCategory[];
  const glossary = (all.get("glossary") ?? []) as Array<{ id: string; rPlus?: boolean; parentId: string }>;
  const isRestricted = (record: { rPlus?: boolean }) => record.rPlus === true;
  const videos = ((all.get("videos") ?? []) as Video[]).filter((record) => !isRestricted(record));
  const images = ((all.get("images") ?? []) as Image[]).filter((record) => !isRestricted(record));
  const performers = ((all.get("performers") ?? []) as Performer[]).filter((record) => !isRestricted(record));
  const videoIds = new Set(videos.map((record) => record.id));
  const imageIds = new Set(images.map((record) => record.id));
  const performerIds = new Set(performers.map((record) => record.id));
  const visibleGlossary = glossary.filter((entry) => !entry.rPlus);
  const glossaryIds = new Set(visibleGlossary.map((entry) => entry.id));
  const visibleCategories = categories.filter((category) => !category.rPlus);
  const categoryKeys = new Set(visibleCategories.map((category) => category.key));
  const categoryNames = new Set(visibleCategories.map((category) => category.name.trim().toLowerCase()));
  const pruneCatalog = <T extends Video | Image | Performer>(record: T): T => ({
    ...record,
    categoriesJson: JSON.stringify(parseTextLabelArray(record.categoriesJson)
      .filter((name) => categoryNames.has(name.trim().toLowerCase()))),
    glossaryRefsJson: JSON.stringify(parseTextLabelArray(record.glossaryRefsJson ?? "[]").filter((id) => glossaryIds.has(id))),
    ...("relatedPerformersJson" in record ? {
      relatedPerformersJson: JSON.stringify(parseRelatedPerformerArray(record.relatedPerformersJson)
        .filter((relation) => performerIds.has(relation.performerId))),
    } : {}),
    ...("relatedVideosJson" in record ? {
      relatedVideosJson: JSON.stringify(parseRelatedCatalogRecordArray(record.relatedVideosJson)
        .filter((relation) => videoIds.has(relation.recordId))),
    } : {}),
    ...("relatedImagesJson" in record ? {
      relatedImagesJson: JSON.stringify(parseRelatedCatalogRecordArray(record.relatedImagesJson)
        .filter((relation) => imageIds.has(relation.recordId))),
    } : {}),
  });
  const safeCredits = ((all.get("credits") ?? []) as Credit[])
    .filter((credit) =>
      (credit.workType === "video" ? videoIds.has(credit.workId) : imageIds.has(credit.workId))
        && performerIds.has(credit.performerId),
    )
    .map((credit) => ({
      ...credit,
      roleImportanceCategoryId: credit.roleImportanceCategoryId && categoryKeys.has(credit.roleImportanceCategoryId)
        ? credit.roleImportanceCategoryId
        : null,
    }));
  const projected = new Map<ExportCsvEntity, unknown[]>([
    ["videos", videos.map(pruneCatalog)],
    ["images", images.map(pruneCatalog)],
    ["performers", performers.map(pruneCatalog)],
    ["categories", visibleCategories.map((category) => ({
      ...category,
      parentKey: category.parentKey && categoryKeys.has(category.parentKey) ? category.parentKey : null,
    }))],
    ["glossary", visibleGlossary.map((entry) => ({
      ...entry,
      parentId: entry.parentId && glossaryIds.has(entry.parentId) ? entry.parentId : "",
    }))],
    ["credits", safeCredits],
  ]);
  return selectedTypes.map((dataType) => ({ dataType, records: projected.get(dataType) ?? [] }));
}

function replaceReferenceIds(text: string, references: Map<string, string>) {
  try {
    const values = JSON.parse(text) as unknown;
    if (!Array.isArray(values)) return text;
    return JSON.stringify(values.map((value) =>
      typeof value === "string" ? formatSakuravaRef(references.get(value) ?? value) : value,
    ));
  } catch {
    return text;
  }
}

export type ExportArtifact = {
  dataTypes: ExportCsvEntity[];
  format: ExportFormat;
  fileName: string;
  bytes: Uint8Array;
  recordCounts: Partial<Record<ExportCsvEntity, number>>;
};

export type ExportOperationResult = {
  cancelled: boolean;
  format: ExportFormat;
  selectedDataTypes: ExportCsvEntity[];
  exportedFileCount: number;
  recordCounts: Partial<Record<ExportCsvEntity, number>>;
  displayNames: string[];
  warnings: string[];
  errors: string[];
  destinationPath?: string;
};

export function localExportTimestamp(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${day}${month}-${hours}${minutes}${seconds}`;
}

export function exportTypeCode(dataTypes: ExportCsvEntity[]) {
  if (dataTypes.length !== 1) return "all";
  if (dataTypes[0] === "videos") return "vid";
  if (dataTypes[0] === "images") return "img";
  if (dataTypes[0] === "performers") return "per";
  if (dataTypes[0] === "glossary") return "glo";
  if (dataTypes[0] === "credits") return "cre";
  return "cat";
}

export function defaultExportFileName(
  dataTypes: ExportCsvEntity[],
  format: ExportFormat,
  date = new Date(),
  options: { explicit?: boolean } = {},
) {
  return `skv-${exportTypeCode(dataTypes)}-${localExportTimestamp(date)}${options.explicit ? "-e" : ""}.${format}`;
}

export function buildCsvExportArtifacts({
  selections,
  locale,
  date = new Date(),
  safeExport = false,
  explicit = false,
}: {
  selections: ExportDataSelection[];
  locale: string;
  date?: Date;
  safeExport?: boolean;
  explicit?: boolean;
}): ExportArtifact[] {
  return selections.map((selection) => ({
    dataTypes: [selection.dataType],
    format: "csv",
    fileName: defaultExportFileName([selection.dataType], "csv", date, { explicit }),
    bytes: new TextEncoder().encode(
      buildEntityCsv(selection.dataType, selection.records, { locale, safeExport }),
    ),
    recordCounts: { [selection.dataType]: selection.records.length },
  }));
}

export async function buildXlsxExportArtifact({
  selections,
  locale,
  date = new Date(),
  safeExport = false,
  explicit = false,
}: {
  selections: ExportDataSelection[];
  locale: string;
  date?: Date;
  safeExport?: boolean;
  explicit?: boolean;
}): Promise<ExportArtifact> {
  const workbook = await buildXlsxWorkbook({ selections, locale, safeExport });
  const dataTypes = selections.map((selection) => selection.dataType);
  return {
    dataTypes,
    format: "xlsx",
    fileName: defaultExportFileName(dataTypes, "xlsx", date, { explicit }),
    bytes: workbook.bytes,
    recordCounts: Object.fromEntries(
      selections.map((selection) => [selection.dataType, selection.records.length]),
    ),
  };
}

export function exportSelectionSummary(selections: ExportDataSelection[]) {
  return selections.map((selection) =>
    `${exportEntityLabel(selection.dataType)}: ${selection.records.length}`,
  ).join(", ");
}
