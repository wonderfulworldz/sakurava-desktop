import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import {
  exportEntityLabel,
  exportSchemaFor,
  sakuravaRef,
  sakuravaRefMatches,
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
  SAKURAVA_METADATA_SHEET,
  SAKURAVA_SUPPORTED_EXPORT_FORMAT_VERSIONS,
  SAKURAVA_SUPPORTED_IMPORT_CONTRACT_VERSIONS,
  type SakuravaWorkbookMetadata,
  SAKURAVA_CLEAR_VALUE,
} from "./importExportContract";
import {
  IMPORT_MAX_CELL_CHARACTERS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS_PER_SECTION,
  IMPORT_MAX_TOTAL_ROWS,
  IMPORT_MAX_WORKSHEETS,
  importLimitMessage,
} from "./importLimits";
import { canonicalImportIdentity, resolveSakuravaIdentity } from "./sakuravaRef";

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
  /** Deterministic relationship updates required before safe deletion. */
  automaticCleanupOperations?: ImportCleanupOperation[];
};

export type ImportCleanupOperation = {
  sourceIdentity: string;
  section: ImportCsvEntity | "credits";
  action: "update" | "delete";
  recordId: string;
  currentRecord: object;
  proposedValues: Record<string, unknown>;
  detail: string;
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
  Credits: "credits",
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
  return catalogPreview(
    "csv",
    sections,
    sections.length === 0 ? preview.headerErrors : [],
    sections.length === 0 ? preview.headerWarnings : [],
    context,
  );
}

export async function buildXlsxCatalogPreview(
  bytes: Uint8Array,
  context: ImportCsvPreviewContext,
  locale: string,
  messages: ImportCatalogMessages = {},
): Promise<ImportCatalogPreview> {
  if (bytes.byteLength > IMPORT_MAX_FILE_BYTES) {
    return catalogPreview("xlsx", [], [importLimitMessage("file")], [], context);
  }
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
  if (workbook.worksheets.length > IMPORT_MAX_WORKSHEETS) {
    headerErrors.push(importLimitMessage("sheets"));
  }
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
      !metadata || metadata.contractVersion === 1,
    ));
  }

  if (workbook.getWorksheet("Data") && metadataTypes.length !== 1) {
    headerErrors.push(
      "The Data worksheet does not identify one supported Sakurava data type.",
    );
  }
  if (sections.length === 0) {
    headerErrors.push(messages.invalidSheet
      ?? "No supported Sakurava data worksheets were found. Use Videos, Images, Performers, Managed Categories, Glossary, Credits, or an identified Data sheet.");
  }
  if (metadata) {
    const actualTypes = Array.from(seenTypes).sort();
    const declaredTypes = [...metadata.includedDataTypes].sort();
    if (actualTypes.join(",") !== declaredTypes.join(",")) {
      headerErrors.push("Workbook data sheets do not match the declared Sakurava data types.");
    }
  }
  if (sections.reduce((total, section) => total + section.preview.rows.length, 0) > IMPORT_MAX_TOTAL_ROWS) {
    headerErrors.push(importLimitMessage("totalRows"));
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
  allowLegacyColumns: boolean,
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

  const parseErrors: string[] = [];
  if (Math.max(0, worksheet.actualRowCount - 1) > IMPORT_MAX_ROWS_PER_SECTION) {
    parseErrors.push(importLimitMessage("sectionRows"));
  }
  const finalRow = Math.min(worksheet.actualRowCount, IMPORT_MAX_ROWS_PER_SECTION + 1);
  for (let rowNumber = 2; rowNumber <= finalRow; rowNumber += 1) {
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
      { headers, rows, errors: parseErrors },
      context,
      {
        locale,
        rowNumbers,
        invalidDateMessage: messages.invalidDate,
        allowLegacyColumns,
      },
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
  return value === "videos" || value === "images" || value === "performers" || value === "categories" || value === "glossary" || value === "credits";
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
    if (!SAKURAVA_SUPPORTED_IMPORT_CONTRACT_VERSIONS.includes(
      metadata.contractVersion as (typeof SAKURAVA_SUPPORTED_IMPORT_CONTRACT_VERSIONS)[number],
    )) errors.push("Workbook contract version is not supported.");
    if (!SAKURAVA_SUPPORTED_EXPORT_FORMAT_VERSIONS.includes(
      metadata.exportFormatVersion as (typeof SAKURAVA_SUPPORTED_EXPORT_FORMAT_VERSIONS)[number],
    )) errors.push("Workbook export format version is not supported.");
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
  let issueCount = 0;
  let oversizedCellReported = false;
  const finalRow = Math.min(worksheet.actualRowCount, IMPORT_MAX_ROWS_PER_SECTION + 1);
  const finalColumn = Math.min(worksheet.actualColumnCount, 128);
  for (let rowNumber = 1; rowNumber <= finalRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= finalColumn; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      const value = cell.value;
      if (
        !oversizedCellReported &&
        importCellText(resolvedCellValue(value)).length > IMPORT_MAX_CELL_CHARACTERS
      ) {
        errors.push(importLimitMessage("cell"));
        oversizedCellReported = true;
      }
      if (!value || typeof value !== "object" || value instanceof Date) continue;
      const formulaResult = "result" in value ? value.result : null;
      if (
        "error" in value ||
        (formulaResult && typeof formulaResult === "object" && "error" in formulaResult) ||
        ("formula" in value && value.result == null)
      ) {
        if (issueCount < 20) {
          errors.push(`Worksheet ${worksheet.name} contains an unreadable formula or error cell at ${cell.address}.`);
        }
        issueCount += 1;
        continue;
      }
      if (!("formula" in value) && !("sharedFormula" in value) && !("richText" in value) && !("text" in value)) {
        if (issueCount < 20) {
          errors.push(`Worksheet ${worksheet.name} contains a malformed cell at ${cell.address}.`);
        }
        issueCount += 1;
      }
    }
  }
  if (issueCount > 20) {
    errors.push(`Worksheet ${worksheet.name} contains ${issueCount - 20} additional unreadable cells.`);
  }
}

