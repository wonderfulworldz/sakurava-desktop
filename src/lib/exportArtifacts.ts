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
