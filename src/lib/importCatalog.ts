import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import {
  exportEntityLabel,
  exportSchemaFor,
  sakuravaRef,
} from "./exportCsv";
import {
  buildImportCsvPreview,
  buildImportTablePreview,
  type ImportCsvEntity,
  type ImportCsvPreview,
  type ImportCsvPreviewContext,
  type ImportCsvPreviewRow,
  isTemporaryGlossaryRef,
  isBlockingImportPreviewWarning,
} from "./importCsvPreview";
import { isClearlyExcelDateFormat, normalizeImportDate } from "./importDate";
import { EXPORT_CONTRACT_VERSION } from "./exportWorkbook";
import {
  SAKURAVA_APPLICATION_ID,
  SAKURAVA_EXPORT_FORMAT_VERSION,
  SAKURAVA_IMPORT_CONTRACT_VERSION,
  SAKURAVA_METADATA_SHEET,
  type SakuravaWorkbookMetadata,
  SAKURAVA_CLEAR_VALUE,
} from "./importExportContract";

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

const ignoredSheets = new Set(["Instructions", "Examples", SAKURAVA_METADATA_SHEET]);

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
  return catalogPreview("csv", sections, preview.headerErrors, preview.headerWarnings, context);
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
      context,
    );
  }

  const metadataTypes = workbookDataTypes(workbook);
  const headerErrors: string[] = [];
  const headerWarnings: string[] = [];
  const sections: ImportCatalogSection[] = [];
  const metadata = readWorkbookMetadata(workbook, headerErrors, headerWarnings);
  const seenTypes = new Set<ImportCsvEntity>();

  for (const worksheet of workbook.worksheets) {
    if (ignoredSheets.has(worksheet.name)) continue;
    const dataType = supportedSheets[worksheet.name]
      ?? (worksheet.name === "Data" && metadataTypes.length === 1 ? metadataTypes[0] : null);
    if (!dataType) {
      headerWarnings.push(`Ignored unsupported worksheet: ${worksheet.name}.`);
      continue;
    }
    if (seenTypes.has(dataType)) {
      headerErrors.push(`Duplicate ${exportEntityLabel(dataType)} worksheets are not allowed.`);
      continue;
    }
    seenTypes.add(dataType);
    collectMalformedCellIssues(worksheet, headerErrors);
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
  if (metadata) {
    const actualTypes = Array.from(seenTypes).sort();
    const declaredTypes = [...metadata.includedDataTypes].sort();
    if (actualTypes.join(",") !== declaredTypes.join(",")) {
      headerErrors.push("Workbook data sheets do not match the declared Sakurava data types.");
    }
  }
  if (workbook.description && !workbook.description.includes(EXPORT_CONTRACT_VERSION)) {
    headerWarnings.push("Workbook contract metadata is not recognized; supported sheet names were validated directly.");
  }

  return catalogPreview("xlsx", sections, headerErrors, headerWarnings, context);
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
  const metadataSheet = workbook.getWorksheet(SAKURAVA_METADATA_SHEET);
  if (metadataSheet) {
    try {
      const parsed = JSON.parse(String(metadataSheet.getCell("A1").value ?? "")) as SakuravaWorkbookMetadata;
      if (Array.isArray(parsed.includedDataTypes)) {
        return parsed.includedDataTypes.filter(isImportEntity);
      }
    } catch {
      return [];
    }
  }
  const match = workbook.description?.match(/(?:^|;)\s*dataTypes=([^;]+)/i);
  if (!match) return [];
  return match[1].split(",").map((value) => value.trim())
    .filter(isImportEntity);
}

function isImportEntity(value: string): value is ImportCsvEntity {
  return value === "videos" || value === "images" || value === "performers" || value === "categories" || value === "glossary";
}

function readWorkbookMetadata(workbook: Workbook, errors: string[], warnings: string[]) {
  const worksheet = workbook.getWorksheet(SAKURAVA_METADATA_SHEET);
  if (!worksheet) {
    warnings.push(
      "Sakurava workbook metadata is missing; only explicitly named legacy data sheets can be validated.",
    );
    return null;
  }
  if (worksheet.state !== "veryHidden") {
    errors.push("Sakurava workbook metadata sheet visibility was modified.");
  }
  try {
    const metadata = JSON.parse(String(worksheet.getCell("A1").value ?? "")) as SakuravaWorkbookMetadata;
    if (metadata.applicationId !== SAKURAVA_APPLICATION_ID) errors.push("Workbook application identifier is not supported.");
    if (metadata.contractVersion !== SAKURAVA_IMPORT_CONTRACT_VERSION) errors.push("Workbook contract version is not supported.");
    if (metadata.exportFormatVersion !== SAKURAVA_EXPORT_FORMAT_VERSION) errors.push("Workbook export format version is not supported.");
    if (metadata.format !== "xlsx" || !["catalog", "template"].includes(metadata.workbookType)) errors.push("Workbook type metadata is not valid.");
    if (!Array.isArray(metadata.includedDataTypes) || metadata.includedDataTypes.some((value) => !isImportEntity(value))) errors.push("Workbook contains an unknown declared data type.");
    if (!metadata.generatedAt || Number.isNaN(Date.parse(metadata.generatedAt))) errors.push("Workbook generated timestamp is not valid.");
    return metadata;
  } catch {
    errors.push("Sakurava workbook metadata is malformed.");
    return null;
  }
}

