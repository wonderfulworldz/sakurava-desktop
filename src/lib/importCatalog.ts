import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import {
  exportEntityLabel,
  exportSchemaFor,
} from "./exportCsv";
import {
  buildImportCsvPreview,
  buildImportTablePreview,
  type ImportCsvEntity,
  type ImportCsvPreview,
  type ImportCsvPreviewContext,
  type ImportCsvPreviewRow,
} from "./importCsvPreview";
import { isClearlyExcelDateFormat, normalizeImportDate } from "./importDate";
import { EXPORT_CONTRACT_VERSION } from "./exportWorkbook";

export type ImportCatalogFormat = "csv" | "xlsx";

export type ImportCatalogSection = {
  dataType: ImportCsvEntity;
  sheetName: string;
  preview: ImportCsvPreview;
};

export type ImportCatalogRow = ImportCsvPreviewRow & {
  dataType: ImportCsvEntity;
  sheetName: string;
};

export type ImportCatalogPreview = {
  format: ImportCatalogFormat;
  sections: ImportCatalogSection[];
  rows: ImportCatalogRow[];
  headerErrors: string[];
  headerWarnings: string[];
  summary: {
    totalRows: number;
    create: number;
    update: number;
    delete: number;
    skip: number;
    needsAttention: number;
    blocked: boolean;
  };
};

export type ImportCatalogMessages = {
  invalidDate?: (field: string, format: string) => string;
  invalidWorkbook?: string;
  invalidSheet?: string;
};

const supportedSheets: Record<string, ImportCsvEntity> = {
  Videos: "videos",
  Images: "images",
  Performers: "performers",
  "Managed Categories": "categories",
  Glossary: "glossary",
};

const ignoredSheets = new Set(["Instructions", "Examples"]);

export function buildCsvCatalogPreview(
  csvText: string,
  context: ImportCsvPreviewContext,
  locale: string,
  messages: ImportCatalogMessages = {},
): ImportCatalogPreview {
  const preview = buildImportCsvPreview(stripUtf8Bom(csvText), context, {
    locale,
    invalidDateMessage: messages.invalidDate,
  });
  const sections = preview.summary.entity === "unknown"
    ? []
    : [{
        dataType: preview.summary.entity,
        sheetName: exportEntityLabel(preview.summary.entity),
        preview,
      }];
  return catalogPreview("csv", sections, preview.headerErrors, preview.headerWarnings);
}

export async function buildXlsxCatalogPreview(
  bytes: Uint8Array,
  context: ImportCsvPreviewContext,
  locale: string,
  messages: ImportCatalogMessages = {},
): Promise<ImportCatalogPreview> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return catalogPreview(
      "xlsx",
      [],
      [messages.invalidWorkbook ?? "This XLSX workbook could not be read."],
      [],
    );
  }

  const metadataTypes = workbookDataTypes(workbook);
  const headerErrors: string[] = [];
  const headerWarnings: string[] = [];
  const sections: ImportCatalogSection[] = [];

  for (const worksheet of workbook.worksheets) {
    if (ignoredSheets.has(worksheet.name)) continue;
    const dataType = supportedSheets[worksheet.name]
      ?? (worksheet.name === "Data" && metadataTypes.length === 1 ? metadataTypes[0] : null);
    if (!dataType) {
      headerWarnings.push(`Ignored unsupported worksheet: ${worksheet.name}.`);
      continue;
    }
    sections.push(buildWorksheetSection(
      worksheet,
      dataType,
      context,
      locale,
      workbook.properties.date1904 === true,
      messages,
    ));
  }

  if (workbook.getWorksheet("Data") && metadataTypes.length !== 1) {
    headerErrors.push(
      "The Data worksheet does not identify one supported Sakurava data type.",
    );
  }
  if (sections.length === 0) {
    headerErrors.push(messages.invalidSheet
      ?? "No supported Sakurava data worksheets were found. Use Videos, Images, Performers, Managed Categories, Glossary, or an identified Data sheet.");
  }
  if (workbook.description && !workbook.description.includes(EXPORT_CONTRACT_VERSION)) {
    headerWarnings.push("Workbook contract metadata is not recognized; supported sheet names were validated directly.");
  }

  return catalogPreview("xlsx", sections, headerErrors, headerWarnings);
}

