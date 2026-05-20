import type { ExportCsvEntity } from "../lib/exportCsv";
import { invokeTauriCommand } from "./tauriClient";

export type ExportCsvWriteResult = {
  destinationPath: string;
  bytesWritten: number;
  success: boolean;
};

export function writeExportCsv(destinationPath: string, csvContent: string) {
  return invokeTauriCommand<ExportCsvWriteResult>("export_csv_write", {
    destinationPath,
    csvContent,
  });
}

export function defaultExportCsvFileName(entity: ExportCsvEntity, date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `sakurava-${entity}-${year}-${month}-${day}.csv`;
}
