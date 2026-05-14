import { isTauriRuntimeAvailable } from "./tauriClient";

export function defaultDatabaseBackupFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `sakurava-backup-${year}-${month}-${day}.sqlite`;
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

export async function selectLocalFolder() {
  return selectLocalPath({
    title: "Select Folder",
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
