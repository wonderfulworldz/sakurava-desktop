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

export type BackupPackageType = "manual" | "automatic";

export type BackupPackageManifest = {
  format: "sakurava-backup-directory";
  version: 1;
  createdAt: string;
  backupType: BackupPackageType;
  note: string;
  includes: {
    database: true;
    originalMedia: false;
    appManagedAssets: false;
  };
  database: {
    file: "sakurava.sqlite";
  };
};

export type BackupPackageInfo = {
  packagePath: string;
  manifest: BackupPackageManifest;
};

export type BackupPackageRotationResult = {
  keptAutomatic: number;
  removedAutomatic: number;
  removedPaths: string[];
};

export type BackupFolderOpenResult = {
  folderPath: string;
  opened: boolean;
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

export function createBackupPackage(
  backupType: BackupPackageType,
  note?: string,
) {
  return invokeTauriCommand<BackupPackageInfo>("backup_package_create", {
    backupType,
    note: note ?? null,
  });
}

export function listBackupPackages() {
  return invokeTauriCommand<BackupPackageInfo[]>("backup_package_list");
}

export function rotateAutomaticBackupPackages(keepCount: number) {
  return invokeTauriCommand<BackupPackageRotationResult>(
    "backup_package_rotate_automatic",
    { keepCount },
  );
}

export function openBackupFolder() {
  return invokeTauriCommand<BackupFolderOpenResult>("backup_folder_open");
}
