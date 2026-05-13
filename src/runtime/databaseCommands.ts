import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export { isTauriRuntimeAvailable as isDatabaseRuntimeAvailable };

export type DatabaseBackupResult = {
  destinationPath: string;
  success: boolean;
};

export function backUpDatabase(destinationPath: string) {
  return invokeTauriCommand<DatabaseBackupResult>("database_backup", {
    destinationPath,
  });
}
