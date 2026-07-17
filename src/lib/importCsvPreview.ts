import type {
  GlossaryEntry,
  Credit,
  Image,
  ManagedCategory,
  Performer,
  Video,
} from "../backend/types";
import { localDateFormatHint, normalizeImportDate } from "./importDate";
import {
  buildCsv,
  categoryCsvSchema,
  imageCsvSchema,
  performerCsvSchema,
  glossaryCsvSchema,
  importSchemaFor,
  legacyImportHeadersFor,
  exportRowsFor,
  sakuravaRef,
  videoCsvSchema,
  type ExportCsvEntity,
  type CsvSchemaColumn,
} from "./exportCsv";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";
import {
  IMPORT_MAX_CELL_CHARACTERS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS_PER_SECTION,
  IMPORT_MAX_TOTAL_ROWS,
  importLimitMessage,
} from "./importLimits";

export type ImportCsvEntity = ExportCsvEntity;

export type ImportCsvAction = "Auto" | "Create" | "Update" | "Delete" | "Skip";
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
  refPrefix: "VID" | "IMG" | "PER" | "CAT" | "GLO";
  mainHeader: string;
  requiredHeaders: string[];
  expectedHeaders: string[];
  records: (context: ImportCsvPreviewContext) => Array<Video | Image | Performer | ManagedCategory | GlossaryEntry>;
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

const validActions = new Set(["Auto", "Create", "Update", "Delete", "Skip"]);

