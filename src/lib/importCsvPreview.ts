import type { Image, ManagedCategory, Performer, Video } from "../backend/types";
import {
  buildCategoriesCsv,
  buildImagesCsv,
  buildPerformersCsv,
  buildVideosCsv,
  categoryCsvSchema,
  imageCsvSchema,
  performerCsvSchema,
  sakuravaRef,
  videoCsvSchema,
  type ExportCsvEntity,
} from "./exportCsv";

export type ImportCsvEntity = ExportCsvEntity;

export type ImportCsvAction = "Auto" | "Update" | "Add" | "Delete" | "Skip";
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
};

type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type EntityDefinition = {
  entity: ImportCsvEntity;
  refPrefix: "VID" | "IMG" | "PER" | "CAT";
  mainHeader: string;
  expectedHeaders: string[];
  buildCurrentCsv: (context: ImportCsvPreviewContext) => string;
  records: (context: ImportCsvPreviewContext) => Array<Video | Image | Performer | ManagedCategory>;
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

const validActions = new Set(["Auto", "Update", "Add", "Delete", "Skip"]);

const entityDefinitions: EntityDefinition[] = [
  {
    entity: "videos",
    refPrefix: "VID",
    mainHeader: "Title",
    expectedHeaders: videoCsvSchema.map((column) => column.header),
    buildCurrentCsv: (context) => buildVideosCsv(context.videos),
    records: (context) => context.videos,
  },
  {
    entity: "images",
    refPrefix: "IMG",
    mainHeader: "Title",
    expectedHeaders: imageCsvSchema.map((column) => column.header),
    buildCurrentCsv: (context) => buildImagesCsv(context.images),
    records: (context) => context.images,
  },
  {
    entity: "performers",
    refPrefix: "PER",
    mainHeader: "Name",
    expectedHeaders: performerCsvSchema.map((column) => column.header),
    buildCurrentCsv: (context) => buildPerformersCsv(context.performers),
    records: (context) => context.performers,
  },
  {
    entity: "categories",
    refPrefix: "CAT",
    mainHeader: "Category Name",
    expectedHeaders: categoryCsvSchema.map((column) => column.header),
    buildCurrentCsv: (context) => buildCategoriesCsv(context.categories),
    records: (context) => context.categories,
  },
];

export function parseCsv(text: string): ParsedCsv {
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
  if (row.some((value) => value.length > 0) || rows.length === 0) {
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;

  return {
    headers: headers.map((header) => header.trim()),
    rows: dataRows.filter((dataRow) =>
      dataRow.some((value) => value.trim().length > 0),
    ),
  };
}

export function buildImportCsvPreview(
  csvText: string,
  context: ImportCsvPreviewContext,
): ImportCsvPreview {
  const parsed = parseCsv(csvText);
  const headerErrors: string[] = [];
  const headerWarnings: string[] = [];
  const definition = detectCsvEntity(parsed.headers);

  validateHeaders(parsed.headers, definition, headerErrors, headerWarnings);

  if (!definition || headerErrors.length > 0) {
    return {
      summary: summarizeRows("unknown", [], headerErrors),
      rows: [],
      headerErrors,
      headerWarnings,
    };
  }

  const currentRowsByRef = buildCurrentRowsByRef(definition, context);
  const duplicateRefs = findDuplicateRefs(parsed.headers, parsed.rows);
  const rows = parsed.rows.map((row, index) =>
    previewRow({
      row,
      rowNumber: index + 2,
      headers: parsed.headers,
      definition,
      currentRowsByRef,
      duplicateRefs,
      context,
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
) {
  if (headers.length === 0) {
    errors.push("CSV file is empty.");
    return;
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

  for (const requiredHeader of ["Action", "Sakurava Ref", definition.mainHeader]) {
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
}

function previewRow({
  row,
  rowNumber,
  headers,
  definition,
  currentRowsByRef,
  duplicateRefs,
  context,
}: {
  row: string[];
  rowNumber: number;
  headers: string[];
  definition: EntityDefinition;
  currentRowsByRef: Map<string, Record<string, string>>;
  duplicateRefs: Set<string>;
  context: ImportCsvPreviewContext;
}): ImportCsvPreviewRow {
  const values = rowValues(headers, row);
  const warnings: string[] = [];
  const errors: string[] = [];
  const changes: string[] = [];
  const action = parseImportAction(values.Action ?? "");
  const ref = (values["Sakurava Ref"] ?? "").trim();
  const mainValue = (values[definition.mainHeader] ?? "").trim();

  if (!action) {
    errors.push(`Unknown Action: ${values.Action}.`);
  }

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
    } else if (!currentRowsByRef.has(ref)) {
      errors.push(`Sakurava Ref was not found: ${ref}.`);
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

  if (action === "Add" && ref) {
    warnings.push("Add with Sakurava Ref may create an accidental duplicate.");
  }

  validateEditableFields(values, definition, warnings, errors);
  validateCategories(values, definition, currentRowsByRef.get(ref), context, changes, warnings);
  validateRelated(values, definition, currentRowsByRef.get(ref), context, changes, warnings, errors);

  if (!ref) {
    if (!mainValue && action !== "Add") {
      errors.push(`${definition.mainHeader} is required for a new row.`);
    }

    return {
      rowNumber,
      action: action ?? "Invalid",
      detectedResult: errors.length > 0 ? "Error" : "Added",
      target: mainValue || "New row",
      changes: action === "Add" || action === "Auto" ? ["New record"] : changes,
      warnings,
      errors,
      values,
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
      const nextValue = normalizeCell(values[header] ?? "");
      const currentValue = normalizeCell(currentRow[header] ?? "");
      if (nextValue !== currentValue) {
        changes.push(header);
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
    warnings,
    errors,
    values,
  };
}

function buildCurrentRowsByRef(
  definition: EntityDefinition,
  context: ImportCsvPreviewContext,
) {
  const csv = definition.buildCurrentCsv(context);
  const parsed = parseCsv(csv);
  const rowsByRef = new Map<string, Record<string, string>>();

  for (const row of parsed.rows) {
    const values = rowValues(parsed.headers, row);
    const ref = values["Sakurava Ref"]?.trim();
    if (ref) {
      rowsByRef.set(ref, values);
    }
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
) {
  for (const header of Object.keys(values)) {
    const value = values[header].trim();
    if (!value) {
      continue;
    }

    if (header.endsWith("Date") && !isValidDateOnly(value)) {
      errors.push(`${header} must use YYYY-MM-DD with a valid date.`);
    }

    if (header.startsWith("Rating - ")) {
      const rating = Number(value);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        errors.push(`${header} must be a number from 0 to 5.`);
      }
    }

    if ((header === "Height (cm)" || header === "Weight (kg)") && Number.isNaN(Number(value))) {
      errors.push(`${header} must be numeric.`);
    }

    if (
      definition.entity === "performers" &&
      header === "Measurements" &&
      !/^\d+\s*\/\s*\d+\s*\/\s*\d+(\s*cm)?$/i.test(value)
    ) {
      warnings.push("Measurements should use 90 / 60 / 90 cm style.");
    }

    if (header.includes("Path") || header.startsWith("Gallery Image") || header.startsWith("Mini Thumbnail")) {
      if (/[\u0000-\u001F]/.test(value)) {
        errors.push(`${header} contains unsupported control characters.`);
      }
    }
  }
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
    const nextItems = parseSemicolonList(values[header]);
    const currentItems = parseSemicolonList(currentRow?.[header] ?? "");
    const added = nextItems.filter((item) => !currentItems.includes(item));
    const removed = currentItems.filter((item) => !nextItems.includes(item));

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
    warnings.push(`Resolved related value by exact display name: ${display}.`);
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
    blocked: headerErrors.length > 0 || rows.some((row) => row.errors.length > 0),
  };
}

function countRows(rows: ImportCsvPreviewRow[], result: ImportCsvDetectedResult) {
  return rows.filter((row) => row.detectedResult === result).length;
}

function normalizeCell(value: string) {
  return value.trim();
}

function isValidDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(year, month, 0).getDate();
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
