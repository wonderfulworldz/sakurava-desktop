import { invokeTauriCommand } from "./tauriClient";
import type { ImportOperationPlan } from "../lib/importOperationPlan";

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
  message: string;
  rollbackCompleted: boolean;
};

export function applyImportCatalogPlan(plan: ImportOperationPlan) {
  return invokeTauriCommand<ImportCatalogApplyResult>("import_catalog_apply", { plan });
}
