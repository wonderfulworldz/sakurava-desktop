import type {
  Image,
  ImagePatch,
  ManagedCategory,
  ManagedCategoryPatch,
  NewImage,
  NewManagedCategory,
  NewPerformer,
  NewVideo,
  Performer,
  PerformerPatch,
  Video,
  VideoPatch,
} from "../backend/types";
import {
  categoryCsvSchema,
  imageCsvSchema,
  performerCsvSchema,
  sakuravaRef,
  videoCsvSchema,
  type CsvInternalField,
  type CsvSchemaColumn,
  type ExportCsvEntity,
} from "./exportCsv";
import type {
  ImportCsvPreview,
  ImportCsvPreviewContext,
  ImportCsvPreviewRow,
} from "./importCsvPreview";
import { storeManagedCategories } from "./managedCategories";

type CatalogRecord = Video | Image | Performer | ManagedCategory;
type CatalogPatch = VideoPatch | ImagePatch | PerformerPatch | ManagedCategoryPatch;

export type ImportCsvApplyStatus =
  | "applied"
  | "failed"
  | "skipped"
  | "unchanged";

export type ImportCsvApplyRowReport = {
  rowNumber: number;
  action: ImportCsvPreviewRow["action"];
  result: ImportCsvPreviewRow["detectedResult"];
  status: ImportCsvApplyStatus;
  target: string;
  message: string;
  warnings: string[];
  errors: string[];
};

export type ImportCsvApplyReport = {
  entity: ExportCsvEntity | "unknown";
  totalRows: number;
  appliedAdded: number;
  appliedModified: number;
  appliedDeleted: number;
  unchanged: number;
  skipped: number;
  failed: number;
  warnings: number;
  errors: number;
  rows: ImportCsvApplyRowReport[];
};

export type ImportCsvApplyMutations = {
  createVideo: (input: NewVideo) => Promise<Video>;
  updateVideo: (id: string, patch: VideoPatch) => Promise<Video | null>;
  deleteVideo: (id: string) => Promise<{ id: string; deleted: boolean }>;
  createImage: (input: NewImage) => Promise<Image>;
  updateImage: (id: string, patch: ImagePatch) => Promise<Image | null>;
  deleteImage: (id: string) => Promise<{ id: string; deleted: boolean }>;
  createPerformer: (input: NewPerformer) => Promise<Performer>;
  updatePerformer: (id: string, patch: PerformerPatch) => Promise<Performer | null>;
  deletePerformer: (id: string) => Promise<{ id: string; deleted: boolean }>;
  createManagedCategory: (input: NewManagedCategory) => Promise<ManagedCategory>;
  updateManagedCategory: (
    key: string,
    patch: ManagedCategoryPatch,
  ) => Promise<ManagedCategory>;
  deleteManagedCategory: (key: string) => Promise<{ key: string; deleted: boolean }>;
};

type EntityApplyDefinition = {
  entity: ExportCsvEntity;
  refPrefix: "VID" | "IMG" | "PER" | "CAT";
  mainHeader: string;
  schema: CsvSchemaColumn<any>[];
  records: (context: ImportCsvPreviewContext) => CatalogRecord[];
  create: (mutations: ImportCsvApplyMutations, input: Record<string, unknown>) => Promise<unknown>;
  update: (
    mutations: ImportCsvApplyMutations,
    id: string,
    patch: CatalogPatch,
  ) => Promise<unknown>;
  delete: (mutations: ImportCsvApplyMutations, id: string) => Promise<unknown>;
};
type CategoryRowReport = ImportCsvApplyRowReport & {
  appliedCategory?: ManagedCategory;
  deletedKey?: string;
};

