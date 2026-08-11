import type {
  Credit,
  CreditPatch,
  GlossaryEntry,
  GlossaryEntryPatch,
  Image,
  ImagePatch,
  ManagedCategory,
  ManagedCategoryPatch,
  NewImage,
  NewCredit,
  NewGlossaryEntry,
  NewManagedCategory,
  NewPerformer,
  NewVideo,
  Performer,
  PerformerPatch,
  Video,
  VideoPatch,
} from "../backend/types";
import {
  importSchemaFor,
  sakuravaRefMatches,
  type CsvInternalField,
  type CsvSchemaColumn,
} from "./exportCsv";
import type { ImportCsvEntity } from "./importCsvPreview";
import type {
  ImportCsvPreview,
  ImportCsvPreviewContext,
  ImportCsvPreviewRow,
} from "./importCsvPreview";
import { storeManagedCategories } from "./managedCategories";
import { SAKURAVA_CLEAR_VALUE } from "./importExportContract";
import {
  canonicalSakuravaRef,
  canonicalImportIdentity,
  resolveSakuravaIdentity,
  sakuravaIdentityLookupKeys,
  sectionCodeForLegacyPrefix,
} from "./sakuravaRef";

export type ImportCatalogRecord = Video | Image | Performer | ManagedCategory | GlossaryEntry | Credit;
type CatalogRecord = ImportCatalogRecord;
type CatalogPatch =
  | VideoPatch
  | ImagePatch
  | PerformerPatch
  | ManagedCategoryPatch
  | GlossaryEntryPatch
  | CreditPatch;

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
  entity: ImportCsvEntity | "unknown";
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
  createGlossaryEntry: (input: NewGlossaryEntry) => Promise<GlossaryEntry>;
  updateGlossaryEntry: (
    id: string,
    patch: GlossaryEntryPatch,
  ) => Promise<GlossaryEntry | null>;
  deleteGlossaryEntry: (id: string) => Promise<{ id: string; deleted: boolean }>;
  createCredit?: (input: NewCredit) => Promise<Credit>;
  updateCredit?: (id: string, patch: CreditPatch) => Promise<Credit | null>;
  deleteCredit?: (id: string) => Promise<{ id: string; deleted: boolean }>;
};

type EntityApplyDefinition = {
  entity: ImportCsvEntity;
  sectionCode: "V" | "I" | "P" | "C" | "G" | "R";
  mainHeader: string;
  schema: CsvSchemaColumn<any>[];
  records: (context: ImportCsvPreviewContext) => ImportCatalogRecord[];
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
    sectionCode: "V",
    mainHeader: "Title",
    schema: importSchemaFor("videos"),
    records: (context) => context.videos,
    create: (mutations, input) => mutations.createVideo(input as NewVideo),
    update: (mutations, id, patch) => mutations.updateVideo(id, patch as VideoPatch),
    delete: (mutations, id) => mutations.deleteVideo(id),
  },
  {
    entity: "images",
    sectionCode: "I",
    mainHeader: "Title",
    schema: importSchemaFor("images"),
    records: (context) => context.images,
    create: (mutations, input) => mutations.createImage(input as NewImage),
    update: (mutations, id, patch) => mutations.updateImage(id, patch as ImagePatch),
    delete: (mutations, id) => mutations.deleteImage(id),
  },
  {
    entity: "performers",
    sectionCode: "P",
    mainHeader: "Name",
    schema: importSchemaFor("performers"),
    records: (context) => context.performers,
    create: (mutations, input) => mutations.createPerformer(input as NewPerformer),
    update: (mutations, id, patch) =>
      mutations.updatePerformer(id, patch as PerformerPatch),
    delete: (mutations, id) => mutations.deletePerformer(id),
  },
  {
    entity: "categories",
    sectionCode: "C",
    mainHeader: "Category Name",
    schema: importSchemaFor("categories"),
    records: (context) => context.categories,
    create: (mutations, input) =>
      mutations.createManagedCategory(input as NewManagedCategory),
    update: (mutations, id, patch) =>
      mutations.updateManagedCategory(id, patch as ManagedCategoryPatch),
    delete: (mutations, id) => mutations.deleteManagedCategory(id),
  },
  {
    entity: "glossary",
    sectionCode: "G",
    mainHeader: "Term",
    schema: importSchemaFor("glossary"),
    records: (context) => context.glossary ?? [],
    create: (mutations, input) =>
      mutations.createGlossaryEntry(input as NewGlossaryEntry),
    update: (mutations, id, patch) =>
      mutations.updateGlossaryEntry(id, patch as GlossaryEntryPatch),
    delete: (mutations, id) => mutations.deleteGlossaryEntry(id),
  },
  {
    entity: "credits",
    sectionCode: "R",
    mainHeader: "Work Ref",
    schema: importSchemaFor("credits"),
    records: (context) => context.credits ?? [],
    create: (mutations, input) => {
      if (!mutations.createCredit) throw new Error("Credit mutation runtime is unavailable.");
      return mutations.createCredit(input as NewCredit);
    },
    update: (mutations, id, patch) => {
      if (!mutations.updateCredit) throw new Error("Credit mutation runtime is unavailable.");
      return mutations.updateCredit(id, patch as CreditPatch);
    },
    delete: (mutations, id) => {
      if (!mutations.deleteCredit) throw new Error("Credit mutation runtime is unavailable.");
      return mutations.deleteCredit(id);
    },
  },
];

