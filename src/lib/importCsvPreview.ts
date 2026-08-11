import type {
  GlossaryEntry,
  Credit,
  Image,
  ManagedCategory,
  Performer,
  Video,
} from "../backend/types";
import { normalizeImportDate } from "./importDate";
import {
  buildCsv,
  creditCsvSchema,
  categoryCsvSchema,
  imageCsvSchema,
  performerCsvSchema,
  glossaryCsvSchema,
  importSchemaFor,
  legacyImportHeadersFor,
  exportEntityLabel,
  exportRowsFor,
  isExportExampleRow,
  sakuravaRef,
  sakuravaRefMatches,
  videoCsvSchema,
  type ExportCsvEntity,
  type CsvSchemaColumn,
  type CreditCsvRecord,
} from "./exportCsv";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";
import {
  canonicalImportIdentity,
  resolveSakuravaIdentity,
  sakuravaIdentityLookupKeys,
  sectionCodeForLegacyPrefix,
  type SakuravaRefSectionCode,
} from "./sakuravaRef";
import {
  IMPORT_MAX_CELL_CHARACTERS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS_PER_SECTION,
  IMPORT_MAX_TOTAL_ROWS,
  importLimitMessage,
} from "./importLimits";

export type ImportCsvEntity = ExportCsvEntity;

export type ImportCsvAction = "Auto" | "Add" | "Update" | "Delete";
export type ImportCsvDetectedResult =
  | "Added"
  | "Modified"
  | "Unchanged"
  | "Deleted"
  | "Skipped"
  | "Error";

export type ImportCsvPreviewRow = {
  rowNumber: number;
  action: ImportCsvAction | "Invalid";
  detectedResult: ImportCsvDetectedResult;
  target: string;
  changes: string[];
  changeDetails?: Array<{ field: string; before: string; after: string; cleared?: boolean }>;
  clearedFields?: string[];
  warnings: string[];
  errors: string[];
  values: Record<string, string>;
  /**
   * Catalog-level projected-state planning annotates destructive rows here.
   * Keeping this on the canonical Preview row means the table and operation
   * plan describe the same dependency assessment.
   */
  dependencyPlan?: {
    requiresDecision: boolean;
    detail: string;
    deleteOrder: number;
  };
};

export type ImportCsvPreviewSummary = {
  entity: ImportCsvEntity | "unknown";
  totalRows: number;
  added: number;
  modified: number;
  unchanged: number;
  deleted: number;
  skipped: number;
  warnings: number;
  errors: number;
  blocked: boolean;
};

export type ImportCsvPreview = {
  summary: ImportCsvPreviewSummary;
  rows: ImportCsvPreviewRow[];
  headerErrors: string[];
  headerWarnings: string[];
};

export type ImportCsvPreviewContext = {
  videos: Video[];
  images: Image[];
  performers: Performer[];
  categories: ManagedCategory[];
  glossary?: GlossaryEntry[];
  credits?: Credit[];
};

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  errors?: string[];
};

export type ImportPreviewOptions = {
  locale?: string;
  rowNumbers?: number[];
  invalidDateMessage?: (field: string, format: string) => string;
  allowLegacyColumns?: boolean;
};

type EntityDefinition = {
  entity: ImportCsvEntity;
  sectionCode: SakuravaRefSectionCode;
  mainHeader: string;
  requiredHeaders: string[];
  expectedHeaders: string[];
  records: (context: ImportCsvPreviewContext) => Array<Video | Image | Performer | ManagedCategory | GlossaryEntry | Credit>;
};

const rawTechnicalHeaders = new Set([
  "sakuravaUpdateKey",
  "id",
  "uuid",
  "ratingJson",
  "categoriesJson",
  "relatedVideosJson",
  "relatedImagesJson",
  "relatedPerformersJson",
  "galleryImagePathsJson",
  "performerThumbnailPathsJson",
]);

const validActions = new Set(["Auto", "Add", "Update", "Delete"]);

const entityDefinitions: EntityDefinition[] = [
  {
    entity: "videos",
    sectionCode: "V",
    mainHeader: "Title",
    requiredHeaders: ["Title"],
    expectedHeaders: videoCsvSchema.map((column) => column.header),
    records: (context) => context.videos,
  },
  {
    entity: "images",
    sectionCode: "I",
    mainHeader: "Title",
    requiredHeaders: ["Title"],
    expectedHeaders: imageCsvSchema.map((column) => column.header),
    records: (context) => context.images,
  },
  {
    entity: "performers",
    sectionCode: "P",
    mainHeader: "Name",
    requiredHeaders: ["Name"],
    expectedHeaders: performerCsvSchema.map((column) => column.header),
    records: (context) => context.performers,
  },
  {
    entity: "categories",
    sectionCode: "C",
    mainHeader: "Category Name",
    requiredHeaders: ["Category Name"],
    expectedHeaders: categoryCsvSchema.map((column) => column.header),
    records: (context) => context.categories,
  },
  {
    entity: "glossary",
    sectionCode: "G",
    mainHeader: "Term",
    requiredHeaders: ["Term", "Definition"],
    expectedHeaders: glossaryCsvSchema.map((column) => column.header),
    records: (context) => context.glossary ?? [],
  },
  {
    entity: "credits",
    sectionCode: "R",
    mainHeader: "Work Ref",
    requiredHeaders: ["Work Type", "Work Ref", "Performer Ref", "Character / Role", "Credited As Mode", "Character Mode"],
    expectedHeaders: creditCsvSchema.map((column) => column.header),
    records: (context) => context.credits ?? [],
  },
];

