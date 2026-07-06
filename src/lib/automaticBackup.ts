import {
  createBackupPackage,
  type BackupPackageInfo,
} from "../runtime/databaseCommands";

export const BACKUP_RECOVERY_STORAGE_KEY = "sakurava.backupRecovery.v1";
export const AUTOMATIC_BACKUP_SETTINGS_EVENT =
  "sakurava:automatic-backup-settings-changed";
export const AUTOMATIC_BACKUP_RESULT_EVENT =
  "sakurava:automatic-backup-result";
export const AUTOMATIC_BACKUP_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export type AutomaticBackupFrequency = "daily" | "weekly" | "monthly";

export type BackupRecoverySettings = {
  version: 1;
  automaticBackup: {
    enabled: boolean;
    frequency: AutomaticBackupFrequency;
    lastSuccessfulAutomaticBackupAt: string | null;
    lastAutomaticBackupPackageName: string | null;
  };
};

export type AutomaticBackupResultDetail =
  | { state: "pending" }
  | { state: "success"; packageInfo: BackupPackageInfo; completedAt: string }
  | { state: "error"; message: string };

const frequencyMilliseconds: Record<AutomaticBackupFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

let automaticBackupPending = false;
let backupUiOperationPending = false;

export function defaultBackupRecoverySettings(): BackupRecoverySettings {
  return {
    version: 1,
    automaticBackup: {
      enabled: false,
      frequency: "daily",
      lastSuccessfulAutomaticBackupAt: null,
      lastAutomaticBackupPackageName: null,
    },
  };
}

function isFrequency(value: unknown): value is AutomaticBackupFrequency {
  return value === "daily" || value === "weekly" || value === "monthly";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function loadBackupRecoverySettings(): BackupRecoverySettings {
  if (typeof window === "undefined") {
    return defaultBackupRecoverySettings();
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(BACKUP_RECOVERY_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    if (!parsed || parsed.version !== 1) {
      return defaultBackupRecoverySettings();
    }
    const automaticBackup = parsed.automaticBackup as
      | Record<string, unknown>
      | null
      | undefined;
    if (!automaticBackup) {
      return defaultBackupRecoverySettings();
    }
    return {
      version: 1,
      automaticBackup: {
        enabled: automaticBackup.enabled === true,
        frequency: isFrequency(automaticBackup.frequency)
          ? automaticBackup.frequency
          : "daily",
        lastSuccessfulAutomaticBackupAt: optionalString(
          automaticBackup.lastSuccessfulAutomaticBackupAt,
        ),
        lastAutomaticBackupPackageName: optionalString(
          automaticBackup.lastAutomaticBackupPackageName,
        ),
      },
    };
  } catch {
    return defaultBackupRecoverySettings();
  }
}

export function saveBackupRecoverySettings(settings: BackupRecoverySettings) {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(settings),
    );
    return true;
  } catch {
    return false;
  }
}

export function updateAutomaticBackupSettings(
  patch: Partial<BackupRecoverySettings["automaticBackup"]>,
) {
  const current = loadBackupRecoverySettings();
  const next: BackupRecoverySettings = {
    version: 1,
    automaticBackup: {
      ...current.automaticBackup,
      ...patch,
    },
  };
  saveBackupRecoverySettings(next);
  window.dispatchEvent(new Event(AUTOMATIC_BACKUP_SETTINGS_EVENT));
  return next;
}

export function isAutomaticBackupDue(
  settings: BackupRecoverySettings,
  now: Date = new Date(),
) {
  if (!settings.automaticBackup.enabled) {
    return false;
  }
  const lastSuccessfulAt =
    settings.automaticBackup.lastSuccessfulAutomaticBackupAt;
  if (!lastSuccessfulAt) {
    return true;
  }
  const lastTimestamp = Date.parse(lastSuccessfulAt);
  if (!Number.isFinite(lastTimestamp)) {
    return true;
  }
  return (
    now.getTime() - lastTimestamp >=
    frequencyMilliseconds[settings.automaticBackup.frequency]
  );
}

export function setBackupUiOperationPending(pending: boolean) {
  backupUiOperationPending = pending;
}

export async function runAutomaticBackupIfDue(now: Date = new Date()) {
  const settings = loadBackupRecoverySettings();
  if (
    automaticBackupPending ||
    backupUiOperationPending ||
    !isAutomaticBackupDue(settings, now)
  ) {
    return null;
  }

  automaticBackupPending = true;
  try {
    window.dispatchEvent(
      new CustomEvent<AutomaticBackupResultDetail>(
        AUTOMATIC_BACKUP_RESULT_EVENT,
        { detail: { state: "pending" } },
      ),
    );
    const packageInfo = await createBackupPackage("automatic");
    const completedAt = now.toISOString();
    saveBackupRecoverySettings({
      version: 1,
      automaticBackup: {
        ...settings.automaticBackup,
        lastSuccessfulAutomaticBackupAt: completedAt,
        lastAutomaticBackupPackageName: packageInfo.packageName,
      },
    });
    const detail: AutomaticBackupResultDetail = {
      state: "success",
      packageInfo,
      completedAt,
    };
    window.dispatchEvent(
      new CustomEvent(AUTOMATIC_BACKUP_RESULT_EVENT, { detail }),
    );
    return packageInfo;
  } catch (error) {
    const detail: AutomaticBackupResultDetail = {
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    window.dispatchEvent(
      new CustomEvent(AUTOMATIC_BACKUP_RESULT_EVENT, { detail }),
    );
    return null;
  } finally {
    automaticBackupPending = false;
  }
}

export function resetAutomaticBackupRuntimeStateForTests() {
  automaticBackupPending = false;
  backupUiOperationPending = false;
}