const blockingWarningPatterns = [
  /^Unknown category:/,
  /^Unresolved related/,
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
        "Import apply requires a valid catalog preview with no header errors.",
      ),
    ]);
  }

  const definition = applyDefinitions.find(
    (candidate) => candidate.entity === preview.summary.entity,
  );
  if (!definition) {
    return reportFromRows(preview, [
      failureRow(0, "Invalid", "Error", "Unsupported catalog data type."),
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
    return skippedRow(row, "Skipped by import Action.");
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
      showInVideos: parseBooleanCsvCell(row.values["Show in Videos"] ?? "true"),
      showInImages: parseBooleanCsvCell(row.values["Show in Images"] ?? "true"),
      showInPerformers: parseBooleanCsvCell(
        row.values["Show in Performers"] ?? "true",
      ),
      showInCredits: parseBooleanCsvCell(
        row.values["Show in Credits"] ?? "false",
        false,
      ),
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
    return skippedRow(row, "Skipped by import Action.");
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
  if (definition.entity === "credits") {
    return buildCreditPatchFromRow(row, context, existing as Credit | undefined);
  }
  const patch: Record<string, unknown> = {};
  const headers = new Set(Object.keys(row.values));
  const changedHeaders =
    row.detectedResult === "Added" ? headers : new Set(row.changes);
  const schemaByHeader = new Map(definition.schema.map((column) => [column.header, column]));

  for (const [header, column] of schemaByHeader) {
    if (!headers.has(header) || header === "Action" || header === "Sakurava Ref" || header === "Import Ref" || header === "Import Resolution") {
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
  if (definition.entity === "glossary" && row.detectedResult === "Added") {
    if (!("term" in patch)) patch.term = row.values.Term?.trim() ?? "";
    if (!("definition" in patch)) patch.definition = row.values.Definition?.trim() ?? "";
  }
  if (definition.entity === "performers") {
    const performer = existing && "debutDate" in existing ? existing : undefined;
    const debutDate = String(patch.debutDate ?? performer?.debutDate ?? "");
    const retiredDate = String(patch.retiredDate ?? performer?.retiredDate ?? "");
    if (row.detectedResult === "Added" || "debutDate" in patch || "retiredDate" in patch) {
      patch.status = retiredDate ? "Retired" : debutDate ? "Active" : "Unknown";
    }
    if ("relatedVideosJson" in patch) {
      patch.filmographyCount = parseJsonArrayLength(patch.relatedVideosJson);
    }
    if ("relatedImagesJson" in patch) {
      patch.pictorialsCount = parseJsonArrayLength(patch.relatedImagesJson);
    }
  }

  return patch;
}

function buildCreditPatchFromRow(
  row: ImportCsvPreviewRow,
  context: ImportCsvPreviewContext,
  existing: Credit | undefined,
) {
  const patch: Record<string, unknown> = {};
  const isAdd = row.detectedResult === "Added";
  const changed = new Set(row.changes);
  const shouldWrite = (header: string) => isAdd || changed.has(header);
  const value = (header: string) => row.values[header] ?? "";
  const optional = (header: string) => clearValue(value(header)).trim() || null;

  const workTypeValue = value("Work Type").trim();
  const workRefValue = value("Work Ref").trim();
  if (isAdd || shouldWrite("Work Type") || shouldWrite("Work Ref")) {
    const workType = (workTypeValue || existing?.workType || "").toLowerCase();
    const workRef = workRefValue || (existing ? existing.workId : "");
    const resolved = !workRefValue
      ? undefined
      : workType === "video"
        ? resolveSakuravaIdentity("V", workRefValue, context.videos)
        : resolveSakuravaIdentity("I", workRefValue, context.images);
    if (workTypeValue || isAdd) patch.workType = workType;
    if (resolved?.status === "resolved") patch.workId = resolved.record.id;
    else if (isAdd) patch.workId = workRef;
  }

  if (isAdd || shouldWrite("Performer Ref")) {
    const performerRef = value("Performer Ref").trim();
    const resolved = resolveSakuravaIdentity("P", performerRef, context.performers);
    patch.performerId = resolved.status === "resolved" ? resolved.record.id : performerRef;
  }
  if (isAdd || shouldWrite("Character / Role")) patch.characterName = clearValue(value("Character / Role")).trim();
  if (isAdd || shouldWrite("Original Character")) patch.characterOriginalName = optional("Original Character");
  if (isAdd || shouldWrite("Credited As Mode")) patch.creditedAsMode = value("Credited As Mode").trim().toLowerCase();
  if (isAdd || shouldWrite("Credited As")) patch.creditedAs = optional("Credited As");
  if (isAdd || shouldWrite("Credit Type")) patch.creditTypeText = optional("Credit Type");
  if (isAdd || shouldWrite("Role Importance")) {
    const roleImportance = value("Role Importance").trim();
    if (!roleImportance || roleImportance === SAKURAVA_CLEAR_VALUE) {
      patch.roleImportanceCategoryId = null;
    } else {
      const resolved = resolveSakuravaIdentity("C", roleImportance, context.categories);
      patch.roleImportanceCategoryId = resolved.status === "resolved" ? resolved.record.key : roleImportance;
    }
  }
  if (isAdd || shouldWrite("Character Mode")) patch.characterMode = value("Character Mode").trim().toLowerCase();
  if (isAdd || shouldWrite("Billing Order")) {
    const billingOrder = clearValue(value("Billing Order")).trim();
    patch.billingOrder = billingOrder ? Number(billingOrder) : null;
  }
  if (isAdd || shouldWrite("Note")) patch.note = optional("Note");
  return patch;
}

export function buildNormalizedImportPatch(
  entity: ImportCsvEntity,
  row: ImportCsvPreviewRow,
  context: ImportCsvPreviewContext,
) {
  const definition = applyDefinitions.find((candidate) => candidate.entity === entity);
  if (!definition) throw new Error("Unsupported catalog data type.");
  const ref = (row.values["Sakurava Ref"] ?? "").trim();
  const resolution = resolveSakuravaIdentity(
    definition.sectionCode,
    ref,
    definition.records(context),
  );
  const existing = row.detectedResult === "Added"
    ? undefined
    : resolution.status === "resolved" ? resolution.record : undefined;
  const patch = buildPatchFromRow(row, definition, context, existing);
  if (row.detectedResult === "Added") {
    const requestedRef = canonicalSakuravaRef(row.values["Sakurava Ref"] ?? "");
    if (requestedRef) {
      patch.requestedSakuravaRef = requestedRef;
    }
  }
  return patch;
}

export function resolveImportRecord(
  entity: ImportCsvEntity,
  ref: string,
  context: ImportCsvPreviewContext,
) {
  const definition = applyDefinitions.find((candidate) => candidate.entity === entity);
  if (!definition) return undefined;
  const resolution = resolveSakuravaIdentity(
    definition.sectionCode,
    ref,
    definition.records(context),
  );
  return resolution.status === "resolved" ? resolution.record : undefined;
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
    internalField === "importRef" ||
    internalField === "importResolution" ||
    internalField === "visibility" ||
    internalField === "categoryNotes" ||
    internalField.startsWith("ratingJson.") ||
    internalField.startsWith("galleryImagePathsJson.") ||
    internalField.startsWith("performerThumbnailPathsJson.")
  ) {
    return;
  }

  if (internalField === "parentCategoryName") {
    patch.parentKey = resolveParentCategoryKey(clearValue(value), context);
    return;
  }

  if (internalField === "parentCategoryRef") {
    patch.parentKey = resolveParentCategoryRef(clearValue(value), context);
    return;
  }

  if (internalField === "parentId" && definition.entity === "glossary") {
    patch.parentId = resolveGlossaryParentId(clearValue(value), context);
    return;
  }

  if (
    internalField === "categoriesJson" ||
    internalField === "aliasesJson" ||
    internalField === "synonymsJson" ||
    internalField === "glossaryRefsJson"
  ) {
    if (internalField === "glossaryRefsJson") {
      patch.glossaryRefsJson = JSON.stringify(resolveGlossaryRefs(clearValue(value), context));
      return;
    }
    patch[internalField] = JSON.stringify(parseSemicolonList(clearValue(value)));
    return;
  }

  if (internalField === "sourceLinksJson") {
    patch.sourceLinksJson = JSON.stringify(parseSourceLinks(clearValue(value)));
    return;
  }

  if (isRelatedField(internalField)) {
    patch[internalField] = JSON.stringify(resolveRelatedList(header, clearValue(value), context));
    return;
  }

  if (
    internalField === "heightCm" ||
    internalField === "weightKg" ||
    internalField === "durationMinutes" ||
    internalField === "fileSizeBytes" ||
    internalField === "imageCount" ||
    internalField === "totalFileSizeBytes"
  ) {
    const normalized = clearValue(value);
    patch[internalField] = normalized.trim() ? Number(normalized) : null;
    return;
  }

  if (
    internalField === "showInVideos" ||
    internalField === "showInImages" ||
    internalField === "showInPerformers" ||
    internalField === "showInCredits" ||
    internalField === "favorite" ||
    internalField === "rPlus"
  ) {
    patch[internalField] = parseBooleanCsvCell(value, false);
    return;
  }

  patch[internalField] = clearValue(value);
}

function resolveGlossaryRefs(value: string, context: ImportCsvPreviewContext) {
  return parseSemicolonList(value).map((item) => {
    const resolution = resolveSakuravaIdentity(
      "G",
      item.split("|")[0].trim(),
      context.glossary ?? [],
    );
    if (resolution.status !== "resolved") {
      const canonical = canonicalSakuravaRef(item.split("|")[0].trim());
      if (canonical && canonical[0] === "G") {
        return canonical;
      }
      throw new Error(`Glossary Ref was not found or is ambiguous: ${item}.`);
    }
    return resolution.record.id;
  });
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
    const value = clearValue(row.values[column.header]).trim();
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
        .map((column) => clearValue(row.values[column.header] ?? "").trim())
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
        .map((column) => clearValue(row.values[column.header] ?? "").trim())
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
      return { performerId: performer.id, nameSnapshot: performer.label };
    });
  }
  if (header === "Related Videos") {
    return items.map((item) => {
      const video = resolveRelatedRecord(item, "VID", context.videos, "title");
      return { recordId: video.id, titleSnapshot: video.label };
    });
  }
  return items.map((item) => {
    const image = resolveRelatedRecord(item, "IMG", context.images, "title");
    return { recordId: image.id, titleSnapshot: image.label };
  });
}