const applyDefinitions: EntityApplyDefinition[] = [
  {
    entity: "videos",
    refPrefix: "VID",
    mainHeader: "Title",
    schema: videoCsvSchema,
    records: (context) => context.videos,
    create: (mutations, input) => mutations.createVideo(input as NewVideo),
    update: (mutations, id, patch) => mutations.updateVideo(id, patch as VideoPatch),
    delete: (mutations, id) => mutations.deleteVideo(id),
  },
  {
    entity: "images",
    refPrefix: "IMG",
    mainHeader: "Title",
    schema: imageCsvSchema,
    records: (context) => context.images,
    create: (mutations, input) => mutations.createImage(input as NewImage),
    update: (mutations, id, patch) => mutations.updateImage(id, patch as ImagePatch),
    delete: (mutations, id) => mutations.deleteImage(id),
  },
  {
    entity: "performers",
    refPrefix: "PER",
    mainHeader: "Name",
    schema: performerCsvSchema,
    records: (context) => context.performers,
    create: (mutations, input) => mutations.createPerformer(input as NewPerformer),
    update: (mutations, id, patch) =>
      mutations.updatePerformer(id, patch as PerformerPatch),
    delete: (mutations, id) => mutations.deletePerformer(id),
  },
  {
    entity: "categories",
    refPrefix: "CAT",
    mainHeader: "Category Name",
    schema: categoryCsvSchema,
    records: (context) => context.categories,
    create: (mutations, input) =>
      mutations.createManagedCategory(input as NewManagedCategory),
    update: (mutations, id, patch) =>
      mutations.updateManagedCategory(id, patch as ManagedCategoryPatch),
    delete: (mutations, id) => mutations.deleteManagedCategory(id),
  },
];

const blockingWarningPatterns = [
  /^Unknown category:/,
  /^Unresolved related/,
  /^Add with Sakurava Ref/,
];

export function countApplicableImportRows(preview: ImportCsvPreview) {
  return preview.rows.filter(
    (row) => isApplicablePreviewRow(row) && !rowSafetyIssue(row),
  ).length;
}

export async function applyImportCsvPreview({
  preview,
  context,
  mutations,
  confirmed,
}: {
  preview: ImportCsvPreview;
  context: ImportCsvPreviewContext;
  mutations: ImportCsvApplyMutations;
  confirmed: boolean;
}): Promise<ImportCsvApplyReport> {
  if (!confirmed) {
    return reportFromRows(preview, [
      failureRow(0, "Invalid", "Error", "Import apply requires confirmation."),
    ]);
  }

  if (preview.summary.entity === "unknown" || preview.headerErrors.length > 0) {
    return reportFromRows(preview, [
      failureRow(
        0,
        "Invalid",
        "Error",
        "Import apply requires a valid CSV preview with no header errors.",
      ),
    ]);
  }

  const definition = applyDefinitions.find(
    (candidate) => candidate.entity === preview.summary.entity,
  );
  if (!definition) {
    return reportFromRows(preview, [
      failureRow(0, "Invalid", "Error", "Unsupported CSV entity."),
    ]);
  }

  const recordsByRef = buildRecordsByRef(definition, context);
  if (definition.entity === "categories") {
    return applyCategoryRows(preview, context, recordsByRef, mutations);
  }

  const reports: ImportCsvApplyRowReport[] = [];

  for (const row of preview.rows) {
    reports.push(await applyRow(row, definition, context, recordsByRef, mutations));
  }

  return reportFromRows(preview, reports);
}

async function applyCategoryRows(
  preview: ImportCsvPreview,
  context: ImportCsvPreviewContext,
  recordsByRef: Map<string, CatalogRecord>,
  mutations: ImportCsvApplyMutations,
) {
  const reportsByRowNumber = new Map<number, ImportCsvApplyRowReport>();
  let categories = [...context.categories];
  const rows = [...preview.rows];
  const parentRows = rows.filter((row) => !categoryParentName(row));
  const childRows = rows.filter((row) => categoryParentName(row));

  for (const row of [...parentRows, ...childRows]) {
    const report = await applyCategoryRow(row, categories, context, recordsByRef, mutations);
    reportsByRowNumber.set(row.rowNumber, report);

    if (report.status === "applied") {
      categories = updateCategorySnapshot(categories, row, report);
      recordsByRef = buildCategoryRecordsByRef(categories);
    }
  }

  const orderedReports = rows.map((row) => reportsByRowNumber.get(row.rowNumber)).filter(
    (row): row is ImportCsvApplyRowReport => Boolean(row),
  );
  storeManagedCategories(categories.map((category) => category.name));
  return reportFromRows(preview, orderedReports);
}

