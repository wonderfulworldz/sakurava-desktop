import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isDatabaseRuntimeAvailable };

export type DatabaseBackupResult = {
  destinationPath: string;
  success: boolean;
};

export type DatabaseRestoreResult = {
  sourcePath: string;
  success: boolean;
  safetyBackupPath: string;
  restartRequired: boolean;
};

export function backUpDatabase(destinationPath: string) {
  return invokeTauriCommand<DatabaseBackupResult>("database_backup", {
    destinationPath,
  });
}

export function restoreDatabase(sourcePath: string) {
  return invokeTauriCommand<DatabaseRestoreResult>("database_restore", {
    sourcePath,
  });
}