function resolveRelatedRecord<TRecord extends { id: string; sakuravaRef?: string }>(
  item: string,
  prefix: "VID" | "IMG" | "PER",
  records: TRecord[],
  _labelKey: keyof TRecord & string,
) : { id: string; label: string } {
  const ref = item.split("|")[0].trim();
  const resolution = resolveSakuravaIdentity(
    sectionCodeForLegacyPrefix(prefix),
    ref,
    records,
  );
  if (resolution.status !== "resolved") {
    const canonical = canonicalSakuravaRef(ref);
    if (canonical && canonical[0] === sectionCodeForLegacyPrefix(prefix)) {
      return { id: canonical, label: "" };
    }
    throw new Error(`Unresolved related reference: ${item}.`);
  }
  return {
    id: resolution.record.id,
    label: String(resolution.record[_labelKey] ?? ""),
  };
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

function resolveGlossaryParentId(
  parentRef: string,
  context: ImportCsvPreviewContext,
) {
  const ref = parentRef.trim();
  if (!ref) return "";
  if (/^GLO-NEW-/.test(ref)) return ref;
  const match = (context.glossary ?? []).find(
    (entry) => sakuravaRefMatches("GLO", ref, entry),
  );
  if (!match) {
    const canonical = canonicalSakuravaRef(ref);
    if (canonical && canonical[0] === "G") return canonical;
    throw new Error(`Glossary parent was not found: ${ref}.`);
  }
  return match.id;
}

function clearValue(value: string | undefined) {
  return (value ?? "").trim() === SAKURAVA_CLEAR_VALUE ? "" : (value ?? "");
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
    definition.records(context).flatMap((record) =>
      sakuravaIdentityLookupKeys(definition.sectionCode, record)
        .map((key) => [key, record] as const),
    ),
  );
}

