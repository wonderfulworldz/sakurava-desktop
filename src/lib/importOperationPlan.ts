import type { ImportCatalogPreview, ImportCatalogRow } from "./importCatalog";
import {
  buildNormalizedImportPatch,
  resolveImportRecord,
  type ImportCatalogRecord,
} from "./importCsvApply";
import type { ImportCsvEntity, ImportCsvPreviewContext } from "./importCsvPreview";
import {
  operationFingerprint,
  SAKURAVA_IMPORT_CONTRACT_VERSION,
  sourceFileFingerprint,
} from "./importExportContract";

export type ImportPlanAction = "create" | "update" | "delete";

export type ImportFieldDifference = {
  field: string;
  oldValue: string;
  newValue: string;
  cleared: boolean;
};

export type ImportPlanOperation = {
  sourceRowNumber: number;
  section: ImportCsvEntity;
  action: ImportPlanAction;
  stableRecordIdentifier: string;
  recordId: string | null;
  temporaryIdentifier: string | null;
  currentRecord: ImportCatalogRecord | null;
  proposedValues: Record<string, unknown>;
  fieldDifferences: ImportFieldDifference[];
  clearedFields: string[];
  warnings: string[];
  blockingIssues: string[];
  dependencyRefs: string[];
};

export type ImportCatalogSnapshot = {
  videos: ImportCsvPreviewContext["videos"];
  images: ImportCsvPreviewContext["images"];
  performers: ImportCsvPreviewContext["performers"];
  categories: ImportCsvPreviewContext["categories"];
  glossary: NonNullable<ImportCsvPreviewContext["glossary"]>;
  credits: NonNullable<ImportCsvPreviewContext["credits"]>;
};

export type ImportOperationPlan = {
  contractVersion: number;
  sourceFingerprint: string;
  operationFingerprint: string;
  catalogSnapshot: ImportCatalogSnapshot;
  operations: ImportPlanOperation[];
  skippedCount: number;
};

export function buildImportOperationPlan(
  preview: ImportCatalogPreview,
  context: ImportCsvPreviewContext,
  sourceBytes: Uint8Array,
): ImportOperationPlan {
  if (preview.summary.blocked) {
    throw new Error("Import operation plan requires a Preview with no blocking issues.");
  }
  const operations = preview.rows
    .filter((row) => ["Added", "Modified", "Deleted"].includes(row.detectedResult))
    .map((row) => buildOperation(row, context));
  const catalogSnapshot = snapshotCatalog(context);
  const payload = {
    contractVersion: SAKURAVA_IMPORT_CONTRACT_VERSION,
    sourceFingerprint: sourceFileFingerprint(sourceBytes),
    catalogSnapshot,
    operations,
    skippedCount: preview.rows.length - operations.length,
  };
  return {
    ...payload,
    operationFingerprint: operationFingerprint(payload),
  };
}

export function importPlanFingerprintPayload(plan: ImportOperationPlan) {
  return {
    contractVersion: plan.contractVersion,
    sourceFingerprint: plan.sourceFingerprint,
    catalogSnapshot: plan.catalogSnapshot,
    operations: plan.operations,
    skippedCount: plan.skippedCount,
  };
}

function buildOperation(
  row: ImportCatalogRow,
  context: ImportCsvPreviewContext,
): ImportPlanOperation {
  const ref = (row.values["Sakurava Ref"] ?? "").trim();
  const current = resolveImportRecord(row.dataType, ref, context) ?? null;
  const action: ImportPlanAction = row.detectedResult === "Added"
    ? "create"
    : row.detectedResult === "Deleted"
      ? "delete"
      : "update";
  const proposedValues = action === "delete"
    ? {}
    : buildNormalizedImportPatch(row.dataType, row, context);
  const dependencyRefs = row.dataType === "glossary"
    ? [String(proposedValues.parentId ?? "")].filter((value) => /^GLO-NEW-/.test(value))
    : [];
  return {
    sourceRowNumber: row.rowNumber,
    section: row.dataType,
    action,
    stableRecordIdentifier: ref,
    recordId: current ? recordKey(current) : null,
    temporaryIdentifier: action === "create" && /^GLO-NEW-/.test(ref) ? ref : null,
    currentRecord: current,
    proposedValues,
    fieldDifferences: (row.changeDetails ?? []).map((difference) => ({
      field: difference.field,
      oldValue: difference.before,
      newValue: difference.after,
      cleared: difference.cleared === true,
    })),
    clearedFields: [...(row.clearedFields ?? [])],
    warnings: [...row.warnings],
    blockingIssues: [...row.errors],
    dependencyRefs,
  };
}

function snapshotCatalog(context: ImportCsvPreviewContext): ImportCatalogSnapshot {
  return {
    videos: sortRecords(context.videos),
    images: sortRecords(context.images),
    performers: sortRecords(context.performers),
    categories: sortRecords(context.categories),
    glossary: sortRecords(context.glossary ?? []),
    credits: sortRecords(context.credits ?? []),
  };
}

function sortRecords<T extends { id?: string; key?: string }>(records: T[]) {
  return [...records].sort((left, right) => recordKey(left).localeCompare(recordKey(right)));
}

function recordKey(record: { id?: string; key?: string }) {
  return record.key ?? record.id ?? "";
}
