import { invokeTauriCommand } from "./tauriClient";

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
