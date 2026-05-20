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
  return `skv-${exportEntityFileToken(entity)}-${localFileTimestamp(date)}.csv`;
}

export function exportEntityFileToken(entity: ExportCsvEntity) {
  if (entity === "videos") {
    return "vid";
  }
  if (entity === "images") {
    return "img";
  }
  if (entity === "performers") {
    return "per";
  }
  return "cat";
}

export function localFileTimestamp(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${day}${month}-${hours}${minutes}${seconds}`;
}