export function parseCsv(text: string): ParsedCsv {
  const errors: string[] = [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (next === "\n") {
        continue;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (inQuotes) {
    errors.push("CSV contains an unclosed quoted value.");
  }
  if (row.some((value) => value.length > 0) || rows.length === 0) {
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;

  return {
    headers: headers.map((header) => header.trim()),
    rows: dataRows.filter((dataRow) =>
      dataRow.some((value) => value.trim().length > 0),
    ),
    errors,
  };
}

export function buildImportCsvPreview(
  csvText: string,
  context: ImportCsvPreviewContext,
  options: ImportPreviewOptions = {},
): ImportCsvPreview {
  if (new TextEncoder().encode(csvText).byteLength > IMPORT_MAX_FILE_BYTES) {
    return {
      summary: summarizeRows("unknown", [], [importLimitMessage("file")]),
      rows: [],
      headerErrors: [importLimitMessage("file")],
      headerWarnings: [],
    };
  }
  return buildImportTablePreview(parseCsv(csvText), context, options);
}

export function buildImportTablePreview(
  parsed: ParsedCsv,
  context: ImportCsvPreviewContext,
  options: ImportPreviewOptions = {},
): ImportCsvPreview {
  const headerErrors: string[] = [];
  const headerWarnings: string[] = [];
  const definition = detectCsvEntity(parsed.headers);
  const locale = options.locale || "en-US";
  const importRows = parsed.rows.flatMap((row, index) =>
    isExportExampleRow(parsed.headers, row)
      ? []
      : [{ row, rowNumber: options.rowNumbers?.[index] ?? index + 2 }],
  );

  headerErrors.push(...(parsed.errors ?? []));
  if (importRows.length > IMPORT_MAX_ROWS_PER_SECTION) {
    headerErrors.push(importLimitMessage("sectionRows"));
  }
  if (importRows.length > IMPORT_MAX_TOTAL_ROWS) {
    headerErrors.push(importLimitMessage("totalRows"));
  }
  if ([...parsed.headers, ...importRows.flatMap(({ row }) => row)].some((value) => value.length > IMPORT_MAX_CELL_CHARACTERS)) {
    headerErrors.push(importLimitMessage("cell"));
  }
  validateHeaders(
    parsed.headers,
    definition,
    headerErrors,
    headerWarnings,
    options.allowLegacyColumns !== false,
  );

  if (!definition || headerErrors.length > 0) {
    return {
      summary: summarizeRows("unknown", [], headerErrors),
      rows: [],
      headerErrors,
      headerWarnings,
    };
  }

  const currentRowsByRef = buildCurrentRowsByRef(definition, context, headerErrors);
  const duplicateRefs = findDuplicateRefs(parsed.headers, importRows.map(({ row }) => row));
  const rows = importRows.map(({ row, rowNumber }) =>
    previewRow({
      row,
      rowNumber,
      headers: parsed.headers,
      definition,
      currentRowsByRef,
      duplicateRefs,
      context,
      locale,
      invalidDateMessage: options.invalidDateMessage,
    }),
  );

  return {
    summary: summarizeRows(definition.entity, rows, headerErrors),
    rows,
    headerErrors,
    headerWarnings,
  };
}

export function parseImportAction(value: string): ImportCsvAction | null {
  const normalized = value.trim();
  if (!normalized) {
    return "Auto";
  }

  // Create remains a compatibility input for older workbooks. Public current
  // exports and Preview use Add.
  if (normalized.toLowerCase() === "create") return "Add";
  const match = Array.from(validActions).find(
    (action) => action.toLowerCase() === normalized.toLowerCase(),
  );

  return (match as ImportCsvAction | undefined) ?? null;
}

export function detectCsvEntity(headers: string[]): EntityDefinition | null {
  return (
    entityDefinitions.find((definition) =>
      definition.expectedHeaders.every((header) => headers.includes(header)),
    ) ??
    entityDefinitions.find(
      (definition) =>
        headers.includes("Action") &&
        headers.includes("Sakurava Ref") &&
        headers.includes(definition.mainHeader),
    ) ??
    null
  );
}

function validateHeaders(
  headers: string[],
  definition: EntityDefinition | null,
  errors: string[],
  warnings: string[],
  allowLegacyColumns: boolean,
) {
  if (headers.length === 0) {
    errors.push("CSV file is empty.");
    return;
  }

  const duplicateHeaders = headers.filter(
    (header, index) => header && headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    errors.push(`Duplicate headers are not allowed: ${unique(duplicateHeaders).join(", ")}.`);
  }

  const technicalHeaders = headers.filter((header) => rawTechnicalHeaders.has(header));
  if (technicalHeaders.length > 0) {
    errors.push(
      `Old technical export headers are not supported: ${technicalHeaders.join(", ")}.`,
    );
  }

  if (headers[0] !== "Action" || headers[1] !== "Sakurava Ref") {
    errors.push("CSV must start with Action and Sakurava Ref columns.");
  }

  if (!definition) {
    errors.push("CSV headers do not match a Sakurava Bulk Manual Edit CSV type.");
    return;
  }


  const allowedHeaders = allowLegacyColumns
    ? new Set(importSchemaFor(definition.entity).map((column) => column.header))
    : new Set(definition.expectedHeaders);
  // C2 no longer exports package-local identity/decision columns. Older
  // workbooks can retain them; they are safely ignored during Preview.
  allowedHeaders.add("Import Ref");
  allowedHeaders.add("Import Resolution");
  const unsupportedHeaders = headers.filter(
    (header) => header && !allowedHeaders.has(header),
  );
  if (unsupportedHeaders.length > 0) {
    errors.push(`Unsupported headers are not allowed: ${unsupportedHeaders.join(", ")}.`);
  }

  for (const requiredHeader of ["Action", "Sakurava Ref", ...definition.requiredHeaders]) {
    if (!headers.includes(requiredHeader)) {
      errors.push(`Missing required header: ${requiredHeader}.`);
    }
  }

  const missingExpectedHeaders = definition.expectedHeaders.filter(
    (header) => !headers.includes(header),
  );
  if (missingExpectedHeaders.length > 0) {
    const message = `Missing expected headers: ${missingExpectedHeaders.join(", ")}.`;
    if (definition.entity === "credits") errors.push(message);
    else warnings.push(message);
  }
  if (definition.entity === "credits" && definition.expectedHeaders.some(
    (header, index) => headers[index] !== header,
  )) {
    errors.push("Credits CSV headers must use the published Sakurava order.");
  }
  const legacyHeaders = headers.filter((header) => legacyImportHeadersFor(definition.entity).includes(header));
  if (legacyHeaders.length > 0) {
    warnings.push("This file uses compatibility columns from Sakurava contract version 1.");
  }
}

function previewRow({
  row,
  rowNumber,
  headers,
  definition,
  currentRowsByRef,
  duplicateRefs,
  context,
  locale,
  invalidDateMessage,
}: {
  row: string[];
  rowNumber: number;
  headers: string[];
  definition: EntityDefinition;
  currentRowsByRef: Map<string, Record<string, string>>;
  duplicateRefs: Set<string>;
  context: ImportCsvPreviewContext;
  locale: string;
  invalidDateMessage?: (field: string, format: string) => string;
}): ImportCsvPreviewRow {
  const values = rowValues(headers, row);
  const warnings: string[] = [];
  const errors: string[] = [];
  const changes: string[] = [];
  const changeDetails: Array<{ field: string; before: string; after: string; cleared?: boolean }> = [];
  const clearedFields: string[] = [];
  const action = parseImportAction(values.Action ?? "");
  let ref = (values["Sakurava Ref"] ?? "").trim();
  const mainValue = (values[definition.mainHeader] ?? "").trim();
  let identityIsUsable = true;

  if (!action) {
    warnings.push("Action is not supported. This row will not be applied.");
    identityIsUsable = false;
  }

  const temporaryRef = definition.entity === "glossary" && isTemporaryGlossaryRef(ref);
  const identityResolution = ref && !temporaryRef
    ? resolveSakuravaIdentity(
        definition.sectionCode,
        ref,
        definition.records(context),
      )
    : null;
  if (identityResolution?.status === "malformed") {
    warnings.push(`Sakurava Ref is not valid for ${exportEntityLabel(definition.entity)}. This row will not be applied.`);
    identityIsUsable = false;
  } else if (identityResolution?.status === "ambiguous") {
    warnings.push(`Sakurava Ref resolves to more than one ${exportEntityLabel(definition.entity)} record. This row will not be applied.`);
    identityIsUsable = false;
  }

  if (ref && duplicateRefs.has(ref)) {
    warnings.push(`Duplicate Sakurava Ref in CSV: ${ref}. This row will not be applied.`);
    identityIsUsable = false;
  }

  if (action === "Delete") {
    if (!ref || !identityIsUsable) {
      warnings.push("Delete requires a valid Sakurava Ref. This row will not be applied.");
    } else if (temporaryRef || !currentRowsByRef.has(canonicalImportIdentity(ref))) {
      warnings.push(`Sakurava Ref was not found. This row will not be applied.`);
    }
    return {
      rowNumber,
      action,
      detectedResult: !ref || !identityIsUsable || temporaryRef || !currentRowsByRef.has(canonicalImportIdentity(ref)) ? "Error" : "Deleted",
      target: targetText(ref, mainValue),
      changes: ["Delete"],
      warnings,
      errors,
      values,
    };
  }

  if (action === "Add" && ref) {
    warnings.push("The entered Sakurava Ref will be ignored. A new Ref will be assigned.");
    values["Sakurava Ref"] = "";
    ref = "";
  }

  if (action === "Update" && (!ref || !identityIsUsable || temporaryRef)) {
    warnings.push("Update requires a valid Sakurava Ref. This row will not be applied.");
    return rowNotApplied(rowNumber, action, ref, mainValue, warnings, values);
  }

  const isAdd = !ref || temporaryRef;
  if (definition.entity === "credits") {
    validateCreditFields(values, context, ref, isAdd, errors);
  }
  validateEditableFields(
    values,
    definition,
    warnings,
    errors,
    locale,
    invalidDateMessage,
    isAdd ? "add" : "update",
  );
  const currentRow = currentRowsByRef.get(canonicalImportIdentity(ref));
  validateCategories(values, definition, currentRow, context, changes, warnings, errors);
  validateRelated(values, definition, currentRow, context, changes, warnings, errors);
  validateGlossaryRefs(values, definition, currentRow, context, changes, warnings, errors);
  validateManagedCategoryParent(values, definition, context, warnings);
  validateGlossaryFields(values, definition, ref, context, warnings);

  if (!ref || temporaryRef) {
    if (Object.values(values).some((value) => value.trim() === SAKURAVA_CLEAR_VALUE)) {
      warnings.push("The clear marker is only supported for an existing record. This row will not be applied.");
    }
    if (definition.entity === "credits") {
      applyCreditAddDefaults(values, warnings, errors);
      if (errors.length === 0) {
        addDuplicateCreditWarning(values, context, warnings);
      }
    } else {
      applyRequiredAddDefaults(values, definition, warnings);
    }

    return {
      rowNumber,
      action: action ?? "Invalid",
      detectedResult: !action || errors.length > 0 || warnings.some((message) => message.endsWith("This row will not be applied.")) ? "Error" : "Added",
      target: mainValue || "New row",
      changes: action === "Add" || action === "Auto" ? ["New record"] : changes,
      warnings,
      errors,
      values,
      clearedFields,
    };
  }

  if (!currentRow || !identityIsUsable) {
    warnings.push("Sakurava Ref was not found. This row will not be applied.");
    return rowNotApplied(rowNumber, action ?? "Invalid", ref, mainValue, warnings, values);
  } else {
    for (const header of headers) {
      if (header === "Action" || header === "Sakurava Ref" || header === "Import Ref" || header === "Import Resolution") {
        continue;
      }
      const column = schemaForDefinition(definition).find((candidate) => candidate.header === header);
      const nextValue = canonicalCellForComparison(column, values[header] ?? "");
      const currentValue = canonicalCellForComparison(column, currentRow[header] ?? "");
      if (!nextValue) {
        continue;
      }
      if (nextValue === SAKURAVA_CLEAR_VALUE) {
        const column = definition.expectedHeaders.includes(header)
          ? schemaForDefinition(definition).find((candidate) => candidate.header === header)
          : undefined;
        if (!column?.clearable) {
          warnings.push(`${header} cannot be cleared. The current value will be preserved.`);
          continue;
        }
        if (currentValue) {
          changes.push(header);
          clearedFields.push(header);
          changeDetails.push({ field: header, before: currentValue, after: "", cleared: true });
        }
        continue;
      }
      if (nextValue !== currentValue) {
        changes.push(header);
        changeDetails.push({ field: header, before: currentValue, after: nextValue });
      }
    }
  }

  return {
    rowNumber,
    action: action ?? "Invalid",
    detectedResult:
      changes.length > 0 ? "Modified" : "Unchanged",
    target: targetText(ref, mainValue),
    changes: unique(changes),
    changeDetails,
    warnings,
    errors,
    values,
    clearedFields,
  };
}

function validateManagedCategoryParent(
  values: Record<string, string>,
  definition: EntityDefinition,
  context: ImportCsvPreviewContext,
  warnings: string[],
) {
  if (definition.entity !== "categories") return;
  const parentRef = (values["Parent Ref"] ?? "").trim();
  if (parentRef && parentRef !== SAKURAVA_CLEAR_VALUE) {
    if (!context.categories.some((category) => sakuravaRefMatches("CAT", parentRef, category))) {
      warnings.push("Parent Category Ref was not found. The parent relationship will be empty.");
      values["Parent Ref"] = "";
    }
    return;
  }
  const parent = (values["Parent Category"] ?? "").trim();
  if (!parent || parent === SAKURAVA_CLEAR_VALUE) return;
  warnings.push("Parent Category requires a stable Parent Ref. The parent relationship will be empty.");
  values["Parent Category"] = "";
}

function rowNotApplied(
  rowNumber: number,
  action: ImportCsvPreviewRow["action"],
  ref: string,
  mainValue: string,
  warnings: string[],
  values: Record<string, string>,
): ImportCsvPreviewRow {
  return {
    rowNumber,
    action,
    detectedResult: "Error",
    target: targetText(ref, mainValue),
    changes: [],
    warnings,
    errors: [],
    values,
  };
}

export function isBlockingImportPreviewWarning(_message: string) {
  // C3: record-level warnings are intentionally non-blocking. Only malformed
  // file structure is represented by headerErrors.
  return false;
}

function validateGlossaryFields(
  values: Record<string, string>,
  definition: EntityDefinition,
  recordRef: string,
  context: ImportCsvPreviewContext,
  warnings: string[],
) {
  if (definition.entity !== "glossary") return;

  const parentRef = (values["Parent Ref"] ?? "").trim();
  if (!parentRef) return;
  if (parentRef === SAKURAVA_CLEAR_VALUE) return;
  if (isTemporaryGlossaryRef(parentRef)) {
    if (parentRef === recordRef) {
      warnings.push("A Glossary entry cannot be its own parent. The parent relationship will be empty.");
      values["Parent Ref"] = "";
    }
    return;
  }
  const parentResolution = resolveSakuravaIdentity("G", parentRef, context.glossary ?? []);
  if (parentResolution.status === "malformed") {
    warnings.push("Parent Ref is not valid. The parent relationship will be empty.");
    values["Parent Ref"] = "";
    return;
  }
  if (canonicalImportIdentity(parentRef) === canonicalImportIdentity(recordRef)) {
    warnings.push("A Glossary entry cannot be its own parent. The parent relationship will be empty.");
    values["Parent Ref"] = "";
    return;
  }
  if (parentResolution.status !== "resolved") {
    warnings.push("Glossary parent Ref was not found. The parent relationship will be empty.");
    values["Parent Ref"] = "";
  }
}

function buildCurrentRowsByRef(
  definition: EntityDefinition,
  context: ImportCsvPreviewContext,
  headerErrors: string[],
) {
  const csv = buildCsv(
    importSchemaFor(definition.entity),
    currentRowsForDefinition(definition, context),
  );
  const parsed = parseCsv(csv);
  const rowsByRef = new Map<string, Record<string, string>>();
  const ambiguousRefs = new Set<string>();

  const records = definition.records(context);
  for (const [index, row] of parsed.rows.entries()) {
    const values = rowValues(parsed.headers, row);
    const ref = values["Sakurava Ref"]?.trim();
    if (!ref) {
      continue;
    }
    const record = records[index];
    const keys = record
      ? sakuravaIdentityLookupKeys(definition.sectionCode, record)
      : [canonicalImportIdentity(ref)];
    for (const key of keys) {
      if (ambiguousRefs.has(key)) continue;
      if (rowsByRef.has(key)) {
        rowsByRef.delete(key);
        ambiguousRefs.add(key);
        headerErrors.push(`The catalog contains a conflicting Sakurava identifier: ${ref}.`);
        continue;
      }
      rowsByRef.set(key, values);
    }
  }

  return rowsByRef;
}

function addDuplicateCreditWarning(
  values: Record<string, string>,
  context: ImportCsvPreviewContext,
  warnings: string[],
) {
  const workType = (values["Work Type"] ?? "").trim().toLowerCase();
  const work = workType === "video"
    ? resolveSakuravaIdentity("V", values["Work Ref"] ?? "", context.videos)
    : resolveSakuravaIdentity("I", values["Work Ref"] ?? "", context.images);
  const performer = resolveSakuravaIdentity("P", values["Performer Ref"] ?? "", context.performers);
  if (work.status !== "resolved" || performer.status !== "resolved") return;
  const role = (values["Role Importance"] ?? "").trim();
  const roleResolution = role
    ? resolveSakuravaIdentity("C", role, context.categories)
    : null;
  const matches = (context.credits ?? []).some((credit) =>
    credit.workType === workType
      && credit.workId === work.record.id
      && credit.performerId === performer.record.id
      && credit.characterName === (values["Character / Role"] ?? "").trim()
      && (credit.characterOriginalName ?? "") === clearCreditCell(values["Original Character"])
      && credit.creditedAsMode === (values["Credited As Mode"] ?? "").trim().toLowerCase()
      && (credit.creditedAs ?? "") === clearCreditCell(values["Credited As"])
      && (credit.creditTypeText ?? "") === clearCreditCell(values["Credit Type"])
      && (credit.roleImportanceCategoryId ?? "") === (roleResolution?.status === "resolved" ? roleResolution.record.key : "")
      && credit.characterMode === (values["Character Mode"] ?? "").trim().toLowerCase()
      && String(credit.billingOrder ?? "") === clearCreditCell(values["Billing Order"])
      && (credit.note ?? "") === clearCreditCell(values.Note),
  );
  if (matches) {
    warnings.push("A logically duplicate Credit will be added as a separate record.");
  }
}

function clearCreditCell(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed === SAKURAVA_CLEAR_VALUE ? "" : trimmed;
}

function validateCreditFields(
  values: Record<string, string>,
  context: ImportCsvPreviewContext,
  ref: string,
  isAdd: boolean,
  errors: string[],
) {
  const existing = ref
    ? resolveSakuravaIdentity("R", ref, context.credits ?? [])
    : null;
  const current = existing?.status === "resolved" ? existing.record : undefined;
  const suppliedWorkType = (values["Work Type"] ?? "").trim();
  const suppliedWorkRef = (values["Work Ref"] ?? "").trim();
  const suppliedPerformerRef = (values["Performer Ref"] ?? "").trim();
  const suppliedRoleImportance = (values["Role Importance"] ?? "").trim();

  if (suppliedWorkType && !["video", "image"].includes(suppliedWorkType.toLowerCase())) {
    errors.push("Work Type must be Video or Image.");
  }
  const workType = suppliedWorkType
    ? suppliedWorkType.toLowerCase()
    : current?.workType;
  const needsWork = isAdd || Boolean(suppliedWorkType || suppliedWorkRef);
  if (needsWork && !workType) {
    errors.push("Work Type is required for a Credit.");
  }
  if (needsWork && !suppliedWorkRef && isAdd) {
    errors.push("Work Ref is required for a Credit.");
  }
  if (!isAdd && suppliedWorkType && suppliedWorkType.toLowerCase() !== current?.workType && !suppliedWorkRef) {
    errors.push("Work Ref is required when Work Type changes.");
  }
  if (suppliedWorkRef) {
    const resolution = workType === "video"
      ? resolveSakuravaIdentity("V", suppliedWorkRef, context.videos)
      : workType === "image"
        ? resolveSakuravaIdentity("I", suppliedWorkRef, context.images)
        : null;
    if (resolution?.status !== "resolved") {
      errors.push("Work Ref was not found for the selected Work Type.");
    }
  }
  if (isAdd && !suppliedPerformerRef) {
    errors.push("Performer Ref is required for a Credit.");
  }
  if (suppliedPerformerRef && resolveSakuravaIdentity("P", suppliedPerformerRef, context.performers).status !== "resolved") {
    errors.push("Performer Ref was not found.");
  }
  if (suppliedRoleImportance && suppliedRoleImportance !== SAKURAVA_CLEAR_VALUE
    && resolveSakuravaIdentity("C", suppliedRoleImportance, context.categories).status !== "resolved") {
    errors.push("Role Importance Ref was not found.");
  }
  for (const [header, allowed] of [
    ["Credited As Mode", ["auto", "custom"]],
    ["Character Mode", ["text", "self"]],
  ] as const) {
    const value = (values[header] ?? "").trim();
    if (value && !(allowed as readonly string[]).includes(value.toLowerCase())) {
      errors.push(`${header} is not supported.`);
    }
  }
  const billingOrder = (values["Billing Order"] ?? "").trim();
  if (billingOrder && (!/^\d+$/.test(billingOrder) || Number(billingOrder) < 1)) {
    errors.push("Billing Order must be a positive whole number.");
  }
}

function applyCreditAddDefaults(
  values: Record<string, string>,
  warnings: string[],
  errors: string[],
) {
  for (const header of ["Work Type", "Work Ref", "Performer Ref"] as const) {
    if (!(values[header] ?? "").trim() && !errors.some((error) => error.startsWith(header))) {
      errors.push(`${header} is required for a Credit.`);
    }
  }
  if (!(values["Character / Role"] ?? "").trim()) {
    values["Character / Role"] = "N/A";
    warnings.push("Character / Role was empty and will use N/A.");
  }
  if (!(values["Credited As Mode"] ?? "").trim()) {
    values["Credited As Mode"] = "Auto";
    warnings.push("Credited As Mode was empty and will use the default value Auto.");
  }
  if (!(values["Character Mode"] ?? "").trim()) {
    values["Character Mode"] = "Text";
    warnings.push("Character Mode was empty and will use the default value Text.");
  }
}

function currentRowsForDefinition(
  definition: EntityDefinition,
  context: ImportCsvPreviewContext,
) {
  if (definition.entity !== "credits") {
    return exportRowsFor(definition.entity, definition.records(context));
  }
  const categoryRefByKey = new Map(
    context.categories.map((category) => [category.key, category.sakuravaRef ?? category.key]),
  );
  const videoRefById = new Map(
    context.videos.map((video) => [video.id, video.sakuravaRef ?? video.id]),
  );
  const imageRefById = new Map(
    context.images.map((image) => [image.id, image.sakuravaRef ?? image.id]),
  );
  const performerRefById = new Map(
    context.performers.map((performer) => [performer.id, performer.sakuravaRef ?? performer.id]),
  );
  return (context.credits ?? []).map((credit): CreditCsvRecord => ({
    ...credit,
    workType: credit.workType === "video" ? "Video" : "Image",
    creditedAsMode: credit.creditedAsMode === "auto" ? "Auto" : "Custom",
    characterMode: credit.characterMode === "self" ? "Self" : "Text",
    workRef: sakuravaRef(
      credit.workType === "video" ? "VID" : "IMG",
      (credit.workType === "video" ? videoRefById : imageRefById).get(credit.workId) ?? "",
    ),
    performerRef: sakuravaRef("PER", performerRefById.get(credit.performerId) ?? ""),
    roleImportanceRef: credit.roleImportanceCategoryId
      ? sakuravaRef("CAT", categoryRefByKey.get(credit.roleImportanceCategoryId) ?? "")
      : "",
  }));
}

function findDuplicateRefs(headers: string[], rows: string[][]) {
  const refIndex = headers.indexOf("Sakurava Ref");
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  if (refIndex < 0) {
    return duplicates;
  }

  for (const row of rows) {
    const ref = canonicalImportIdentity(row[refIndex] ?? "");
    if (!ref) {
      continue;
    }
    if (seen.has(ref)) {
      duplicates.add(ref);
    }
    seen.add(ref);
  }

  return duplicates;
}

function rowValues(headers: string[], row: string[]) {
  return Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? ""]),
  ) as Record<string, string>;
}