async function applyCategoryRow(
  row: ImportCsvPreviewRow,
  categories: ManagedCategory[],
  context: ImportCsvPreviewContext,
  recordsByRef: Map<string, CatalogRecord>,
  mutations: ImportCsvApplyMutations,
): Promise<CategoryRowReport> {
  const safetyIssue = rowSafetyIssue(row);
  if (safetyIssue) {
    return failedRow(row, safetyIssue);
  }
  if (row.detectedResult === "Skipped") {
    return skippedRow(row, "Skipped by CSV Action.");
  }
  if (row.detectedResult === "Unchanged") {
    return unchangedRow(row, "No change.");
  }

  try {
    if (row.action === "Delete") {
      const record = resolveRecord(row, recordsByRef) as ManagedCategory | undefined;
      if (!record) {
        return failedRow(row, "Delete requires a resolved Sakurava Ref.");
      }
      const deleteIssue = categoryDeleteSafetyIssue(record, categories, context);
      if (deleteIssue) {
        return failedRow(row, deleteIssue);
      }
      await mutations.deleteManagedCategory(record.key);
      return {
        ...appliedRow(row, "Deleted unused managed category."),
        deletedKey: record.key,
      };
    }

    const target = resolveCategoryTarget(row, categories, recordsByRef);
    const parentKey = resolveCategoryParentKey(row, categories, target);
    const input = {
      name: categoryName(row),
      parentKey,
      description: row.values.Description ?? "",
      thumbnailPath: row.values["Thumbnail Path"] ?? "",
    };

    if (target) {
      const updated = await mutations.updateManagedCategory(target.key, input);
      return {
        ...appliedRow(row, "Updated managed category."),
        appliedCategory: updated,
      };
    }

    const created = await mutations.createManagedCategory(input);
    return {
      ...appliedRow(row, "Created managed category."),
      appliedCategory: created,
    };
  } catch (error) {
    return failedRow(
      row,
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Category row apply failed.",
    );
  }
}

async function applyRow(
  row: ImportCsvPreviewRow,
  definition: EntityApplyDefinition,
  context: ImportCsvPreviewContext,
  recordsByRef: Map<string, CatalogRecord>,
  mutations: ImportCsvApplyMutations,
): Promise<ImportCsvApplyRowReport> {
  const safetyIssue = rowSafetyIssue(row);
  if (safetyIssue) {
    return {
      rowNumber: row.rowNumber,
      action: row.action,
      result: row.detectedResult,
      status: "failed",
      target: row.target,
      message: safetyIssue,
      warnings: row.warnings,
      errors: [...row.errors, safetyIssue],
    };
  }

  if (row.detectedResult === "Skipped") {
    return skippedRow(row, "Skipped by CSV Action.");
  }

  if (row.detectedResult === "Unchanged") {
    return unchangedRow(row, "No change.");
  }

  try {
    if (row.detectedResult === "Deleted") {
      const record = resolveRecord(row, recordsByRef);
      if (!record || row.action !== "Delete") {
        return failedRow(row, "Delete requires Action = Delete and a resolved Sakurava Ref.");
      }
      await definition.delete(mutations, recordKey(record));
      return appliedRow(row, "Deleted catalog record only. Original media files were not modified or deleted.");
    }

    if (row.detectedResult === "Added") {
      const input = buildPatchFromRow(row, definition, context, undefined);
      await definition.create(mutations, input);
      return appliedRow(row, "Created record.");
    }

    if (row.detectedResult === "Modified") {
      const record = resolveRecord(row, recordsByRef);
      if (!record) {
        return failedRow(row, "Modified row requires a resolved Sakurava Ref.");
      }
      const patch = buildPatchFromRow(row, definition, context, record);
      if (Object.keys(patch).length === 0) {
        return unchangedRow(row, "No writable imported fields changed.");
      }
      await definition.update(mutations, recordKey(record), patch as CatalogPatch);
      return appliedRow(row, `Updated ${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"}.`);
    }

    return failedRow(row, "Row result is not applicable.");
  } catch (error) {
    return failedRow(
      row,
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Row apply failed.",
    );
  }
}