const entityDefinitions: EntityDefinition[] = [
  {
    entity: "videos",
    refPrefix: "VID",
    mainHeader: "Title",
    requiredHeaders: ["Title"],
    expectedHeaders: videoCsvSchema.map((column) => column.header),
    records: (context) => context.videos,
  },
  {
    entity: "images",
    refPrefix: "IMG",
    mainHeader: "Title",
    requiredHeaders: ["Title"],
    expectedHeaders: imageCsvSchema.map((column) => column.header),
    records: (context) => context.images,
  },
  {
    entity: "performers",
    refPrefix: "PER",
    mainHeader: "Name",
    requiredHeaders: ["Name"],
    expectedHeaders: performerCsvSchema.map((column) => column.header),
    records: (context) => context.performers,
  },
  {
    entity: "categories",
    refPrefix: "CAT",
    mainHeader: "Category Name",
    requiredHeaders: ["Category Name"],
    expectedHeaders: categoryCsvSchema.map((column) => column.header),
    records: (context) => context.categories,
  },
  {
    entity: "glossary",
    refPrefix: "GLO",
    mainHeader: "Term",
    requiredHeaders: ["Term", "Definition"],
    expectedHeaders: glossaryCsvSchema.map((column) => column.header),
    records: (context) => context.glossary ?? [],
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

  headerErrors.push(...(parsed.errors ?? []));
  if (parsed.rows.length > IMPORT_MAX_ROWS_PER_SECTION) {
    headerErrors.push(importLimitMessage("sectionRows"));
  }
  if (parsed.rows.length > IMPORT_MAX_TOTAL_ROWS) {
    headerErrors.push(importLimitMessage("totalRows"));
  }
  if ([...parsed.headers, ...parsed.rows.flat()].some((value) => value.length > IMPORT_MAX_CELL_CHARACTERS)) {
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
  const duplicateRefs = findDuplicateRefs(parsed.headers, parsed.rows);
  const rows = parsed.rows.map((row, index) =>
    previewRow({
      row,
      rowNumber: options.rowNumbers?.[index] ?? index + 2,
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
    warnings.push(`Missing expected headers: ${missingExpectedHeaders.join(", ")}.`);
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
  const ref = (values["Sakurava Ref"] ?? "").trim();
  const mainValue = (values[definition.mainHeader] ?? "").trim();

  if (!action) {
    errors.push(`Unknown Action: ${values.Action}.`);
  }

  const temporaryRef = definition.entity === "glossary" && isTemporaryGlossaryRef(ref);
  if (ref && !ref.startsWith(`${definition.refPrefix}-`)) {
    errors.push(`Sakurava Ref must start with ${definition.refPrefix}-.`);
  }

  if (ref && duplicateRefs.has(ref)) {
    errors.push(`Duplicate Sakurava Ref in CSV: ${ref}.`);
  }

  if (action === "Skip") {
    return {
      rowNumber,
      action,
      detectedResult: "Skipped",
      target: targetText(ref, mainValue),
      changes: [],
      warnings,
      errors,
      values,
    };
  }

  if (action === "Delete") {
    if (!ref) {
      errors.push("Delete requires a Sakurava Ref.");
    } else if (temporaryRef || !currentRowsByRef.has(ref)) {
      errors.push(`Sakurava Ref was not found: ${ref}.`);
    }
    if (definition.entity === "categories" && ref) {
      validateCategoryDelete(ref, context, errors);
    }
    warnings.push("Will delete catalog record only. Original media files are not deleted.");

    return {
      rowNumber,
      action,
      detectedResult: errors.length > 0 ? "Error" : "Deleted",
      target: targetText(ref, mainValue),
      changes: ["Delete"],
      warnings,
      errors,
      values,
    };
  }

  if (action === "Update" && !ref) {
    errors.push("Update requires a Sakurava Ref.");
  }

  if (action === "Create" && ref && !temporaryRef) {
    errors.push("Create cannot use an existing Sakurava Ref.");
  }

  if (temporaryRef && action === "Update") {
    errors.push("Update cannot use a new temporary Glossary identifier.");
  }

  validateEditableFields(
    values,
    definition,
    warnings,
    errors,
    locale,
    invalidDateMessage,
  );
  validateCategories(values, definition, currentRowsByRef.get(ref), context, changes, warnings);
  validateRelated(values, definition, currentRowsByRef.get(ref), context, changes, warnings, errors);
  validateManagedCategoryParent(values, definition, context, errors);
  validateGlossaryFields(values, definition, ref, context, errors);

  if (!ref || temporaryRef) {
    if (Object.values(values).some((value) => value.trim() === SAKURAVA_CLEAR_VALUE)) {
      errors.push("The clear marker can only be used when updating an existing record.");
    }
    for (const requiredHeader of definition.requiredHeaders) {
      if (!(values[requiredHeader] ?? "").trim()) {
        errors.push(`${requiredHeader} is required for a new row.`);
      }
    }

    return {
      rowNumber,
      action: action ?? "Invalid",
      detectedResult: errors.length > 0 ? "Error" : "Added",
      target: mainValue || "New row",
      changes: action === "Create" || action === "Auto" ? ["New record"] : changes,
      warnings,
      errors,
      values,
      clearedFields,
    };
  }

  const currentRow = currentRowsByRef.get(ref);
  if (!currentRow) {
    errors.push(`Sakurava Ref was not found: ${ref}.`);
  } else {
    for (const header of headers) {
      if (header === "Action" || header === "Sakurava Ref") {
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
          errors.push(`${header} cannot be cleared.`);
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
      errors.length > 0 ? "Error" : changes.length > 0 ? "Modified" : "Unchanged",
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
  errors: string[],
) {
  if (definition.entity !== "categories") return;
  const parentRef = (values["Parent Ref"] ?? "").trim();
  if (parentRef && parentRef !== SAKURAVA_CLEAR_VALUE) {
    if (!context.categories.some((category) => sakuravaRef("CAT", category.key) === parentRef)) {
      errors.push(`Parent Category reference was not found: ${parentRef}.`);
    }
    return;
  }
  const parent = (values["Parent Category"] ?? "").trim();
  if (!parent || parent === SAKURAVA_CLEAR_VALUE) return;
  if (!context.categories.some((category) => category.name === parent)) {
    errors.push(`Parent Category was not found: ${parent}.`);
  }
}

export function isBlockingImportPreviewWarning(message: string) {
  return /^Unknown category:/i.test(message) || /^Unresolved related (reference|value):/i.test(message);
}

function validateCategoryDelete(
  ref: string,
  context: ImportCsvPreviewContext,
  errors: string[],
) {
  const category = context.categories.find(
    (candidate) => sakuravaRef("CAT", candidate.key) === ref,
  );
  if (!category) return;
  if (context.categories.some((candidate) => candidate.parentKey === category.key)) {
    errors.push("Category cannot be deleted while it has child categories.");
  }
  const usedByRecord = [...context.videos, ...context.images, ...context.performers]
    .some((record) => {
      try {
        const labels = JSON.parse(record.categoriesJson) as unknown;
        return Array.isArray(labels) && labels.some(
          (label) => typeof label === "string" && label.trim().toLowerCase() === category.name.trim().toLowerCase(),
        );
      } catch {
        return false;
      }
    });
  const usedByCredit = (context.credits ?? []).some(
    (credit) => credit.creditTypeCategoryId === category.key || credit.roleImportanceCategoryId === category.key,
  );
  if (usedByRecord || usedByCredit) {
    errors.push("Category cannot be deleted while catalog records use it.");
  }
}

function validateGlossaryFields(
  values: Record<string, string>,
  definition: EntityDefinition,
  recordRef: string,
  context: ImportCsvPreviewContext,
  errors: string[],
) {
  if (definition.entity !== "glossary") return;

  const parentRef = (values["Parent Ref"] ?? "").trim();
  if (!parentRef) return;
  if (parentRef === SAKURAVA_CLEAR_VALUE) return;
  if (isTemporaryGlossaryRef(parentRef)) {
    if (parentRef === recordRef) errors.push("A Glossary entry cannot be its own parent.");
    return;
  }
  if (!/^GLO-[0-9A-Z]+$/.test(parentRef)) {
    errors.push("Parent Ref must be a valid GLO identifier.");
    return;
  }
  if (parentRef === recordRef) {
    errors.push("A Glossary entry cannot be its own parent.");
    return;
  }
  if (!(context.glossary ?? []).some((entry) => sakuravaRef("GLO", entry.id) === parentRef)) {
    errors.push(`Glossary parent was not found: ${parentRef}.`);
  }
}

function buildCurrentRowsByRef(
  definition: EntityDefinition,
  context: ImportCsvPreviewContext,
  headerErrors: string[],
) {
  const csv = buildCsv(
    importSchemaFor(definition.entity),
    exportRowsFor(definition.entity, definition.records(context)),
  );
  const parsed = parseCsv(csv);
  const rowsByRef = new Map<string, Record<string, string>>();
  const ambiguousRefs = new Set<string>();

  for (const row of parsed.rows) {
    const values = rowValues(parsed.headers, row);
    const ref = values["Sakurava Ref"]?.trim();
    if (!ref || ambiguousRefs.has(ref)) {
      continue;
    }
    if (rowsByRef.has(ref)) {
      rowsByRef.delete(ref);
      ambiguousRefs.add(ref);
      headerErrors.push(`The catalog contains a conflicting Sakurava identifier: ${ref}.`);
      continue;
    }
    rowsByRef.set(ref, values);
  }

  return rowsByRef;
}

function findDuplicateRefs(headers: string[], rows: string[][]) {
  const refIndex = headers.indexOf("Sakurava Ref");
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  if (refIndex < 0) {
    return duplicates;
  }

  for (const row of rows) {
    const ref = (row[refIndex] ?? "").trim();
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
      if (!column?.clearable) errors.push(`${header} cannot be cleared.`);
      continue;
    }

    if (header.endsWith("Date")) {
      const normalized = normalizeImportDate(value, { locale });
      if (normalized.state === "valid") {
        values[header] = normalized.value;
      } else if (normalized.state === "invalid") {
        const format = localDateFormatHint(locale);
        errors.push(invalidDateMessage
          ? invalidDateMessage(header, format)
          : `${header}: Enter a valid date using this computer's format: ${format}.`);
      }
    }

    if (column?.valueType === "boolean") {
      const normalized = normalizeBooleanCell(value);
      if (normalized === null) {
        errors.push(`${header} must be true or false.`);
      } else {
        values[header] = normalized;
      }
    }

    if (column?.valueType === "number") {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        errors.push(`${header} must be numeric.`);
      } else if (!header.startsWith("Rating - ")) {
        if (!Number.isInteger(numberValue) || numberValue < 0) {
          errors.push(`${header} must be a whole number of zero or more.`);
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
        errors.push(`${header} is not a supported value.`);
      } else {
        values[header] = canonical;
      }
    }

    if (header.startsWith("Rating - ")) {
      const rating = Number(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        errors.push(`${header} must be a number from 0 to 5.`);
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
          errors.push("Source Links must use one valid http or https URL per line.");
          break;
        }
      }
    }

    if (header.includes("Path") || header.startsWith("Gallery Image") || header.startsWith("Mini Thumbnail")) {
      if (/[\u0000-\u001F]/.test(value)) {
        errors.push(`${header} contains unsupported control characters.`);
      }
    }
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
) {
  if (definition.entity === "categories" || !("Categories" in values)) {
    return;
  }

  if (currentRow && (!values.Categories.trim() || values.Categories.trim() === SAKURAVA_CLEAR_VALUE)) {
    return;
  }

  const nextCategories = parseSemicolonList(values.Categories);
  const currentCategories = parseSemicolonList(currentRow?.Categories ?? "");
  const managedNames = new Set(context.categories.map((category) => category.name));
  const added = nextCategories.filter((category) => !currentCategories.includes(category));
  const removed = currentCategories.filter((category) => !nextCategories.includes(category));

  if (values.Categories.trim() === "" && currentCategories.length > 0) {
    warnings.push("This will remove all categories from this record if applied.");
  }

  for (const category of nextCategories) {
    if (!managedNames.has(category)) {
      warnings.push(`Unknown category: ${category}.`);
    }
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
  errors: string[],
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

    for (const item of nextItems) {
      validateRelatedItem(header, item, context, warnings, errors);
    }

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
  errors: string[],
) {
  const { ref, display } = parseRelatedItem(item);
  const target = relatedTarget(header);
  if (!target) {
    return;
  }

  if (ref) {
    const matched = relatedRecords(target, context).filter(
      (record) => sakuravaRef(target.prefix, record.id) === ref,
    );
    if (matched.length === 1) {
      return;
    }
    if (matched.length > 1) {
      errors.push(`Ambiguous related reference: ${item}.`);
      return;
    }
    warnings.push(`Unresolved related reference: ${item}.`);
    return;
  }

  if (!display) {
    warnings.push(`Unresolved related value: ${item}.`);
    return;
  }

  const matches = relatedRecords(target, context).filter(
    (record) => record.label === display,
  );
  if (matches.length === 1) {
    errors.push(`Related value requires a stable Sakurava Ref: ${display}.`);
  } else if (matches.length > 1) {
    errors.push(`Ambiguous related display name: ${display}.`);
  } else {
    warnings.push(`Unresolved related value: ${display}.`);
  }
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
      label: record.name,
    }));
  }
  if (target.kind === "videos") {
    return context.videos.map((record) => ({
      id: record.id,
      label: record.title,
    }));
  }
  return context.images.map((record) => ({
    id: record.id,
    label: record.title,
  }));
}

function parseRelatedItem(item: string) {
  const [possibleRef, ...displayParts] = item.split("|");
  const ref = possibleRef.trim();
  const display = displayParts.join("|").trim();

  if (/^(VID|IMG|PER)-[0-9A-Z]+$/.test(ref)) {
    return { ref, display };
  }

  return { ref: "", display: item.trim() };
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
    blocked: headerErrors.length > 0 || rows.some(
      (row) => row.errors.length > 0 || row.warnings.some(isBlockingImportPreviewWarning),
    ),
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
  return ref ? ref.toUpperCase() : display;
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
    return normalized
      .split(column.header === "Source Links" ? /\n+/ : ";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => /^(VID|IMG|PER|GLO)-[0-9A-Z-]+\s*\|/i.test(item)
        ? item.split("|")[0].trim().toUpperCase()
        : item)
      .join(column.header === "Source Links" ? "\n" : "; ");
  }
  return normalized;
}

function targetText(ref: string, mainValue: string) {
  if (ref && mainValue) {
    return `${ref} | ${mainValue}`;
  }
  return ref || mainValue || "Unresolved row";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
