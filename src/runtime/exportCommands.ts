import type { ExportCsvEntity } from "../lib/exportCsv";
import type { ExportArtifact } from "../lib/exportArtifacts";
import {
  defaultExportFileName,
  exportTypeCode,
  localExportTimestamp,
} from "../lib/exportArtifacts";
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
  return defaultExportFileName([entity], "csv", date);
}

export function exportEntityFileToken(entity: ExportCsvEntity) {
  return exportTypeCode([entity]);
}

export function localFileTimestamp(date = new Date()) {
  return localExportTimestamp(date);
}

export type ExportFileWriteResult = {
  destinationPath: string;
  displayName: string;
  bytesWritten: number;
  success: boolean;
};

export type ExportFileSetWriteResult = {
  destinationPath: string;
  displayNames: string[];
  filesWritten: number;
  bytesWritten: number;
  success: boolean;
};

export function writeExportArtifact(destinationPath: string, artifact: ExportArtifact) {
  return invokeTauriCommand<ExportFileWriteResult>("export_file_write", {
    destinationPath,
    bytes: Array.from(artifact.bytes),
    expectedExtension: artifact.format,
  });
}

export function writeExportArtifactSet(
  destinationFolder: string,
  artifacts: ExportArtifact[],
) {
  return invokeTauriCommand<ExportFileSetWriteResult>("export_file_set_write", {
    destinationFolder,
    files: artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      bytes: Array.from(artifact.bytes),
    })),
  });
}
