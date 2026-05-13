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