function buildCategoryRecordsByRef(categories: ManagedCategory[]) {
  return new Map<string, CatalogRecord>(
    categories.flatMap((category) =>
      sakuravaIdentityLookupKeys("C", category).map((key) => [key, category] as const),
    ),
  );
}

function resolveRecord(
  row: ImportCsvPreviewRow,
  recordsByRef: Map<string, CatalogRecord>,
) {
  return recordsByRef.get(canonicalImportIdentity(row.values["Sakurava Ref"] ?? ""));
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

function parseBooleanCsvCell(value: string, defaultValue = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return defaultValue;
}

function resolveParentCategoryRef(
  parentCategoryRef: string,
  context: ImportCsvPreviewContext,
) {
  const ref = parentCategoryRef.trim();
  if (!ref) return null;
  const matches = context.categories.filter(
    (category) => sakuravaRefMatches("CAT", ref, category),
  );
  if (matches.length !== 1) {
    const canonical = canonicalSakuravaRef(ref);
    if (canonical && canonical[0] === "C") return canonical;
    throw new Error(`Parent Category reference is unresolved: ${ref}.`);
  }
  return matches[0].key;
}

function parseSourceLinks(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const divider = line.indexOf(" | ");
      return divider < 0
        ? { title: "", url: line }
        : {
            title: line.slice(0, divider).trim(),
            url: line.slice(divider + 3).trim(),
          };
    });
}