function buildPatchFromRow(
  row: ImportCsvPreviewRow,
  definition: EntityApplyDefinition,
  context: ImportCsvPreviewContext,
  existing: CatalogRecord | undefined,
) {
  const patch: Record<string, unknown> = {};
  const headers = new Set(Object.keys(row.values));
  const changedHeaders =
    row.detectedResult === "Added" ? headers : new Set(row.changes);
  const schemaByHeader = new Map(definition.schema.map((column) => [column.header, column]));

  for (const [header, column] of schemaByHeader) {
    if (!headers.has(header) || header === "Action" || header === "Sakurava Ref") {
      continue;
    }
    if (row.detectedResult !== "Added" && !changedHeaders.has(header)) {
      continue;
    }
    applySimpleField({
      patch,
      header,
      internalField: column.internalField,
      value: row.values[header] ?? "",
      definition,
      context,
      existing,
    });
  }

  applyRatingFields(patch, row, definition, existing);
  applyPathArrayFields(patch, row, definition);

  if (definition.entity === "videos" && !("title" in patch)) {
    patch.title = row.values.Title?.trim() ?? "";
  }
  if (definition.entity === "images" && !("title" in patch)) {
    patch.title = row.values.Title?.trim() ?? "";
  }
  if (definition.entity === "performers" && !("name" in patch)) {
    patch.name = row.values.Name?.trim() ?? "";
  }
  if (definition.entity === "categories" && !("name" in patch)) {
    patch.name = row.values["Category Name"]?.trim() ?? "";
  }

  return patch;
}

function applySimpleField({
  patch,
  header,
  internalField,
  value,
  definition,
  context,
}: {
  patch: Record<string, unknown>;
  header: string;
  internalField: CsvInternalField;
  value: string;
  definition: EntityApplyDefinition;
  context: ImportCsvPreviewContext;
  existing: CatalogRecord | undefined;
}) {
  if (
    internalField === "bulkAction" ||
    internalField === "sakuravaRef" ||
    internalField === "visibility" ||
    internalField === "categoryNotes" ||
    internalField.startsWith("ratingJson.") ||
    internalField.startsWith("galleryImagePathsJson.") ||
    internalField.startsWith("performerThumbnailPathsJson.")
  ) {
    return;
  }

  if (internalField === "parentCategoryName") {
    patch.parentKey = resolveParentCategoryKey(value, context);
    return;
  }

  if (internalField === "categoriesJson" || internalField === "aliasesJson") {
    patch[internalField] = JSON.stringify(parseSemicolonList(value));
    return;
  }

  if (isRelatedField(internalField)) {
    patch[internalField] = JSON.stringify(resolveRelatedList(header, value, context));
    return;
  }

  if (internalField === "heightCm" || internalField === "weightKg") {
    patch[internalField] = value.trim() ? Number(value) : null;
    return;
  }

  patch[internalField] = value;
}

function applyRatingFields(
  patch: Record<string, unknown>,
  row: ImportCsvPreviewRow,
  definition: EntityApplyDefinition,
  existing: CatalogRecord | undefined,
) {
  const ratingColumns = definition.schema.filter((column) =>
    column.internalField.startsWith("ratingJson."),
  );
  const changedHeaders = row.detectedResult === "Added" ? null : new Set(row.changes);
  const shouldWrite = ratingColumns.some(
    (column) =>
      column.header in row.values &&
      (row.detectedResult === "Added" || changedHeaders?.has(column.header)),
  );
  if (!shouldWrite) {
    return;
  }

  const base = parseJsonObject(
    existing && "ratingJson" in existing ? existing.ratingJson : "{}",
  );
  for (const column of ratingColumns) {
    if (!(column.header in row.values)) {
      continue;
    }
    if (row.detectedResult !== "Added" && !changedHeaders?.has(column.header)) {
      continue;
    }
    const key = column.internalField.replace("ratingJson.", "");
    const value = row.values[column.header].trim();
    if (!value) {
      delete base[key];
    } else {
      base[key] = Number(value);
    }
  }
  patch.ratingJson = JSON.stringify(base);
}