function buildWorksheetSection(
  worksheet: Worksheet,
  dataType: ImportCsvEntity,
  context: ImportCsvPreviewContext,
  locale: string,
  date1904: boolean,
  messages: ImportCatalogMessages,
): ImportCatalogSection {
  const schema = exportSchemaFor(dataType);
  const dateHeaders = new Set(
    schema.filter((column) => column.valueType === "date" || column.valueType === "date-time")
      .map((column) => column.header),
  );
  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    importCellText(headerRow.getCell(index + 1).value),
  );
  const rows: string[][] = [];
  const rowNumbers: number[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = headers.map((header, index) =>
      worksheetCellText(row.getCell(index + 1), header, dateHeaders, locale, date1904),
    );
    if (values.some((value) => value.trim() !== "")) {
      rows.push(values);
      rowNumbers.push(rowNumber);
    }
  }

  return {
    dataType,
    sheetName: worksheet.name,
    preview: buildImportTablePreview(
      { headers, rows },
      context,
      { locale, rowNumbers, invalidDateMessage: messages.invalidDate },
    ),
  };
}

function worksheetCellText(
  cell: Cell,
  header: string,
  dateHeaders: Set<string>,
  locale: string,
  date1904: boolean,
) {
  const raw = resolvedCellValue(cell.value);
  if (dateHeaders.has(header)) {
    const result = normalizeImportDate(raw as string | number | Date | null, {
      locale,
      excelDateFormatted:
        raw instanceof Date || (typeof raw === "number" && isClearlyExcelDateFormat(cell.numFmt)),
      excelDate1904: date1904,
    });
    return result.value;
  }
  return importCellText(raw);
}

function resolvedCellValue(value: CellValue): CellValue {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value && value.result != null) return value.result;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return value;
}

function importCellText(value: CellValue) {
  if (value == null) return "";
  if (value instanceof Date) {
    const normalized = normalizeImportDate(value, { locale: "en-US" });
    return normalized.value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function workbookDataTypes(workbook: Workbook): ImportCsvEntity[] {
  const match = workbook.description?.match(/(?:^|;)\s*dataTypes=([^;]+)/i);
  if (!match) return [];
  return match[1].split(",").map((value) => value.trim())
    .filter((value): value is ImportCsvEntity =>
      value === "videos" || value === "images" || value === "performers" || value === "categories" || value === "glossary",
    );
}

function catalogPreview(
  format: ImportCatalogFormat,
  sections: ImportCatalogSection[],
  headerErrors: string[],
  headerWarnings: string[],
): ImportCatalogPreview {
  const rows = sections.flatMap((section) =>
    section.preview.rows.map((row) => ({
      ...row,
      dataType: section.dataType,
      sheetName: section.sheetName,
    })),
  );
  const allHeaderErrors = [
    ...headerErrors,
    ...sections.flatMap((section) => section.preview.headerErrors),
  ];
  const allHeaderWarnings = [
    ...headerWarnings,
    ...sections.flatMap((section) => section.preview.headerWarnings),
  ];
  const needsAttention = rows.filter((row) => row.errors.length > 0).length;
  return {
    format,
    sections,
    rows,
    headerErrors: allHeaderErrors,
    headerWarnings: allHeaderWarnings,
    summary: {
      totalRows: rows.length,
      create: rows.filter((row) => row.detectedResult === "Added").length,
      update: rows.filter((row) => row.detectedResult === "Modified").length,
      delete: rows.filter((row) => row.detectedResult === "Deleted").length,
      skip: rows.filter((row) =>
        row.detectedResult === "Skipped" || row.detectedResult === "Unchanged",
      ).length,
      needsAttention,
      blocked: allHeaderErrors.length > 0 || needsAttention > 0,
    },
  };
}

function stripUtf8Bom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
