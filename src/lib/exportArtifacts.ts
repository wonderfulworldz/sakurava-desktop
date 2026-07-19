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

export function prepareSelectionsWithPublicRefs(
  selections: ExportDataSelection[],
): ExportDataSelection[] {
  const byType = new Map(selections.map((selection) => [selection.dataType, selection.records]));
  const publicRefMaps = {
    videos: recordRefMap(byType.get("videos") ?? []),
    images: recordRefMap(byType.get("images") ?? []),
    performers: recordRefMap(byType.get("performers") ?? []),
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
        };
      }
      if (selection.dataType === "images") {
        const image = record as Image;
        return {
          ...image,
          categoriesJson: replaceCategoryLabels(image.categoriesJson, categoryRefsByName),
          relatedPerformersJson: replaceRelationshipIds(image.relatedPerformersJson, "performerId", publicRefMaps.performers),
          relatedVideosJson: replaceRelationshipIds(image.relatedVideosJson, "recordId", publicRefMaps.videos),
        };
      }
      if (selection.dataType === "performers") {
        const performer = record as Performer;
        return {
          ...performer,
          categoriesJson: replaceCategoryLabels(performer.categoriesJson, categoryRefsByName),
          relatedVideosJson: replaceRelationshipIds(performer.relatedVideosJson, "recordId", publicRefMaps.videos),
          relatedImagesJson: replaceRelationshipIds(performer.relatedImagesJson, "recordId", publicRefMaps.images),
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

export type ExportArtifact = {
  dataTypes: ExportCsvEntity[];
  format: ExportFormat;
  fileName: string;
  bytes: Uint8Array;
  recordCounts: Partial<Record<ExportCsvEntity, number>>;
  template: boolean;
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
) {
  return `skv-${exportTypeCode(dataTypes)}-${localExportTimestamp(date)}.${format}`;
}

export function buildCsvExportArtifacts({
  selections,
  locale,
  date = new Date(),
}: {
  selections: ExportDataSelection[];
  locale: string;
  date?: Date;
}): ExportArtifact[] {
  const timestamp = localExportTimestamp(date);
  return selections.map((selection) => ({
    dataTypes: [selection.dataType],
    format: "csv",
    fileName: `skv-${exportTypeCode([selection.dataType])}-${timestamp}.csv`,
    bytes: new TextEncoder().encode(
      buildEntityCsv(selection.dataType, selection.records, { locale }),
    ),
    recordCounts: { [selection.dataType]: selection.records.length },
    template: selection.records.length === 0,
  }));
}

export async function buildXlsxExportArtifact({
  selections,
  locale,
  date = new Date(),
  template = false,
}: {
  selections: ExportDataSelection[];
  locale: string;
  date?: Date;
  template?: boolean;
}): Promise<ExportArtifact> {
  const workbook = await buildXlsxWorkbook({ selections, locale, template });
  const dataTypes = selections.map((selection) => selection.dataType);
  return {
    dataTypes,
    format: "xlsx",
    fileName: defaultExportFileName(dataTypes, "xlsx", date),
    bytes: workbook.bytes,
    recordCounts: Object.fromEntries(
      selections.map((selection) => [selection.dataType, selection.records.length]),
    ),
    template,
  };
}

export function exportSelectionSummary(selections: ExportDataSelection[]) {
  return selections.map((selection) =>
    `${exportEntityLabel(selection.dataType)}: ${selection.records.length}`,
  ).join(", ");
}