function parseJsonArrayLength(value: unknown) {
  if (typeof value !== "string") return 0;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function categoryName(row: ImportCsvPreviewRow) {
  return (row.values["Category Name"] ?? "").trim();
}

function categoryParentName(row: ImportCsvPreviewRow) {
  return (row.values["Parent Ref"] ?? "").trim();
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
  throw new Error("Category Update requires a resolvable Sakurava Ref.");
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

  const resolution = resolveSakuravaIdentity("C", parentName, categories);
  if (resolution.status !== "resolved") {
    throw new Error(`Parent Category could not be found: ${parentName}.`);
  }
  const parent = resolution.record;
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
    showInVideos: parseBooleanCsvCell(row.values["Show in Videos"] ?? "true"),
    showInImages: parseBooleanCsvCell(row.values["Show in Images"] ?? "true"),
    showInPerformers: parseBooleanCsvCell(
      row.values["Show in Performers"] ?? "true",
    ),
    showInCredits: parseBooleanCsvCell(
      row.values["Show in Credits"] ?? String(existing?.showInCredits ?? false),
      existing?.showInCredits ?? false,
    ),
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
    return categories.find((category) => sakuravaRefMatches("CAT", ref, category));
  }
  if (row.action !== "Update") {
    return undefined;
  }
  return undefined;
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