function validateEditableFields(
  values: Record<string, string>,
  definition: EntityDefinition,
  warnings: string[],
  errors: string[],
  locale: string,
  invalidDateMessage?: (field: string, format: string) => string,
  mode: "add" | "update" = "add",
) {
  const schema = schemaForDefinition(definition);
  for (const header of Object.keys(values)) {
    const column = schema.find((candidate) => candidate.header === header);
    const value = normalizeCell(values[header]);
    values[header] = value;
    if (!value) {
      continue;
    }

    if (value === SAKURAVA_CLEAR_VALUE) {
      const column = schemaForDefinition(definition).find((candidate) => candidate.header === header);
      if (!column?.clearable) {
        warnings.push(`${header} cannot be cleared. The current value will be preserved.`);
        values[header] = "";
      }
      continue;
    }

    if (header.endsWith("Date")) {
      const normalized = normalizeImportDate(value, { locale });
      if (normalized.state === "valid") {
        values[header] = normalized.value;
      } else if (normalized.state === "invalid") {
        warnings.push(mode === "update"
          ? `${header} is invalid. The existing value will be preserved.`
          : `${header} is invalid and will be left empty.`);
        values[header] = "";
      }
    }

    if (column?.valueType === "boolean") {
      const normalized = normalizeBooleanCell(value);
      if (normalized === null) {
        if (header === "R+") {
          errors.push("R+ must be true or false.");
          continue;
        }
        warnings.push(mode === "update"
          ? `${header} is invalid. The existing value will be preserved.`
          : `${header} is invalid and will use the default value false.`);
        values[header] = "false";
      } else {
        values[header] = normalized;
      }
    }

    if (column?.valueType === "number") {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        warnings.push(mode === "update"
          ? `${header} is invalid. The existing value will be preserved.`
          : `${header} is invalid and will be left empty.`);
        values[header] = "";
      } else if (!header.startsWith("Rating - ")) {
        if (!Number.isInteger(numberValue) || numberValue < 0) {
          warnings.push(`${header} is invalid and will use the default value 0.`);
          values[header] = "0";
        } else {
          values[header] = String(numberValue);
        }
      }
    }

    if (column?.allowedValues?.length && column.valueType !== "boolean") {
      const canonical = column.allowedValues.find(
        (candidate) => candidate.toLowerCase() === value.toLowerCase(),
      );
      if (!canonical) {
        warnings.push(mode === "update"
          ? `${header} is not supported. The existing value will be preserved.`
          : `${header} is not supported and will be left empty.`);
        values[header] = "";
      } else {
        values[header] = canonical;
      }
    }

    if (header.startsWith("Rating - ")) {
      const rating = Number(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        warnings.push(mode === "update"
          ? `${header} is invalid. The existing value will be preserved.`
          : `${header} is invalid and will be left empty.`);
        values[header] = "";
      } else {
        values[header] = String(rating);
      }
    }

    if (
      definition.entity === "performers" &&
      header === "Measurements" &&
      !/^\d+\s*\/\s*\d+\s*\/\s*\d+(\s*cm)?$/i.test(value)
    ) {
      warnings.push("Measurements should use 90 / 60 / 90 cm style.");
    }

    if (header === "Source Links") {
      for (const line of value.replace(/\r\n?/g, "\n").split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
        const divider = line.indexOf(" | ");
        const url = (divider < 0 ? line : line.slice(divider + 3)).trim();
        if (!/^https?:\/\/\S+$/i.test(url)) {
          warnings.push("Source Links are invalid and will be left empty.");
          values[header] = "";
          break;
        }
      }
    }

    if (header.includes("Path") || header.startsWith("Gallery Image") || header.startsWith("Mini Thumbnail")) {
      if (/[\u0000-\u001F]/.test(value)) {
        warnings.push(`${header} contains unsupported characters and will be left empty.`);
        values[header] = "";
      }
    }
  }
}