function catalogPreview(
  format: ImportCatalogFormat,
  sections: ImportCatalogSection[],
  headerErrors: string[],
  headerWarnings: string[],
  context: ImportCsvPreviewContext,
): ImportCatalogPreview {
  validateGlossaryDependencies(sections, context);
  validateProjectedCreditCapacity(sections, context);
  const automaticCleanupOperations = applyProjectedDeletePlanning(sections, context);
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
  const needsAttention = rows.filter((row) => row.warnings.length > 0 || row.errors.length > 0).length;
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
      blocked: allHeaderErrors.length > 0,
    },
    automaticCleanupOperations,
  };
}

/**
 * The five-Credits-per-Work/Performer product limit is evaluated against the
 * complete pending state, not source row order.  An explicit Credit Delete
 * can therefore free a slot for an Add in the same atomic import.
 */
function validateProjectedCreditCapacity(
  sections: ImportCatalogSection[],
  context: ImportCsvPreviewContext,
) {
  const creditRows = sections
    .filter((section) => section.dataType === "credits")
    .flatMap((section) => section.preview.rows);
  if (!creditRows.length) return;

  const projected = new Map((context.credits ?? []).map((credit) => [credit.id, {
    id: credit.id,
    workType: credit.workType,
    workId: credit.workId,
    performerId: credit.performerId,
  }]));
  const resolveCredit = (ref: string) => {
    const result = resolveSakuravaIdentity("R", ref, context.credits ?? []);
    return result.status === "resolved" ? result.record : undefined;
  };
  for (const row of creditRows) {
    if (row.detectedResult !== "Deleted") continue;
    const target = resolveCredit(row.values["Sakurava Ref"] ?? "");
    if (target) projected.delete(target.id);
  }

  const countFor = (candidate: { workType: string; workId: string; performerId: string }) =>
    [...projected.values()].filter((credit) =>
      credit.workType === candidate.workType
        && credit.workId === candidate.workId
        && credit.performerId === candidate.performerId,
    ).length;
  for (const row of creditRows) {
    if (!["Added", "Modified"].includes(row.detectedResult) || row.errors.length > 0) continue;
    const target = row.detectedResult === "Modified"
      ? resolveCredit(row.values["Sakurava Ref"] ?? "")
      : undefined;
    const workType = ((row.values["Work Type"] ?? "") || target?.workType || "").trim().toLowerCase();
    if (workType !== "video" && workType !== "image") continue;
    const workRef = (row.values["Work Ref"] ?? "").trim();
    const performerRef = (row.values["Performer Ref"] ?? "").trim();
    const work = workRef
      ? workType === "video"
        ? resolveSakuravaIdentity("V", workRef, context.videos)
        : resolveSakuravaIdentity("I", workRef, context.images)
      : null;
    const performer = performerRef
      ? resolveSakuravaIdentity("P", performerRef, context.performers)
      : null;
    const candidate: { id: string; workType: "video" | "image"; workId: string; performerId: string } = {
      id: target?.id ?? `preview:${row.rowNumber}`,
      workType,
      workId: work?.status === "resolved" ? work.record.id : (target?.workId ?? ""),
      performerId: performer?.status === "resolved" ? performer.record.id : (target?.performerId ?? ""),
    };
    if (!candidate.workType || !candidate.workId || !candidate.performerId) continue;
    const previous = target ? projected.get(target.id) : undefined;
    if (previous) projected.delete(previous.id);
    if (countFor(candidate) >= 5) {
      if (previous) projected.set(previous.id, previous);
      addRowError(row, "A Work may have at most five Credits for the same Performer.");
      continue;
    }
    projected.set(candidate.id, candidate);
  }
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
  const permanentIds = new Set((context.glossary ?? []).map((entry) => entry.id));

  for (const row of rows) {
    const ref = (row.values["Sakurava Ref"] ?? "").trim();
    const parent = (row.values["Parent Ref"] ?? "").trim();
    if (isTemporaryGlossaryRef(ref) && permanentIds.has(ref)) {
      addRowError(row, "Temporary Glossary identifier conflicts with an existing permanent record.");
    }
    if (!isTemporaryGlossaryRef(parent)) continue;
    if (parent === ref) addRowError(row, "A Glossary entry cannot be its own parent.");
    else if (!byRef.has(parent)) addRowError(row, `Glossary parent was not found: ${parent}.`);
  }

  const parents = new Map((context.glossary ?? []).map((entry) => [
    sakuravaRef("GLO", entry.sakuravaRef ?? entry.id),
    entry.parentId ? sakuravaRef("GLO", context.glossary?.find((candidate) => candidate.id === entry.parentId)?.sakuravaRef ?? entry.parentId) : "",
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

/**
 * Builds deterministic cleanup updates outside catalog rows. The immutable
 * import plan consumes them before the associated Delete operations.
 */
function addCategoryCleanupOperations(
  row: ImportCsvPreviewRow,
  context: ImportCsvPreviewContext,
  operations: ImportCleanupOperation[],
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  const category = context.categories.find((candidate) => sakuravaRefMatches("CAT", row.values["Sakurava Ref"] ?? "", candidate));
  if (!category) return;
  const dependents = [
    ...context.videos.map((record) => ({ section: "videos" as const, record })),
    ...context.images.map((record) => ({ section: "images" as const, record })),
    ...context.performers.map((record) => ({ section: "performers" as const, record })),
  ].filter(({ section, record }) =>
    !isDeleted(section, record, deleted)
      && parseCategories(record.categoriesJson).some((name) => name.toLowerCase() === category.name.toLowerCase()),
  );
  const children = context.categories.filter((candidate) =>
    candidate.parentKey === category.key && !isDeleted("categories", candidate, deleted),
  );
  for (const { section, record } of dependents) {
    const values = parseCategories(record.categoriesJson).filter((name) => name.toLowerCase() !== category.name.toLowerCase());
    addCleanupOperation(operations, section, "update", record.id, record, { categoriesJson: JSON.stringify(values) }, "Category relationship will be cleared");
  }
  for (const child of children) addCleanupOperation(operations, "categories", "update", child.key, child, { parentKey: null }, "Child Category parent relationship will be cleared");
  for (const credit of context.credits ?? []) {
    if (isDeleted("credits", credit, deleted)) continue;
    const proposed: Record<string, unknown> = {};
    if (credit.creditTypeCategoryId === category.key) proposed.creditTypeCategoryId = null;
    if (credit.roleImportanceCategoryId === category.key) proposed.roleImportanceCategoryId = null;
    if (Object.keys(proposed).length) addCleanupOperation(operations, "credits", "update", credit.id, credit, proposed, "Credit Category relationship will be cleared");
  }
}

function addGlossaryCleanupOperations(
  row: ImportCsvPreviewRow,
  context: ImportCsvPreviewContext,
  operations: ImportCleanupOperation[],
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  const entry = (context.glossary ?? []).find((candidate) => sakuravaRefMatches("GLO", row.values["Sakurava Ref"] ?? "", candidate));
  if (!entry) return;
  const descendants = (context.glossary ?? []).filter((candidate) =>
    candidate.parentId === entry.id && !isDeleted("glossary", candidate, deleted),
  );
  for (const child of descendants) addCleanupOperation(operations, "glossary", "update", child.id, child, { parentId: null }, "Glossary parent relationship will be cleared");
}

/**
 * Removes only links owned by records that survive the package.  Delete-all
 * must not leave a protected Video, Image, or Performer pointing at a record
 * that the same immutable plan removes.
 */
function addSurvivingRelationshipCleanupOperations(
  context: ImportCsvPreviewContext,
  operations: ImportCleanupOperation[],
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  const sources: Array<{
    section: "videos" | "images" | "performers";
    record: { id: string } & Record<string, unknown>;
  }> = [
    ...context.videos.map((record) => ({ section: "videos" as const, record: record as unknown as { id: string } & Record<string, unknown> })),
    ...context.images.map((record) => ({ section: "images" as const, record: record as unknown as { id: string } & Record<string, unknown> })),
    ...context.performers.map((record) => ({ section: "performers" as const, record: record as unknown as { id: string } & Record<string, unknown> })),
  ];
  const relationships = [
    { section: "videos" as const, field: "relatedPerformersJson", target: "performers" as const, idField: "performerId" },
    { section: "videos" as const, field: "relatedImagesJson", target: "images" as const, idField: "recordId" },
    { section: "images" as const, field: "relatedPerformersJson", target: "performers" as const, idField: "performerId" },
    { section: "images" as const, field: "relatedVideosJson", target: "videos" as const, idField: "recordId" },
    { section: "performers" as const, field: "relatedVideosJson", target: "videos" as const, idField: "recordId" },
    { section: "performers" as const, field: "relatedImagesJson", target: "images" as const, idField: "recordId" },
  ];

  for (const { section, record } of sources) {
    if (isDeleted(section, record, deleted)) continue;
    for (const relationship of relationships) {
      if (relationship.section !== section) continue;
      const nextValue = removeDeletedRelationshipTargets(
        record[relationship.field],
        relationship.idField,
        relationship.target,
        context,
        deleted,
      );
      if (!nextValue) continue;
      addCleanupOperation(
        operations,
        section,
        "update",
        record.id,
        record,
        { [relationship.field]: nextValue },
        "Related catalog relationship will be cleared",
      );
    }
  }
}

function removeDeletedRelationshipTargets(
  rawValue: unknown,
  idField: string,
  target: "videos" | "images" | "performers",
  context: ImportCsvPreviewContext,
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  if (typeof rawValue !== "string") return null;
  try {
    const values = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(values)) return null;
    const remaining = values.filter((value) => {
      if (!value || typeof value !== "object") return true;
      const targetId = (value as Record<string, unknown>)[idField];
      if (typeof targetId !== "string") return true;
      const targetRecord = recordsForEntity(target, context).find((record) => record.id === targetId);
      return !targetRecord || !isDeleted(target, targetRecord, deleted);
    });
    return remaining.length === values.length ? null : JSON.stringify(remaining);
  } catch {
    // Existing malformed relationship JSON is still rejected by the
    // authoritative validator; automatic cleanup must not conceal corruption.
    return null;
  }
}

function addCleanupOperation(operations: ImportCleanupOperation[], section: ImportCleanupOperation["section"], action: ImportCleanupOperation["action"], recordId: string, currentRecord: object, proposedValues: Record<string, unknown>, detail: string) {
  const sourceIdentity = `cleanup:${section}:${recordId}:${action}`;
  const existing = operations.find((operation) => operation.sourceIdentity === sourceIdentity);
  if (!existing) {
    operations.push({ sourceIdentity, section, action, recordId, currentRecord, proposedValues, detail });
    return;
  }
  if (typeof proposedValues.categoriesJson === "string") {
    if (typeof existing.proposedValues.categoriesJson === "string") {
      const remaining = new Set(parseCategories(proposedValues.categoriesJson).map((value) => value.toLocaleLowerCase()));
      existing.proposedValues.categoriesJson = JSON.stringify(
        parseCategories(existing.proposedValues.categoriesJson)
          .filter((value) => remaining.has(value.toLocaleLowerCase())),
      );
    } else {
      existing.proposedValues.categoriesJson = proposedValues.categoriesJson;
    }
  }
  for (const [key, value] of Object.entries(proposedValues)) {
    if (key !== "categoriesJson") existing.proposedValues[key] = value;
  }
}

/**
 * Delete safety is evaluated against the catalog that will exist after the
 * whole package is applied.  Per-row validation cannot do this: a Category
 * that is used today is safe to remove when every record using it is also a
 * Delete operation in this package.
 */
function applyProjectedDeletePlanning(
  sections: ImportCatalogSection[],
  context: ImportCsvPreviewContext,
): ImportCleanupOperation[] {
  const cleanupOperations: ImportCleanupOperation[] = [];
  const sectionRows = new Map<ImportCsvEntity, ImportCsvPreviewRow[]>();
  for (const section of sections) {
    sectionRows.set(section.dataType, section.preview.rows);
  }
  const deleted = new Map<ImportCsvEntity, Set<string>>();
  for (const entity of ["videos", "images", "performers", "categories", "glossary", "credits"] as const) {
    const refs = new Set<string>();
    for (const row of sectionRows.get(entity) ?? []) {
      if (row.detectedResult === "Deleted" && row.errors.length === 0) {
        refs.add((row.values["Sakurava Ref"] ?? "").trim());
      }
    }
    deleted.set(entity, refs);
  }

  const deleteRank = new Map<ImportCsvPreviewRow, number>();
  for (const entity of ["videos", "images", "performers"] as const) {
    for (const row of sectionRows.get(entity) ?? []) {
      if (row.detectedResult !== "Deleted") continue;
      const record = recordsForEntity(entity, context).find((candidate) =>
        sakuravaRefMatches(entity === "videos" ? "VID" : entity === "images" ? "IMG" : "PER", row.values["Sakurava Ref"] ?? "", candidate),
      );
      const survivingCredits = record
        ? (context.credits ?? []).filter((credit) =>
            creditUsesRecord(credit, entity, record.id) && !isDeleted("credits", credit, deleted))
        : [];
      if (survivingCredits.length > 0) {
        row.detectedResult = "Error";
        row.warnings.push(`${survivingCredits.length} Credit references cannot be cleared safely. This row will not be applied.`);
        deleted.get(entity)?.delete((row.values["Sakurava Ref"] ?? "").trim());
      }
      deleteRank.set(row, 10);
    }
  }

  // Credit-protected rows have now been removed from the Delete set. Clear
  // only their links to records that the same package still deletes.
  addSurvivingRelationshipCleanupOperations(context, cleanupOperations, deleted);

  const categoryRows = sectionRows.get("categories") ?? [];
  for (const row of categoryRows) {
    if (row.detectedResult !== "Deleted") continue;
    const category = context.categories.find((candidate) => sakuravaRefMatches("CAT", row.values["Sakurava Ref"] ?? "", candidate));
    if (!category) continue;
    const deletedCategories = deleted.get("categories")!;
    const survivingChildren = context.categories.filter((candidate) =>
      candidate.parentKey === category.key && !isDeleted("categories", candidate, deleted),
    );
    const survivingRecords = [
      ...context.videos.map((record) => ({ entity: "videos" as const, record })),
      ...context.images.map((record) => ({ entity: "images" as const, record })),
      ...context.performers.map((record) => ({ entity: "performers" as const, record })),
    ].filter(({ entity, record }) => recordStillUsesCategory(entity, record, category, sectionRows, deleted));
    const survivingCredits = (context.credits ?? []).filter((credit) =>
      !isDeleted("credits", credit, deleted)
        && (credit.creditTypeCategoryId === category.key || credit.roleImportanceCategoryId === category.key),
    );
    const deletedChildren = context.categories.filter((candidate) =>
      candidate.parentKey === category.key && isDeleted("categories", candidate, deleted),
    );

    const detail = survivingCredits.length > 0
      ? `Used by ${survivingCredits.length} Credits that will be preserved`
      : survivingChildren.length > 0
        ? `${survivingChildren.length} child Categories remain`
        : survivingRecords.length > 0
          ? `${survivingRecords.length} dependent records are not included in Delete`
          : deletedChildren.length > 0
            ? `${deletedChildren.length} child Categories will be deleted first`
            : "Used only by records that are also being deleted";
    if (survivingCredits.length > 0 || survivingChildren.length > 0 || survivingRecords.length > 0) {
      addCategoryCleanupOperations(row, context, cleanupOperations, deleted);
    }
    row.dependencyPlan = {
      requiresDecision: false,
      detail,
      deleteOrder: categoryDeleteDepth(category, context.categories, deletedCategories, new Set()),
    };
    deleteRank.set(row, 100 + row.dependencyPlan.deleteOrder);
  }

  const glossaryRows = sectionRows.get("glossary") ?? [];
  for (const row of glossaryRows) {
    if (row.detectedResult !== "Deleted") continue;
    const entry = (context.glossary ?? []).find((candidate) => sakuravaRefMatches("GLO", row.values["Sakurava Ref"] ?? "", candidate));
    if (!entry) continue;
    const deletedGlossary = deleted.get("glossary")!;
    const hierarchyBroken = glossaryHierarchyHasCycle(entry.id, context.glossary ?? []);
    const survivingChildren = (context.glossary ?? []).filter((candidate) =>
      candidate.parentId === entry.id && !isDeleted("glossary", candidate, deleted),
    );
    const deletedChildren = (context.glossary ?? []).filter((candidate) =>
      candidate.parentId === entry.id && isDeleted("glossary", candidate, deleted),
    );
    const detail = hierarchyBroken
      ? "Glossary hierarchy needs repair before deletion"
      : survivingChildren.length > 0
        ? `${survivingChildren.length} child terms remain`
        : deletedChildren.length > 0
          ? `${deletedChildren.length} child terms will be deleted first`
          : "Record will be deleted";
    row.dependencyPlan = {
      requiresDecision: false,
      detail,
      deleteOrder: glossaryDeleteDepth(entry.id, context.glossary ?? [], deletedGlossary, new Set()),
    };
    deleteRank.set(row, 200 + row.dependencyPlan.deleteOrder);
    if (!hierarchyBroken && survivingChildren.length > 0) {
      addGlossaryCleanupOperations(row, context, cleanupOperations, deleted);
    }
    if (hierarchyBroken) {
      row.detectedResult = "Error";
      row.warnings.push("Glossary hierarchy is invalid. This row will not be applied.");
    }
  }

  for (const row of sectionRows.get("credits") ?? []) {
    if (row.detectedResult === "Deleted") {
      row.dependencyPlan = { requiresDecision: false, detail: "Credit will be deleted", deleteOrder: 0 };
    }
  }

  // This rank is consumed by the immutable operation plan; the preview itself
  // intentionally keeps spreadsheet/source row order.
  for (const section of sections) {
    for (const row of section.preview.rows) {
      if (row.detectedResult === "Deleted" && !row.dependencyPlan) {
        row.dependencyPlan = { requiresDecision: false, detail: "Record will be deleted", deleteOrder: deleteRank.get(row) ?? 10 };
      }
    }
  }
  return cleanupOperations;
}

function recordsForEntity(
  entity: "videos" | "images" | "performers",
  context: ImportCsvPreviewContext,
) {
  return entity === "videos" ? context.videos : entity === "images" ? context.images : context.performers;
}

function creditUsesRecord(
  credit: NonNullable<ImportCsvPreviewContext["credits"]>[number],
  entity: "videos" | "images" | "performers",
  recordId: string,
) {
  return entity === "performers"
    ? credit.performerId === recordId
    : credit.workType === (entity === "videos" ? "video" : "image") && credit.workId === recordId;
}

function isDeleted(
  entity: ImportCsvEntity,
  record: { id?: string; key?: string; sakuravaRef?: string },
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  const prefix = entity === "videos" ? "VID" : entity === "images" ? "IMG" : entity === "performers" ? "PER" : entity === "categories" ? "CAT" : entity === "credits" ? "R" : "GLO";
  return Array.from(deleted.get(entity) ?? []).some((ref) => sakuravaRefMatches(prefix, ref, record));
}

function recordStillUsesCategory(
  entity: "videos" | "images" | "performers",
  record: { id: string; sakuravaRef?: string; categoriesJson: string },
  category: { name: string },
  sectionRows: Map<ImportCsvEntity, ImportCsvPreviewRow[]>,
  deleted: Map<ImportCsvEntity, Set<string>>,
) {
  if (isDeleted(entity, record, deleted)) return false;
  const row = (sectionRows.get(entity) ?? []).find((candidate) => sakuravaRefMatches(entity === "videos" ? "VID" : entity === "images" ? "IMG" : "PER", candidate.values["Sakurava Ref"] ?? "", record));
  const value = row && row.detectedResult === "Modified" ? row.values.Categories : undefined;
  if (value !== undefined && value.trim()) {
    if (value === SAKURAVA_CLEAR_VALUE) return false;
    return parseCategories(value).some((name) => name.toLocaleLowerCase() === category.name.trim().toLocaleLowerCase());
  }
  return parseCategories(record.categoriesJson).some((name) => name.toLocaleLowerCase() === category.name.trim().toLocaleLowerCase());
}

function parseCategories(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  } catch {
    // Imported categories use semicolon-separated text; stored values use JSON.
  }
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

function categoryDeleteDepth(
  category: { key: string },
  categories: ImportCsvPreviewContext["categories"],
  deleted: Set<string>,
  seen: Set<string>,
): number {
  if (seen.has(category.key)) return 0;
  seen.add(category.key);
  return Math.max(0, ...categories.filter((candidate) => candidate.parentKey === category.key && isDeleted("categories", candidate, new Map([["categories", deleted]]))).map((child) => 1 + categoryDeleteDepth(child, categories, deleted, new Set(seen))));
}

function glossaryDeleteDepth(
  id: string,
  glossary: NonNullable<ImportCsvPreviewContext["glossary"]>,
  deleted: Set<string>,
  seen: Set<string>,
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  return Math.max(0, ...glossary.filter((candidate) => candidate.parentId === id && isDeleted("glossary", candidate, new Map([["glossary", deleted]]))).map((child) => 1 + glossaryDeleteDepth(child.id, glossary, deleted, new Set(seen))));
}

function glossaryHierarchyHasCycle(startId: string, glossary: NonNullable<ImportCsvPreviewContext["glossary"]>) {
  const byId = new Map(glossary.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  let current = byId.get(startId);
  while (current?.parentId) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}

function addRowError(row: ImportCsvPreviewRow, message: string) {
  if (!row.errors.includes(message)) row.errors.push(message);
  row.detectedResult = "Error";
}

function stripUtf8Bom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
