import type { ImportCatalogPreview, ImportCatalogRow, ImportCleanupOperation } from "./importCatalog";
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
  section: ImportCsvEntity | "credits";
  action: ImportPlanAction;
  stableRecordIdentifier: string;
  recordId: string | null;
  temporaryIdentifier: string | null;
  currentRecord: ImportCatalogRecord | Record<string, unknown> | null;
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

export class ImportPlanContractError extends Error {
  readonly field: string;
  readonly expectedFingerprint?: string;
  readonly actualFingerprint?: string;

  constructor(
    field: string,
    diagnostics?: { expectedFingerprint?: string; actualFingerprint?: string },
  ) {
    super("The import plan could not be processed.");
    this.name = "ImportPlanContractError";
    this.field = field;
    this.expectedFingerprint = diagnostics?.expectedFingerprint;
    this.actualFingerprint = diagnostics?.actualFingerprint;
  }
}

export function buildImportOperationPlan(
  preview: ImportCatalogPreview,
  context: ImportCsvPreviewContext,
  sourceBytes: Uint8Array,
  issuanceYymm = currentSakuravaRefYymm(),
): ImportOperationPlan {
  if (preview.headerErrors.length > 0) {
    throw new Error("Import operation plan requires an interpretable file.");
  }
  const sourceFingerprint = sourceFileFingerprint(sourceBytes);
  const operations: ImportPlanOperation[] = preview.rows
    .filter((row) => ["Added", "Modified", "Deleted"].includes(row.detectedResult))
    .slice()
    .sort((left, right) => {
      const leftOrder = left.detectedResult === "Deleted" ? left.dependencyPlan?.deleteOrder ?? 0 : -1;
      const rightOrder = right.detectedResult === "Deleted" ? right.dependencyPlan?.deleteOrder ?? 0 : -1;
      return leftOrder - rightOrder
        || left.dataType.localeCompare(right.dataType)
        || left.sheetName.localeCompare(right.sheetName)
        || left.rowNumber - right.rowNumber;
    })
    .map((row) => buildOperation(row, context, sourceFingerprint));
  // Cleanup updates are semantically independent from their discovery order.
  // Canonicalize them before serializing so map/list iteration in Preview can
  // never change the immutable plan fingerprint or runtime payload.
  for (const cleanup of [...(preview.automaticCleanupOperations ?? [])].sort(compareCleanupOperations)) {
    operations.push(buildCleanupOperation(cleanup));
  }
  const catalogSnapshot = snapshotCatalog(context);
  const plan: ImportOperationPlan = {
    contractVersion: SAKURAVA_IMPORT_CONTRACT_VERSION,
    issuanceYymm,
    sourceFingerprint,
    operationFingerprint: "",
    catalogSnapshot,
    operations,
    // Automatic cleanup operations are not spreadsheet rows. They must never
    // reduce the number of row operations that were omitted from the plan.
    skippedCount: preview.rows.filter(
      (row) => !["Added", "Modified", "Deleted"].includes(row.detectedResult),
    ).length,
  };
  assertImportOperationPlanContract(plan);
  plan.operationFingerprint = operationFingerprint(importPlanFingerprintPayload(plan));
  return plan;
}

export function assertImportOperationPlanContract(plan: ImportOperationPlan) {
  if (!Number.isSafeInteger(plan.skippedCount) || plan.skippedCount < 0) {
    throw new ImportPlanContractError("skippedCount");
  }
  const targetedRecords = new Map<string, number>();
  for (const [index, operation] of plan.operations.entries()) {
    if (!Number.isSafeInteger(operation.sourceRowNumber) || operation.sourceRowNumber < 0) {
      throw new ImportPlanContractError(`operations[${index}].sourceRowNumber`);
    }
    if (operation.action === "create" || !operation.recordId) continue;
    const target = `${operation.section}:${operation.recordId}`;
    const firstIndex = targetedRecords.get(target);
    if (firstIndex !== undefined) {
      throw new ImportPlanContractError(
        `operations[${index}] duplicates ${target} from operations[${firstIndex}]`,
      );
    }
    targetedRecords.set(target, index);
  }
}

/**
 * Confirms that the in-memory plan has not been changed after Preview. This
 * deliberately validates only the immutable plan; catalog staleness is
 * revalidated by Rust against the live database immediately before backup.
 */
export function assertImportOperationPlanIntegrity(plan: ImportOperationPlan) {
  assertImportOperationPlanContract(plan);
  const actualFingerprint = operationFingerprint(importPlanFingerprintPayload(plan));
  if (actualFingerprint !== plan.operationFingerprint) {
    throw new ImportPlanContractError("operationFingerprint", {
      expectedFingerprint: plan.operationFingerprint,
      actualFingerprint,
    });
  }
}

function compareCleanupOperations(left: ImportCleanupOperation, right: ImportCleanupOperation) {
  return left.section.localeCompare(right.section)
    || left.recordId.localeCompare(right.recordId)
    || left.action.localeCompare(right.action)
    || left.sourceIdentity.localeCompare(right.sourceIdentity);
}

function buildCleanupOperation(operation: ImportCleanupOperation): ImportPlanOperation {
  return {
    sourceIdentity: operation.sourceIdentity,
    sourceRowNumber: 0,
    section: operation.section,
    action: operation.action,
    stableRecordIdentifier: operation.recordId,
    recordId: operation.recordId,
    temporaryIdentifier: null,
    currentRecord: operation.currentRecord as Record<string, unknown>,
    proposedValues: operation.proposedValues,
    fieldDifferences: [],
    clearedFields: [],
    warnings: [],
    blockingIssues: [],
    dependencyRefs: [],
  };
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
