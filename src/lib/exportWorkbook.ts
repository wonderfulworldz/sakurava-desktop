import type { Workbook, Worksheet } from "exceljs";
import {
  EXPORT_ACTIONS,
  exportEntityLabel,
  exportRowsFor,
  exportSchemaFor,
  parseExportDate,
  type CsvCell,
  type CsvSchemaColumn,
  type ExportCsvEntity,
} from "./exportCsv";
import {
  buildWorkbookMetadata,
  SAKURAVA_CLEAR_VALUE,
  SAKURAVA_METADATA_SHEET,
  stableContractJson,
} from "./importExportContract";
import { IMPORT_MAX_ROWS_PER_SECTION } from "./importLimits";

export const EXPORT_CONTRACT_VERSION = "sakurava-bulk-edit-v3";

export type ExportDataSelection = {
  dataType: ExportCsvEntity;
  records: unknown[];
};

export type XlsxBuildOptions = {
  selections: ExportDataSelection[];
  locale: string;
  timeZone?: string;
  template?: boolean;
  generatedAt?: Date;
};

export type XlsxBuildResult = {
  bytes: Uint8Array;
  sheetNames: string[];
  template: boolean;
};

export async function buildXlsxWorkbook(
  options: XlsxBuildOptions,
): Promise<XlsxBuildResult> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sakurava";
  workbook.company = "Sakurava";
  workbook.subject = "Sakurava bulk-edit export";
  workbook.description = `${EXPORT_CONTRACT_VERSION}; locale=${options.locale}; dataTypes=${options.selections.map((selection) => selection.dataType).join(",")}`;
  const generatedAt = options.generatedAt ?? new Date();
  workbook.created = generatedAt;

  addMetadataSheet(workbook, options, generatedAt);

  addInstructionsSheet(workbook, options);
  const isSingleTemplate = options.template === true && options.selections.length === 1;

  for (const selection of options.selections) {
    addDataSheet(
      workbook,
      isSingleTemplate ? "Data" : exportEntityLabel(selection.dataType),
      selection,
      options.locale,
    );
  }

  if (isSingleTemplate) {
    addExamplesSheet(workbook, options.selections[0].dataType, options.locale);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    bytes: new Uint8Array(buffer),
    sheetNames: workbook.worksheets
      .filter((worksheet) => worksheet.name !== SAKURAVA_METADATA_SHEET)
      .map((worksheet) => worksheet.name),
    template: options.template === true,
  };
}

function addMetadataSheet(workbook: Workbook, options: XlsxBuildOptions, generatedAt: Date) {
  const metadata = buildWorkbookMetadata({
    dataTypes: options.selections.map((selection) => selection.dataType),
    generatedAt,
    template: options.template === true,
  });
  const worksheet = workbook.addWorksheet(SAKURAVA_METADATA_SHEET);
  worksheet.state = "veryHidden";
  worksheet.getCell("A1").value = stableContractJson(metadata);
  worksheet.getCell("A1").numFmt = "@";
}

function addInstructionsSheet(workbook: Workbook, options: XlsxBuildOptions) {
  const worksheet = workbook.addWorksheet("Instructions", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [{ width: 24 }, { width: 88 }];
  worksheet.addRow(["Sakurava Import / Export", "XLSX Recommended"]);
  worksheet.addRow(["Contract", EXPORT_CONTRACT_VERSION]);
  worksheet.addRow(["Data types", options.selections.map((selection) => selection.dataType).join(", ")]);
  worksheet.addRow(["Locale", options.locale]);
  worksheet.addRow(["Local date style", localDateExample(options.locale)]);
  worksheet.addRow(["Auto", "Recommended. Create for a blank identifier, update a known changed record, otherwise skip."]);
  worksheet.addRow(["Create", "Create a new record. Do not supply an existing identifier."]);
  worksheet.addRow(["Update", "Update the record identified by Sakurava Ref."]);
  worksheet.addRow(["Delete", "Explicitly delete the identified record. Missing rows never mean Delete."]);
  worksheet.addRow(["Skip", "Make no change for this row."]);
  worksheet.addRow(["Required fields", requiredFieldSummary(options.selections)]);
  worksheet.addRow(["Optional fields", "May be left empty when creating a record."]);
  worksheet.addRow(["Empty cells", "For future Update import, an empty cell leaves the current value unchanged."]);
  worksheet.addRow(["Clear existing value", `Enter ${SAKURAVA_CLEAR_VALUE} in a nullable editable field. Blank Update cells remain unchanged.`]);
  worksheet.addRow(["Identifiers", "Sakurava Ref is text and read-only. Do not edit it manually."]);
  worksheet.addRow(["Import safety", "Sakurava validates and previews this file before applying it. Examples are never imported."]);
  worksheet.addRow(["Examples", "Example sheets are guidance only and will never be imported as real data."]);

  const titleRow = worksheet.getRow(1);
  titleRow.height = 24;
  titleRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBE185D" } };
    cell.alignment = { vertical: "middle" };
  });
  worksheet.getColumn(1).font = { bold: true, color: { argb: "FF475569" } };
}