function applyRequiredAddDefaults(
  values: Record<string, string>,
  definition: EntityDefinition,
  warnings: string[],
) {
  const schema = schemaForDefinition(definition);
  for (const header of definition.requiredHeaders) {
    if ((values[header] ?? "").trim()) continue;
    const column = schema.find((candidate) => candidate.header === header);
    if (column?.allowedValues?.[0]) {
      values[header] = column.allowedValues[0];
      warnings.push(`${header} was invalid and will use the default value ${column.allowedValues[0]}.`);
      continue;
    }
    if (column?.valueType === "text") {
      values[header] = "N/A";
      warnings.push(`${header} was empty and will use N/A.`);
      continue;
    }
    if (column?.valueType === "number") {
      values[header] = "0";
      warnings.push(`${header} was invalid and will use 0.`);
      continue;
    }
    if (column?.valueType === "boolean") {
      values[header] = "false";
      warnings.push(`${header} was invalid and will use the default value false.`);
      continue;
    }
    warnings.push(`${header} is required for a new row. This row will not be applied.`);
  }
}

function schemaForDefinition(definition: EntityDefinition) {
  return importSchemaFor(definition.entity);
}

export function isTemporaryGlossaryRef(value: string) {
  return /^GLO-NEW-[A-Z0-9][A-Z0-9_-]{0,63}$/.test(value.trim());
}

