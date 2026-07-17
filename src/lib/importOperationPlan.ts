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
import { canonicalImportIdentity } from "./sakuravaRef";
import { currentSakuravaRefYymm } from "./sakuravaRef";

export type ImportPlanAction = "create" | "update" | "delete";

export type ImportFieldDifference = {
  field: string;
  oldValue: string;
  newValue: string;
  cleared: boolean;
};

export type ImportPlanOperation = {
  sourceIdentity: string;
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
  issuanceYymm: string;
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
  issuanceYymm = currentSakuravaRefYymm(),
): ImportOperationPlan {
  if (preview.summary.blocked) {
    throw new Error("Import operation plan requires a Preview with no blocking issues.");
  }
  const sourceFingerprint = sourceFileFingerprint(sourceBytes);
  const operations = preview.rows
    .filter((row) => ["Added", "Modified", "Deleted"].includes(row.detectedResult))
    .map((row) => buildOperation(row, context, sourceFingerprint));
  const catalogSnapshot = snapshotCatalog(context);
  const plan: ImportOperationPlan = {
    contractVersion: SAKURAVA_IMPORT_CONTRACT_VERSION,
    issuanceYymm,
    sourceFingerprint,
    operationFingerprint: "",
    catalogSnapshot,
    operations,
    skippedCount: preview.rows.length - operations.length,
  };
  plan.operationFingerprint = operationFingerprint(importPlanFingerprintPayload(plan));
  return plan;
}

export function importPlanFingerprintPayload(plan: ImportOperationPlan) {
  return {
    contractVersion: plan.contractVersion,
    issuanceYymm: plan.issuanceYymm,
    sourceFingerprint: plan.sourceFingerprint,
    catalogSnapshot: plan.catalogSnapshot,
    operations: plan.operations.map((operation) => ({
      sourceIdentity: operation.sourceIdentity,
      sourceRowNumber: operation.sourceRowNumber,
      section: operation.section,
      action: operation.action,
      stableRecordIdentifier: operation.stableRecordIdentifier,
      recordId: operation.recordId,
      temporaryIdentifier: operation.temporaryIdentifier,
      currentRecord: operation.currentRecord,
      proposedValues: operation.proposedValues,
      clearedFields: operation.clearedFields,
      dependencyRefs: operation.dependencyRefs,
    })),
    skippedCount: plan.skippedCount,
  };
}

function buildOperation(
  row: ImportCatalogRow,
  context: ImportCsvPreviewContext,
  sourceFingerprint: string,
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
    sourceIdentity: [sourceFingerprint, row.dataType, row.sheetName, row.rowNumber]
      .map((value) => encodeURIComponent(String(value)))
      .join(":"),
    sourceRowNumber: row.rowNumber,
    section: row.dataType,
    action,
    stableRecordIdentifier: /^GLO-NEW-/.test(ref) ? ref : canonicalImportIdentity(ref),
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
