import { isTauriRuntimeAvailable } from "./tauriClient";
import type { ExportCsvEntity, ExportFormat } from "../lib/exportCsv";
import { defaultExportFileName } from "../lib/exportArtifacts";
import { defaultExportCsvFileName, localFileTimestamp } from "./exportCommands";
import { defaultLanguageCsvFileName } from "../lib/languageCsv";
import type { LanguageCode } from "../lib/language";

export function defaultDatabaseBackupFileName(date = new Date()) {
  return `skv-backup-${localFileTimestamp(date)}.sqlite`;
}

export async function selectDatabaseBackupDestination() {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: "Back Up Sakurava Database",
    defaultPath: defaultDatabaseBackupFileName(),
    filters: [
      {
        name: "SQLite database",
        extensions: ["sqlite"],
      },
    ],
  });
}

export async function selectDatabaseRestoreSource() {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    title: "Restore Sakurava Database",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "SQLite database",
        extensions: ["sqlite"],
      },
    ],
  });
}

export async function selectExportCsvDestination(entity: ExportCsvEntity) {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: `Export Sakurava ${entity} CSV`,
    defaultPath: defaultExportCsvFileName(entity),
    filters: [
      {
        name: "CSV",
        extensions: ["csv"],
      },
    ],
  });
}

export async function selectCatalogExportDestination(
  dataTypes: ExportCsvEntity[],
  format: ExportFormat,
  date = new Date(),
) {
  if (!isTauriRuntimeAvailable()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: `Export Sakurava ${format === "xlsx" ? "Excel Workbook" : "CSV"}`,
    defaultPath: defaultExportFileName(dataTypes, format, date),
    filters: [{
      name: format === "xlsx" ? "Excel Workbook" : "CSV",
      extensions: [format],
    }],
  });
}

export async function selectCatalogCsvExportFolder() {
  return selectLocalPath({
    title: "Export Sakurava CSV Files To Folder",
    directory: true,
  });
}

export async function selectImportCsvSource() {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selectedPath = await open({
    title: "Import Sakurava CSV Preview",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "CSV",
        extensions: ["csv"],
      },
    ],
  });

  return Array.isArray(selectedPath) ? (selectedPath[0] ?? null) : selectedPath;
}

export async function selectImportCatalogSource() {
  if (!isTauriRuntimeAvailable()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selectedPath = await open({
    title: "Import Sakurava Catalog",
    multiple: false,
    directory: false,
    filters: [
      { name: "Sakurava Catalog", extensions: ["xlsx", "csv"] },
      { name: "Excel Workbook", extensions: ["xlsx"] },
      { name: "CSV", extensions: ["csv"] },
    ],
  });
  return Array.isArray(selectedPath) ? (selectedPath[0] ?? null) : selectedPath;
}

export async function selectLocalImageFile() {
  return selectLocalPath({
    title: "Select Image File",
    filters: [
      {
        name: "Image",
        extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
      },
    ],
  });
}

export async function selectLocalImageFiles() {
  return selectLocalPaths({
    title: "Select Image Files",
    multiple: true,
    filters: [
      {
        name: "Image",
        extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
      },
    ],
  });
}

export async function selectLocalMediaFile() {
  return selectLocalPath({
    title: "Select Media File",
    filters: [
      {
        name: "Media",
        extensions: ["mp4", "mkv", "avi", "mov", "wmv", "webm", "m4v"],
      },
    ],
  });
}

export async function selectDetailSaveAsDestination(sourcePath: string) {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: "Save Source File As",
    defaultPath: defaultDetailSaveAsFileName(sourcePath),
  });
}

export async function selectLocalFolder() {
  return selectLocalPath({
    title: "Select Folder",
    directory: true,
  });
}

export async function selectBackupPackageExportDestination() {
  return selectLocalPath({
    title: "Download Backup Package To",
    directory: true,
  });
}

function defaultDetailSaveAsFileName(sourcePath: string) {
  const normalizedPath = sourcePath.trim().replace(/\\/g, "/");
  return normalizedPath.split("/").filter(Boolean).pop() ?? "sakurava-source-file";
}

export async function selectGalleryFolder() {
  return selectLocalPath({
    title: "Browse Gallery Folder",
    directory: true,
  });
}

async function selectLocalPath(options: {
  title: string;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}) {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selectedPath = await open({
    title: options.title,
    multiple: false,
    directory: options.directory ?? false,
    filters: options.filters,
  });

  return Array.isArray(selectedPath) ? (selectedPath[0] ?? null) : selectedPath;
}

async function selectLocalPaths(options: {
  title: string;
  multiple?: boolean;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}) {
  if (!isTauriRuntimeAvailable()) {
    return [];
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selectedPath = await open({
    title: options.title,
    multiple: options.multiple ?? false,
    directory: options.directory ?? false,
    filters: options.filters,
  });

  if (!selectedPath) {
    return [];
  }

  return Array.isArray(selectedPath) ? selectedPath : [selectedPath];
}

export async function selectLanguageCsvExportDestination(languageCode: LanguageCode) {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: languageCode === "en" ? "Export Custom Language Starter CSV" : `Export Language CSV (${languageCode})`,
    defaultPath: defaultLanguageCsvFileName(languageCode),
    filters: [
      {
        name: "CSV",
        extensions: ["csv"],
      },
    ],
  });
}

export async function selectLanguageCsvImportSource() {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const selectedPath = await open({
    title: "Import Sakurava Language CSV",
    multiple: false,
    directory: false,
    filters: [
      {
        name: "CSV",
        extensions: ["csv"],
      },
    ],
  });

  return Array.isArray(selectedPath) ? (selectedPath[0] ?? null) : selectedPath;
}

export async function selectTranslationRecoveryJsonDestination() {
  if (!isTauriRuntimeAvailable()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: "Export Translation Recovery Evidence",
    defaultPath: "sakurava-translation-recovery.json",
    filters: [
      {
        name: "JSON",
        extensions: ["json"],
      },
    ],
  });
}
