import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";
import { currentSakuravaRefYymm } from "../lib/sakuravaRef";
import {
  applyProtectedStateSnapshot,
  decodeProtectedStateSnapshot,
  encodeProtectedStateSnapshot,
  exportProtectedStateSnapshot,
  prepareProtectedStateImport,
} from "../lib/backupStateSnapshot";
import {
  applySafeFilterFeatureState,
  safeFilterFeatureState,
} from "../lib/safeFilterState";

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

export type BackupPackageType = "manual" | "automatic" | "safety";
export type CreatableBackupPackageType = Exclude<BackupPackageType, "safety">;

export type BackupPackageManifest = {
  format: "sakurava-backup-directory" | "sakurava-skv";
  version: 1 | 2;
  createdAt: string;
  backupType: BackupPackageType;
  note: string;
  includes: {
    database: true;
    originalMedia: false;
    appManagedAssets: boolean;
  };
  database: {
    file: "sakurava.sqlite";
  };
};

export type BackupPackageInfo = {
  packageName: string;
  manifest: BackupPackageManifest;
};

export type BackupPackagePreviewCounts = {
  videos: number;
  images: number;
  performers: number;
  categories: number;
  glossary: number;
  credits: number;
};

export type BackupPackagePreview = {
  packageName: string;
  manifest: BackupPackageManifest;
  database: {
    file: string;
    quickCheck: "ok";
    requiredSchemaPresent: true;
    counts: BackupPackagePreviewCounts;
  };
  content: {
    databaseIncluded: true;
    originalMediaIncluded: false;
    appManagedAssetsIncluded: boolean;
  };
  warnings: string[];
  errors: string[];
  protectedState?: string | null;
  protectedStateSha256?: string | null;
};

type RestoreStateTransition = {
  operationId: string;
  mode: "restore" | "rollback";
  protectedState: string;
  expectedStateSha256: string;
};

type RestoreRecoveryStatus = {
  pending: boolean;
  transition: RestoreStateTransition | null;
};

type RestoreRollbackTransition = {
  transition: RestoreStateTransition;
  rollbackSucceeded: boolean;
};

export type RestoreBackupPackageRequest = {
  packageName: string;
  migrationYymm: string;
  currentProtectedState: string;
};

export type BackupPackageRotationResult = {
  keptAutomatic: number;
  removedAutomatic: number;
  removedPaths: string[];
};

export type BackupPackageRestoreResult = {
  restoredPackageName: string;
  safetyPackageName: string;
  restoredAt: string;
  databaseRestored: boolean;
  rollbackAttempted: boolean;
  rollbackSucceeded: boolean;
  warnings: string[];
  errors: string[];
};

export type BackupPackageRestoreError = {
  code: string;
  message: string;
  restoredPackageName: string;
  safetyPackageName: string | null;
  rollbackAttempted: boolean;
  rollbackSucceeded: boolean;
  warnings: string[];
  errors: string[];
};

export type BackupFolderOpenResult = {
  folderPath: string;
  opened: boolean;
};

export type BackupPackageDeleteResult = {
  packageName: string;
  deleted: true;
};

export type BackupPackageExportResult = {
  packageName: string;
  exported: true;
  exportedPath: string;
};

export type BackupPackageImportResult = {
  cancelled: boolean;
  imported: boolean;
  packageName: string | null;
};

export type BackupPackageImportError = {
  code: string;
  message: string;
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
  backupType: CreatableBackupPackageType,
  note?: string,
) {
  return ensureRestoreRecovery().then(() => {
    const protectedState = currentProtectedState();
    return invokeTauriCommand<BackupPackageInfo>("backup_package_create", {
      backupType,
      note: note ?? null,
      protectedState,
    });
  });
}

export async function listBackupPackages() {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupPackageInfo[]>("backup_package_list");
}

export async function previewBackupPackage(packageName: string) {
  await ensureRestoreRecovery();
  const preview = await invokeTauriCommand<BackupPackagePreview>(
    "backup_package_preview",
    { packageName },
  );
  if (preview.protectedState) {
    const decoded = decodeProtectedStateSnapshot(preview.protectedState);
    if (!decoded.ok || !prepareProtectedStateImport(decoded.value).ok) {
      throw { code: "invalid_protected_state", message: "Backup protected state is invalid." };
    }
  }
  return preview;
}

export function buildRestoreBackupPackageRequest(
  packageName: string,
  currentProtectedState: string,
  date = new Date(),
): RestoreBackupPackageRequest {
  return {
    packageName,
    migrationYymm: currentSakuravaRefYymm(date),
    currentProtectedState,
  };
}