function validateCategories(
  values: Record<string, string>,
  definition: EntityDefinition,
  currentRow: Record<string, string> | undefined,
  context: ImportCsvPreviewContext,
  changes: string[],
  warnings: string[],
  errors: string[],
) {
  if (definition.entity === "categories" || !("Categories" in values)) {
    return;
  }

  if (currentRow && (!values.Categories.trim() || values.Categories.trim() === SAKURAVA_CLEAR_VALUE)) {
    return;
  }

  const nextCategories = parseSemicolonList(values.Categories).map((categoryValue) => {
    const [possibleRef] = categoryValue.split("|");
    const candidate = possibleRef.trim();
    const resolution = resolveSakuravaIdentity("C", candidate, context.categories);
    if (resolution.status === "resolved") {
      return resolution.record.name;
    }
    const legacyName = context.categories.find(
      (category) => category.name.trim().toLowerCase() === categoryValue.trim().toLowerCase(),
    );
    if (legacyName) {
      return legacyName.name;
    }
    if (resolution.status === "malformed") {
      warnings.push("Category Ref was not found. Category will be empty.");
    } else if (resolution.status === "ambiguous") {
      warnings.push("Category Ref is ambiguous. Category will be empty.");
    } else {
      warnings.push("Category Ref was not found. Category will be empty.");
    }
    return "";
  });
  values.Categories = nextCategories.join("; ");
  const currentCategories = parseSemicolonList(currentRow?.Categories ?? "");
  const added = nextCategories.filter((category) => !currentCategories.includes(category));
  const removed = currentCategories.filter((category) => !nextCategories.includes(category));

  if (values.Categories.trim() === "" && currentCategories.length > 0) {
    warnings.push("This will remove all categories from this record if applied.");
  }

  if (added.length > 0) {
    changes.push(`Categories +${added.join("; ")}`);
  }
  if (removed.length > 0) {
    changes.push(`Categories -${removed.join("; ")}`);
  }
}