function applyPathArrayFields(
  patch: Record<string, unknown>,
  row: ImportCsvPreviewRow,
  definition: EntityApplyDefinition,
) {
  const galleryHeaders = definition.schema.filter((column) =>
    column.internalField.startsWith("galleryImagePathsJson."),
  );
  const thumbnailHeaders = definition.schema.filter((column) =>
    column.internalField.startsWith("performerThumbnailPathsJson."),
  );
  const changedHeaders = row.detectedResult === "Added" ? null : new Set(row.changes);

  if (
    galleryHeaders.some(
      (column) =>
        column.header in row.values &&
        (row.detectedResult === "Added" || changedHeaders?.has(column.header)),
    )
  ) {
    patch.galleryImagePathsJson = JSON.stringify(
      galleryHeaders
        .map((column) => row.values[column.header]?.trim() ?? "")
        .filter(Boolean),
    );
  }

  if (
    thumbnailHeaders.some(
      (column) =>
        column.header in row.values &&
        (row.detectedResult === "Added" || changedHeaders?.has(column.header)),
    )
  ) {
    patch.performerThumbnailPathsJson = JSON.stringify(
      thumbnailHeaders
        .map((column) => row.values[column.header]?.trim() ?? "")
        .filter(Boolean),
    );
  }
}

function resolveRelatedList(
  header: string,
  value: string,
  context: ImportCsvPreviewContext,
) {
  const items = parseSemicolonList(value);
  if (header === "Related Performers") {
    return items.map((item) => {
      const performer = resolveRelatedRecord(item, "PER", context.performers, "name");
      return { performerId: performer.id, nameSnapshot: performer.name };
    });
  }
  if (header === "Related Videos") {
    return items.map((item) => {
      const video = resolveRelatedRecord(item, "VID", context.videos, "title");
      return { recordId: video.id, titleSnapshot: video.title };
    });
  }
  return items.map((item) => {
    const image = resolveRelatedRecord(item, "IMG", context.images, "title");
    return { recordId: image.id, titleSnapshot: image.title };
  });
}

function resolveRelatedRecord<TRecord extends { id: string }>(
  item: string,
  prefix: "VID" | "IMG" | "PER",
  records: TRecord[],
  labelKey: keyof TRecord & string,
) {
  const [possibleRef, ...displayParts] = item.split("|");
  const ref = possibleRef.trim();
  const display = displayParts.join("|").trim();

  if (/^(VID|IMG|PER)-[0-9A-Z]+$/.test(ref)) {
    const match = records.find((record) => sakuravaRef(prefix, record.id) === ref);
    if (!match) {
      throw new Error(`Unresolved related reference: ${item}.`);
    }
    return match;
  }

  const matches = records.filter(
    (record) => String(record[labelKey] ?? "").trim() === (display || item.trim()),
  );
  if (matches.length !== 1) {
    throw new Error(`Unresolved related value: ${item}.`);
  }
  return matches[0];
}

function resolveParentCategoryKey(
  parentCategoryName: string,
  context: ImportCsvPreviewContext,
) {
  const parent = parentCategoryName.trim();
  if (!parent) {
    return null;
  }
  const matches = context.categories.filter((category) => category.name === parent);
  if (matches.length !== 1) {
    throw new Error(`Parent Category is unresolved or ambiguous: ${parent}.`);
  }
  return matches[0].key;
}

function rowSafetyIssue(row: ImportCsvPreviewRow) {
  if (row.errors.length > 0 || row.action === "Invalid") {
    return row.errors[0] ?? "Row has validation errors.";
  }
  const blockingWarning = row.warnings.find((warning) =>
    blockingWarningPatterns.some((pattern) => pattern.test(warning)),
  );
  if (blockingWarning) {
    return blockingWarning;
  }
  if (!isApplicablePreviewRow(row)) {
    return "";
  }
  return "";
}

function isApplicablePreviewRow(row: ImportCsvPreviewRow) {
  return ["Added", "Modified", "Deleted"].includes(row.detectedResult);
}

function buildRecordsByRef(definition: EntityApplyDefinition, context: ImportCsvPreviewContext) {
  return new Map(
    definition.records(context).map((record) => [
      sakuravaRef(definition.refPrefix, recordKey(record)),
      record,
    ]),
  );
}