export async function restoreBackupPackage(packageName: string) {
  await ensureRestoreRecovery();
  const request = buildRestoreBackupPackageRequest(
    packageName,
    currentProtectedState(),
  );
  const transition = await invokeTauriCommand<
    RestoreStateTransition | BackupPackageRestoreResult
  >(
    "backup_package_restore",
    request,
  );
  // The fallback is test-harness compatibility only; the registered production
  // command returns a RestoreStateTransition.
  if ("databaseRestored" in transition) return transition;
  const applied = applyTransition(transition);
  if (!applied.ok) {
    const rollback = await invokeTauriCommand<RestoreRollbackTransition>(
      "backup_package_restore_rollback",
      { operationId: transition.operationId },
    );
    const rollbackApplied = applyTransition(rollback.transition);
    if (rollbackApplied.ok) {
      await invokeTauriCommand("backup_restore_recovery_complete", {
        operationId: rollback.transition.operationId,
        mode: "rollback",
        appliedStateSha256: rollbackApplied.value.expectedStateSha256,
      });
    }
    throw {
      code: rollbackApplied.ok
        ? "protected_state_apply_failed"
        : "restore_rollback_failed",
      message: applied.message,
    };
  }
  try {
    return await invokeTauriCommand<BackupPackageRestoreResult>(
      "backup_package_restore_complete",
      {
        operationId: transition.operationId,
        appliedStateSha256: applied.value.expectedStateSha256,
      },
    );
  } catch (error) {
    const rollback = await invokeTauriCommand<RestoreRollbackTransition>(
      "backup_package_restore_rollback",
      { operationId: transition.operationId },
    );
    const rollbackApplied = applyTransition(rollback.transition);
    if (rollbackApplied.ok) {
      await invokeTauriCommand("backup_restore_recovery_complete", {
        operationId: rollback.transition.operationId,
        mode: "rollback",
        appliedStateSha256: rollbackApplied.value.expectedStateSha256,
      });
    }
    throw rollbackApplied.ok
      ? error
      : { code: "restore_rollback_failed", message: rollbackApplied.message };
  }
}

export async function rotateAutomaticBackupPackages(keepCount: number) {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupPackageRotationResult>(
    "backup_package_rotate_automatic",
    { keepCount },
  );
}

export async function openBackupFolder() {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupFolderOpenResult>("backup_folder_open");
}

export async function deleteBackupPackage(packageName: string) {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupPackageDeleteResult>(
    "backup_package_delete",
    { packageName },
  );
}

export async function exportBackupPackage(
  packageName: string,
  destinationRoot: string,
) {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupPackageExportResult>(
    "backup_package_export",
    { packageName, destinationRoot },
  );
}

export async function importSelectedBackupPackage() {
  await ensureRestoreRecovery();
  return invokeTauriCommand<BackupPackageImportResult>(
    "backup_package_import_selected",
  );
}

function currentProtectedState() {
  if (typeof window === "undefined") {
    throw new Error("Protected state is unavailable outside the application window.");
  }
  const exported = exportProtectedStateSnapshot(window.localStorage, {
    featureState: safeFilterFeatureState(),
  });
  if (!exported.ok) throw new Error(exported.message);
  const encoded = encodeProtectedStateSnapshot(exported.value);
  if (!encoded.ok) throw new Error(encoded.message);
  return encoded.value;
}

function applyTransition(transition: RestoreStateTransition) {
  const applied = applyProtectedStateSnapshot(
    window.localStorage,
    transition.protectedState,
    {
      expectedStateSha256: transition.expectedStateSha256,
      applyFeatureState: applySafeFilterFeatureState,
    },
  );
  if (applied.ok) {
    window.dispatchEvent(new Event("sakurava-protected-state-restored"));
  }
  return applied;
}

let restoreRecoveryPromise: Promise<void> | null = null;
let restoreRecoveryChecksEnabled = import.meta.env.MODE !== "test";

export function ensureRestoreRecovery() {
  if (!restoreRecoveryChecksEnabled || !isTauriRuntimeAvailable()) {
    return Promise.resolve();
  }
  if (restoreRecoveryPromise) return restoreRecoveryPromise;
  restoreRecoveryPromise = (async () => {
    const status = await invokeTauriCommand<RestoreRecoveryStatus>(
      "backup_restore_recovery_status",
    );
    if (!status.pending || !status.transition) return;
    const applied = applyTransition(status.transition);
    if (!applied.ok) {
      throw { code: applied.code, message: applied.message };
    }
    await invokeTauriCommand("backup_restore_recovery_complete", {
      operationId: status.transition.operationId,
      mode: status.transition.mode,
      appliedStateSha256: applied.value.expectedStateSha256,
    });
  })().catch((error) => {
    restoreRecoveryPromise = null;
    throw error;
  });
  return restoreRecoveryPromise;
}

export function setRestoreRecoveryChecksEnabledForTests(enabled: boolean) {
  restoreRecoveryChecksEnabled = enabled;
  restoreRecoveryPromise = null;
}

if (typeof window !== "undefined" && isTauriRuntimeAvailable()) {
  queueMicrotask(() => {
    void ensureRestoreRecovery().catch(() => {
      // The backend remains fail-closed and preserves the recovery journal.
    });
  });
}