function validateRelated(
  values: Record<string, string>,
  definition: EntityDefinition,
  currentRow: Record<string, string> | undefined,
  context: ImportCsvPreviewContext,
  changes: string[],
  warnings: string[],
  _errors: string[],
) {
  const relatedHeaders = Object.keys(values).filter((header) =>
    header.startsWith("Related "),
  );

  for (const header of relatedHeaders) {
    if (currentRow && (!values[header].trim() || values[header].trim() === SAKURAVA_CLEAR_VALUE)) {
      continue;
    }
    const nextItems = parseSemicolonList(values[header]);
    const currentItems = parseSemicolonList(currentRow?.[header] ?? "");
    const nextIdentities = nextItems.map(canonicalRelatedItem);
    const currentIdentities = currentItems.map(canonicalRelatedItem);
    const added = nextItems.filter((_, index) => !currentIdentities.includes(nextIdentities[index]));
    const removed = currentItems.filter((_, index) => !nextIdentities.includes(currentIdentities[index]));

    if (values[header].trim() === "" && currentItems.length > 0) {
      warnings.push("This will remove all related items from this record if applied.");
    }

    const validItems = nextItems.filter((item) =>
      validateRelatedItem(header, item, context, warnings),
    );
    values[header] = validItems.join("; ");

    if (added.length > 0) {
      changes.push(`${header} +${added.join("; ")}`);
    }
    if (removed.length > 0) {
      changes.push(`${header} -${removed.join("; ")}`);
    }
  }
}

