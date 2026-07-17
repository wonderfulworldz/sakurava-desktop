import { invokeTauriCommand } from "./tauriClient";
import {
  assertImportOperationPlanIntegrity,
  type ImportOperationPlan,
} from "../lib/importOperationPlan";

export type ImportCsvReadResult = {
  sourcePath: string;
  csvContent: string;
  bytesRead: number;
  success: boolean;
};

export function readImportCsv(sourcePath: string) {
  return invokeTauriCommand<ImportCsvReadResult>("import_csv_read", {
    sourcePath,
  });
}

export type ImportCatalogFileReadResult = {
  sourcePath: string;
  displayName: string;
  format: "csv" | "xlsx";
  bytes: number[];
  bytesRead: number;
  success: boolean;
};

export function readImportCatalogFile(sourcePath: string) {
  return invokeTauriCommand<ImportCatalogFileReadResult>("import_catalog_file_read", {
    sourcePath,
  });
}

export type ImportCatalogApplyResult = {
  transactionStatus: "committed" | "rolledBack" | "blocked";
  backupPackageName: string | null;
  createdCount: number;
  updatedCount: number;
  clearedFieldCount: number;
  deletedCount: number;
  skippedCount: number;
  failureStage: "validation" | "stalePreview" | "backup" | "apply" | "commit" | null;
  /** Diagnostic gate returned for development logs; never render this in UI. */
  failureCode?: string | null;
  message: string;
  rollbackCompleted: boolean;
};

export function applyImportCatalogPlan(plan: ImportOperationPlan) {
  try {
    assertImportOperationPlanIntegrity(plan);
  } catch (error) {
    console.error("Sakurava import plan contract validation failed", {
      failureCode: "PLAN_FINGERPRINT_MISMATCH",
      field: error instanceof Error && "field" in error ? error.field : undefined,
      expectedFingerprint: error instanceof Error && "expectedFingerprint" in error
        ? error.expectedFingerprint
        : undefined,
      actualFingerprint: error instanceof Error && "actualFingerprint" in error
        ? error.actualFingerprint
        : undefined,
      operationCount: plan.operations.length,
      cleanupCount: plan.operations.filter((operation) => operation.sourceRowNumber === 0).length,
      skippedCount: plan.skippedCount,
    });
    return Promise.reject(error);
  }
  return invokeTauriCommand<ImportCatalogApplyResult>("import_catalog_apply", { plan });
}