function collectMalformedCellIssues(worksheet: Worksheet, errors: string[]) {
  worksheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (!value || typeof value !== "object" || value instanceof Date) return;
    const formulaResult = "result" in value ? value.result : null;
    if (
      "error" in value ||
      (formulaResult && typeof formulaResult === "object" && "error" in formulaResult) ||
      ("formula" in value && value.result == null)
    ) {
      errors.push(`Worksheet ${worksheet.name} contains an unreadable formula or error cell at ${cell.address}.`);
      return;
    }
    if (!("formula" in value) && !("sharedFormula" in value) && !("richText" in value) && !("text" in value)) {
      errors.push(`Worksheet ${worksheet.name} contains a malformed cell at ${cell.address}.`);
    }
  }));
}

function catalogPreview(
  format: ImportCatalogFormat,
  sections: ImportCatalogSection[],
  headerErrors: string[],
  headerWarnings: string[],
  context: ImportCsvPreviewContext,
): ImportCatalogPreview {
  validateGlossaryDependencies(sections, context);
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
  const needsAttention = rows.filter(
    (row) => row.errors.length > 0 || row.warnings.some(isBlockingImportPreviewWarning),
  ).length;
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

function validateGlossaryDependencies(
  sections: ImportCatalogSection[],
  context: ImportCsvPreviewContext,
) {
  const rows = sections
    .filter((section) => section.dataType === "glossary")
    .flatMap((section) => section.preview.rows);
  if (!rows.length) return;
  const byRef = new Map(rows.map((row) => [(row.values["Sakurava Ref"] ?? "").trim(), row]));
  const deleting = new Set(rows.filter((row) => row.detectedResult === "Deleted").map((row) => (row.values["Sakurava Ref"] ?? "").trim()));
  const permanentIds = new Set((context.glossary ?? []).map((entry) => entry.id));

  for (const row of rows) {
    const ref = (row.values["Sakurava Ref"] ?? "").trim();
    const parent = (row.values["Parent Ref"] ?? "").trim();
    if (isTemporaryGlossaryRef(ref) && permanentIds.has(ref)) {
      addRowError(row, "Temporary Glossary identifier conflicts with an existing permanent record.");
    }
    if (parent && deleting.has(parent)) {
      addRowError(row, "A Glossary parent scheduled for deletion cannot receive a child.");
    }
    if (!isTemporaryGlossaryRef(parent)) continue;
    if (parent === ref) addRowError(row, "A Glossary entry cannot be its own parent.");
    else if (!byRef.has(parent)) addRowError(row, `Glossary parent was not found: ${parent}.`);
  }

  const parents = new Map((context.glossary ?? []).map((entry) => [
    sakuravaRef("GLO", entry.id),
    entry.parentId ? sakuravaRef("GLO", entry.parentId) : "",
  ]));
  for (const row of rows) {
    const ref = (row.values["Sakurava Ref"] ?? "").trim();
    if (row.detectedResult === "Deleted") {
      parents.delete(ref);
      continue;
    }
    const importedParent = (row.values["Parent Ref"] ?? "").trim();
    if (row.detectedResult === "Added" || importedParent) {
      parents.set(ref, importedParent === SAKURAVA_CLEAR_VALUE ? "" : importedParent);
    }
  }
  for (const deletedRef of deleting) {
    if (Array.from(parents.values()).includes(deletedRef)) {
      const row = byRef.get(deletedRef);
      if (row) addRowError(row, "Glossary record cannot be deleted while child records use it.");
    }
  }
  for (const [start, row] of byRef) {
    const path = new Set<string>();
    let current = start;
    while (current) {
      if (path.has(current)) {
        addRowError(row, "Glossary parent references form a circular hierarchy.");
        break;
      }
      path.add(current);
      current = parents.get(current) ?? "";
    }
  }
}

function addRowError(row: ImportCsvPreviewRow, message: string) {
  if (!row.errors.includes(message)) row.errors.push(message);
  row.detectedResult = "Error";
}

function stripUtf8Bom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