function validateRelatedItem(
  header: string,
  item: string,
  context: ImportCsvPreviewContext,
  warnings: string[],
) : boolean {
  const { ref, display } = parseRelatedItem(item);
  const target = relatedTarget(header);
  if (!target) {
    return true;
  }

  if (ref) {
    const resolution = resolveSakuravaIdentity(
      sectionCodeForLegacyPrefix(target.prefix),
      ref,
      relatedRecords(target, context),
    );
    if (resolution.status === "resolved") {
      return true;
    }
    if (resolution.status === "ambiguous") {
      warnings.push("A related Ref is ambiguous and will be cleared.");
      return false;
    }
    if (resolution.status === "malformed") {
      warnings.push("A related Ref is not valid and will be cleared.");
      return false;
    }
    warnings.push("A related Ref was not found and will be cleared.");
    return false;
  }

  if (!display) {
    warnings.push("A related value is missing a Sakurava Ref and will be cleared.");
    return false;
  }

  warnings.push("A related value is missing a Sakurava Ref and will be cleared.");
  return false;
}

function relatedTarget(header: string) {
  if (header === "Related Performers") {
    return { kind: "performers" as const, prefix: "PER" as const };
  }
  if (header === "Related Videos") {
    return { kind: "videos" as const, prefix: "VID" as const };
  }
  if (header === "Related Images") {
    return { kind: "images" as const, prefix: "IMG" as const };
  }
  return null;
}