function buildCategoryRecordsByRef(categories: ManagedCategory[]) {
  return new Map<string, CatalogRecord>(
    categories.map((category) => [sakuravaRef("CAT", category.key), category]),
  );
}

function resolveRecord(
  row: ImportCsvPreviewRow,
  recordsByRef: Map<string, CatalogRecord>,
) {
  return recordsByRef.get((row.values["Sakurava Ref"] ?? "").trim());
}

function recordKey(record: CatalogRecord) {
  return "key" in record ? record.key : record.id;
}

function isRelatedField(field: CsvInternalField) {
  return (
    field === "relatedPerformersJson" ||
    field === "relatedVideosJson" ||
    field === "relatedImagesJson"
  );
}

function parseSemicolonList(value: string) {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function categoryName(row: ImportCsvPreviewRow) {
  return (row.values["Category Name"] ?? "").trim();
}

function categoryParentName(row: ImportCsvPreviewRow) {
  return (row.values["Parent Category"] ?? "").trim();
}

function resolveCategoryTarget(
  row: ImportCsvPreviewRow,
  categories: ManagedCategory[],
  recordsByRef: Map<string, CatalogRecord>,
) {
  const refTarget = resolveRecord(row, recordsByRef) as ManagedCategory | undefined;
  if (refTarget) {
    return refTarget;
  }
  if (row.action !== "Update") {
    return undefined;
  }

  const name = categoryName(row).toLowerCase();
  const parentName = categoryParentName(row).toLowerCase();
  const matches = categories.filter((category) => {
    if (category.name.trim().toLowerCase() !== name) {
      return false;
    }
    const parent = category.parentKey
      ? categories.find((candidate) => candidate.key === category.parentKey)
      : null;
    return (parent?.name.trim().toLowerCase() ?? "") === parentName;
  });
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Category is ambiguous: ${categoryName(row)}.`);
  }
  throw new Error(`Category could not be found: ${categoryName(row)}.`);
}

function resolveCategoryParentKey(
  row: ImportCsvPreviewRow,
  categories: ManagedCategory[],
  target: ManagedCategory | undefined,
) {
  const parentName = categoryParentName(row);
  if (!parentName) {
    if (target && categories.some((category) => category.parentKey === target.key)) {
      throw new Error("A category with child categories must stay at No Parent.");
    }
    return null;
  }

  const matches = categories.filter(
    (category) => category.name.trim().toLowerCase() === parentName.toLowerCase(),
  );
  if (matches.length === 0) {
    throw new Error(`Parent Category could not be found: ${parentName}.`);
  }
  if (matches.length > 1) {
    throw new Error(`Parent Category is ambiguous: ${parentName}.`);
  }
  const parent = matches[0];
  if (parent.parentKey) {
    throw new Error("Only root categories can be selected as Parent Category.");
  }
  if (target && parent.key === target.key) {
    throw new Error("A category cannot be its own parent.");
  }
  if (target && categories.some((category) => category.parentKey === target.key)) {
    throw new Error("A category with child categories must stay at No Parent.");
  }
  return parent.key;
}

function categoryDeleteSafetyIssue(
  category: ManagedCategory,
  categories: ManagedCategory[],
  context: ImportCsvPreviewContext,
) {
  if (categories.some((candidate) => candidate.parentKey === category.key)) {
    return "Category has child categories. Delete child categories first.";
  }
  const key = category.name.trim().toLowerCase();
  const isUsed = [...context.videos, ...context.images, ...context.performers].some(
    (record) => parseSemicolonListFromJson(record.categoriesJson).some(
      (label) => label.trim().toLowerCase() === key,
    ),
  );
  return isUsed
    ? "Category is still used by records. Remove/rename from records first."
    : "";
}

function parseSemicolonListFromJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function updateCategorySnapshot(
  categories: ManagedCategory[],
  row: ImportCsvPreviewRow,
  report: CategoryRowReport,
) {
  if (report.deletedKey) {
    return categories.filter((category) => category.key !== report.deletedKey);
  }

  if (report.appliedCategory) {
    const exists = categories.some(
      (category) => category.key === report.appliedCategory?.key,
    );
    if (exists) {
      return categories.map((category) =>
        category.key === report.appliedCategory?.key
          ? report.appliedCategory as ManagedCategory
          : category,
      );
    }
    return [...categories, report.appliedCategory];
  }

  const existing = resolveCategoryTargetIfPresent(row, categories);
  const now = new Date().toISOString();
  const nextCategory: ManagedCategory = {
    key: existing?.key ?? `pending-${categoryName(row).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: categoryName(row),
    parentKey: resolveCategoryParentKey(row, categories, existing),
    description: row.values.Description ?? "",
    thumbnailPath: row.values["Thumbnail Path"] ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    return categories.map((category) =>
      category.key === existing.key ? { ...category, ...nextCategory } : category,
    );
  }
  return [...categories, nextCategory];
}

function resolveCategoryTargetIfPresent(
  row: ImportCsvPreviewRow,
  categories: ManagedCategory[],
) {
  const ref = (row.values["Sakurava Ref"] ?? "").trim();
  if (ref) {
    return categories.find((category) => sakuravaRef("CAT", category.key) === ref);
  }
  if (row.action !== "Update") {
    return undefined;
  }
  const name = categoryName(row).toLowerCase();
  const parentName = categoryParentName(row).toLowerCase();
  return categories.find((category) => {
    if (category.name.trim().toLowerCase() !== name) {
      return false;
    }
    const parent = category.parentKey
      ? categories.find((candidate) => candidate.key === category.parentKey)
      : null;
    return (parent?.name.trim().toLowerCase() ?? "") === parentName;
  });
}

function reportFromRows(
  preview: ImportCsvPreview,
  rows: ImportCsvApplyRowReport[],
): ImportCsvApplyReport {
  return {
    entity: preview.summary.entity,
    totalRows: preview.summary.totalRows,
    appliedAdded: rows.filter(
      (row) => row.status === "applied" && row.result === "Added",
    ).length,
    appliedModified: rows.filter(
      (row) => row.status === "applied" && row.result === "Modified",
    ).length,
    appliedDeleted: rows.filter(
      (row) => row.status === "applied" && row.result === "Deleted",
    ).length,
    unchanged: rows.filter((row) => row.status === "unchanged").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    failed: rows.filter((row) => row.status === "failed").length,
    warnings: rows.reduce((total, row) => total + row.warnings.length, 0),
    errors: rows.reduce((total, row) => total + row.errors.length, 0),
    rows,
  };
}

function appliedRow(row: ImportCsvPreviewRow, message: string): ImportCsvApplyRowReport {
  return {
    rowNumber: row.rowNumber,
    action: row.action,
    result: row.detectedResult,
    status: "applied",
    target: row.target,
    message,
    warnings: row.warnings,
    errors: [],
  };
}

function failedRow(row: ImportCsvPreviewRow, message: string): ImportCsvApplyRowReport {
  return {
    rowNumber: row.rowNumber,
    action: row.action,
    result: row.detectedResult,
    status: "failed",
    target: row.target,
    message,
    warnings: row.warnings,
    errors: [...row.errors, message],
  };
}

function skippedRow(row: ImportCsvPreviewRow, message: string): ImportCsvApplyRowReport {
  return {
    rowNumber: row.rowNumber,
    action: row.action,
    result: row.detectedResult,
    status: "skipped",
    target: row.target,
    message,
    warnings: row.warnings,
    errors: [],
  };
}

function unchangedRow(row: ImportCsvPreviewRow, message: string): ImportCsvApplyRowReport {
  return {
    rowNumber: row.rowNumber,
    action: row.action,
    result: row.detectedResult,
    status: "unchanged",
    target: row.target,
    message,
    warnings: row.warnings,
    errors: [],
  };
}

function failureRow(
  rowNumber: number,
  action: ImportCsvPreviewRow["action"],
  result: ImportCsvPreviewRow["detectedResult"],
  message: string,
): ImportCsvApplyRowReport {
  return {
    rowNumber,
    action,
    result,
    status: "failed",
    target: "",
    message,
    warnings: [],
    errors: [message],
  };
}