function addDataSheet(
  workbook: Workbook,
  sheetName: string,
  selection: ExportDataSelection,
  locale: string,
) {
  const schema = exportSchemaFor(selection.dataType);
  const rows = exportRowsFor(selection.dataType, selection.records);
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  configureDataSheet(worksheet, schema, locale);

  for (const record of rows) {
    const row = worksheet.addRow(
      schema.map((column) => xlsxCellValue(column, column.value(record), locale)),
    );
    formatDataRow(row, schema, locale);
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, worksheet.rowCount), column: schema.length },
  };
}

function configureDataSheet(
  worksheet: Worksheet,
  schema: CsvSchemaColumn<any>[],
  locale: string,
) {
  worksheet.columns = schema.map((column) => ({
    key: column.key,
    header: column.header,
    width: columnWidth(column),
  }));
  const header = worksheet.getRow(1);
  header.height = 26;
  header.eachCell((cell, columnIndex) => {
    const column = schema[columnIndex - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.editable ? "FFBE185D" : "FF64748B" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.note = column.key === "action"
      ? "Choose Auto, Create, Update, Delete, or Skip. Blank is treated as Auto."
      : column.valueType === "identifier"
        ? "Stable Sakurava record identifier. Keep existing identifiers unchanged."
        : `${column.required ? "Required" : "Optional"} ${column.editable ? "editable" : "read-only"} field.`;
  });

  const actionColumn = schema.findIndex((column) => column.key === "action") + 1;
  if (actionColumn > 0) {
    const actionLetter = worksheet.getColumn(actionColumn).letter;
    (worksheet as any).dataValidations.add(`${actionLetter}2:${actionLetter}${IMPORT_MAX_ROWS_PER_SECTION + 1}`, {
      type: "list",
      allowBlank: true,
      formulae: [`"${EXPORT_ACTIONS.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Choose a supported Action",
      error: `Use ${EXPORT_ACTIONS.join(", ")}.`,
    });
  }

  for (const [index, column] of schema.entries()) {
    const worksheetColumn = worksheet.getColumn(index + 1);
    if (column.valueType === "identifier") {
      worksheetColumn.numFmt = "@";
      worksheetColumn.font = { color: { argb: "FF475569" } };
      worksheetColumn.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
    } else if (column.valueType === "date") {
      worksheetColumn.numFmt = excelDateNumberFormat(locale);
    } else if (column.valueType === "date-time") {
      worksheetColumn.numFmt = excelDateTimeNumberFormat(locale);
    }
    if (column.allowedValues?.length) {
      const columnLetter = worksheetColumn.letter;
      (worksheet as any).dataValidations.add(
        `${columnLetter}2:${columnLetter}${IMPORT_MAX_ROWS_PER_SECTION + 1}`,
        {
          type: "list",
          allowBlank: true,
          formulae: [`"${column.allowedValues.join(",")}"`],
          showErrorMessage: true,
          errorTitle: `Choose a supported ${column.header}`,
          error: `Use ${column.allowedValues.join(", ")}.`,
        },
      );
    }
  }
}

function addExamplesSheet(
  workbook: Workbook,
  dataType: ExportCsvEntity,
  locale: string,
) {
  const schema = exportSchemaFor(dataType);
  const worksheet = workbook.addWorksheet("Examples", {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  worksheet.addRow(["EXAMPLES ONLY — Sakurava will never import this sheet."]);
  worksheet.mergeCells(1, 1, 1, schema.length);
  worksheet.getRow(1).font = { bold: true, color: { argb: "FF9F1239" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFE4E6" },
  };
  worksheet.addRow(schema.map((column) => column.header));

  for (const action of ["Auto", "Auto", "Delete", "Skip"] as const) {
    const identifier = action === "Auto" && worksheet.rowCount === 2
      ? ""
      : `${exampleIdentifierPrefix(dataType)}-EXAMPLE-${worksheet.rowCount - 1}`;
    worksheet.addRow(schema.map((column) => exampleValue(column, action, identifier)));
  }

  worksheet.columns.forEach((column, index) => {
    column.width = columnWidth(schema[index]);
  });
  formatDataRow(worksheet.getRow(2), schema, locale, true);
  for (let row = 3; row <= worksheet.rowCount; row += 1) {
    formatDataRow(worksheet.getRow(row), schema, locale);
  }
}

function exampleIdentifierPrefix(dataType: ExportCsvEntity) {
  if (dataType === "videos") return "VID";
  if (dataType === "images") return "IMG";
  if (dataType === "performers") return "PER";
  if (dataType === "glossary") return "GLO";
  return "CAT";
}

function xlsxCellValue(
  column: CsvSchemaColumn<any>,
  value: CsvCell,
  locale: string,
): CsvCell {
  if (value == null || value === "") return "";
  if (column.valueType === "identifier") return String(value);
  if (column.valueType === "date" || column.valueType === "date-time") {
    return parseExportDate(value, column.valueType === "date-time", locale) ?? String(value);
  }
  if (column.valueType === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : String(value);
  }
  if (column.valueType === "boolean") return Boolean(value);
  return value;
}

function formatDataRow(
  row: import("exceljs").Row,
  schema: CsvSchemaColumn<any>[],
  locale: string,
  header = false,
) {
  row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
    const column = schema[columnIndex - 1];
    cell.alignment = {
      vertical: "top",
      wrapText: column?.multiline === true || column?.valueType === "list/reference",
    };
    if (header) {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF64748B" } };
    } else if (column?.valueType === "identifier") {
      cell.numFmt = "@";
      cell.protection = { locked: true };
    } else if (column?.valueType === "date") {
      cell.numFmt = excelDateNumberFormat(locale);
    } else if (column?.valueType === "date-time") {
      cell.numFmt = excelDateTimeNumberFormat(locale);
    }
  });
}

function exampleValue(
  column: CsvSchemaColumn<any>,
  action: string,
  identifier: string,
) {
  if (column.key === "action") return action;
  if (column.valueType === "identifier") return identifier;
  if (column.required) return `Fictional ${column.header}`;
  if (column.valueType === "date") return new Date(2026, 0, 2);
  return column.example ?? "";
}

function requiredFieldSummary(selections: ExportDataSelection[]) {
  return selections.map((selection) => {
    const fields = exportSchemaFor(selection.dataType)
      .filter((column) => column.required && column.key !== "action")
      .map((column) => column.header)
      .join(", ");
    return `${exportEntityLabel(selection.dataType)}: ${fields || "none"}`;
  }).join("; ");
}

function columnWidth(column: CsvSchemaColumn<any>) {
  if (column.key === "action") return 12;
  if (column.valueType === "identifier") return 19;
  if (column.valueType === "date" || column.valueType === "date-time") return 16;
  if (column.valueType === "list/reference") return 34;
  if (column.multiline) return 36;
  return Math.max(12, Math.min(26, column.header.length + 4));
}

export function excelDateNumberFormat(locale: string) {
  return excelFormatFromParts(locale, false);
}

export function excelDateTimeNumberFormat(locale: string) {
  return excelFormatFromParts(locale, true);
}

function excelFormatFromParts(locale: string, includeTime: boolean) {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "numeric" as const, minute: "2-digit" as const } : {}),
  });
  return formatter.formatToParts(new Date(2006, 10, 22, 17, 5)).map((part) => {
    if (part.type === "year") return "yyyy";
    if (part.type === "month") return "m";
    if (part.type === "day") return "d";
    if (part.type === "hour") return formatter.resolvedOptions().hour12 ? "h" : "hh";
    if (part.type === "minute") return "mm";
    if (part.type === "dayPeriod") return "AM/PM";
    return part.value;
  }).join("").replace(/\u202f/g, " ");
}

function localDateExample(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(2026, 0, 2));
}