function relatedRecords(
  target: NonNullable<ReturnType<typeof relatedTarget>>,
  context: ImportCsvPreviewContext,
) {
  if (target.kind === "performers") {
    return context.performers.map((record) => ({
      id: record.id,
      sakuravaRef: record.sakuravaRef,
      label: record.name,
    }));
  }
  if (target.kind === "videos") {
    return context.videos.map((record) => ({
      id: record.id,
      sakuravaRef: record.sakuravaRef,
      label: record.title,
    }));
  }
  return context.images.map((record) => ({
    id: record.id,
    sakuravaRef: record.sakuravaRef,
    label: record.title,
  }));
}

function validateGlossaryRefs(
  values: Record<string, string>,
  definition: EntityDefinition,
  currentRow: Record<string, string> | undefined,
  context: ImportCsvPreviewContext,
  changes: string[],
  warnings: string[],
  errors: string[],
) {
  if (!("Glossary Refs" in values)) return;
  const value = values["Glossary Refs"].trim();
  if (currentRow && (!value || value === SAKURAVA_CLEAR_VALUE)) return;
  const items = parseSemicolonList(value);
  const valid: string[] = [];
  for (const item of items) {
    const resolution = resolveSakuravaIdentity("G", item.split("|")[0].trim(), context.glossary ?? []);
    if (resolution.status !== "resolved") {
      errors.push(`Glossary Ref was not found or is ambiguous: ${item}.`);
    } else {
      valid.push(item);
    }
  }
  values["Glossary Refs"] = valid.join("; ");
  const current = parseSemicolonList(currentRow?.["Glossary Refs"] ?? "");
  if (valid.length !== current.length || valid.some((entry, index) => entry !== current[index])) {
    changes.push("Glossary Refs");
  }
  if (!value && current.length > 0) {
    warnings.push("This will remove all Glossary Refs from this record if applied.");
  }
}

function parseRelatedItem(item: string) {
  const [possibleRef, ...displayParts] = item.split("|");
  const ref = possibleRef.trim();
  const display = displayParts.join("|").trim();

  return { ref, display };
}

function parseSemicolonList(value: string) {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeRows(
  entity: ImportCsvPreviewSummary["entity"],
  rows: ImportCsvPreviewRow[],
  headerErrors: string[],
): ImportCsvPreviewSummary {
  return {
    entity,
    totalRows: rows.length,
    added: countRows(rows, "Added"),
    modified: countRows(rows, "Modified"),
    unchanged: countRows(rows, "Unchanged"),
    deleted: countRows(rows, "Deleted"),
    skipped: countRows(rows, "Skipped"),
    warnings: rows.reduce((total, row) => total + row.warnings.length, 0),
    errors: headerErrors.length + rows.reduce((total, row) => total + row.errors.length, 0),
    // Only an uninterpretable file blocks Apply. Row warnings are handled as
    // safe fallbacks or row-not-applied outcomes.
    blocked: headerErrors.length > 0,
  };
}

function countRows(rows: ImportCsvPreviewRow[], result: ImportCsvDetectedResult) {
  return rows.filter((row) => row.detectedResult === result).length;
}

function normalizeCell(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function canonicalRelatedItem(item: string) {
  const { ref, display } = parseRelatedItem(item);
  return ref ? canonicalImportIdentity(ref) : display;
}

function normalizeBooleanCell(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return "true";
  if (normalized === "false" || normalized === "0") return "false";
  return null;
}

function canonicalCellForComparison(
  column: CsvSchemaColumn<any> | undefined,
  value: string,
) {
  const normalized = normalizeCell(value);
  if (!normalized || normalized === SAKURAVA_CLEAR_VALUE) return normalized;
  if (column?.valueType === "boolean") return normalizeBooleanCell(normalized) ?? normalized;
  if (column?.valueType === "number") {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? String(numeric) : normalized;
  }
  if (column?.allowedValues?.length) {
    return column.allowedValues.find(
      (candidate) => candidate.toLowerCase() === normalized.toLowerCase(),
    ) ?? normalized;
  }
  if (column?.valueType === "list/reference") {
    const identityValues = column.header.startsWith("Related ") || column.header === "Parent Ref";
    return normalized
      .split(column.header === "Source Links" ? /\n+/ : ";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => identityValues
        ? canonicalImportIdentity(item.split("|")[0])
        : item)
      .join(column.header === "Source Links" ? "\n" : "; ");
  }
  return normalized;
}

function targetText(ref: string, mainValue: string) {
  return mainValue || ref || "Unresolved row";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
