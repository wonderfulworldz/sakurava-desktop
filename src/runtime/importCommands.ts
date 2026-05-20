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
