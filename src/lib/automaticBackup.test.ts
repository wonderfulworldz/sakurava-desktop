import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_RECOVERY_STORAGE_KEY,
  defaultBackupRecoverySettings,
  isAutomaticBackupDue,
  loadBackupRecoverySettings,
  updateAutomaticBackupSettings,
} from "./automaticBackup";

describe("automatic backup settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads safe defaults for missing, invalid, and unsupported storage", () => {
    expect(loadBackupRecoverySettings()).toEqual(defaultBackupRecoverySettings());

    window.localStorage.setItem(BACKUP_RECOVERY_STORAGE_KEY, "{invalid");
    expect(loadBackupRecoverySettings()).toEqual(defaultBackupRecoverySettings());

    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify({ version: 2, automaticBackup: { enabled: true } }),
    );
    expect(loadBackupRecoverySettings()).toEqual(defaultBackupRecoverySettings());
  });

  it("normalizes an invalid frequency and persists toggle/frequency changes", () => {
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        automaticBackup: { enabled: true, frequency: "hourly" },
      }),
    );
    expect(loadBackupRecoverySettings().automaticBackup.frequency).toBe("daily");

    updateAutomaticBackupSettings({ enabled: true, frequency: "weekly" });
    expect(loadBackupRecoverySettings().automaticBackup).toMatchObject({
      enabled: true,
      frequency: "weekly",
    });
  });

  it.each([
    ["daily", 24],
    ["weekly", 7 * 24],
    ["monthly", 30 * 24],
  ] as const)("calculates %s due boundaries", (frequency, hours) => {
    const now = new Date("2026-07-06T12:00:00.000Z");
    const settings = defaultBackupRecoverySettings();
    settings.automaticBackup.enabled = true;
    settings.automaticBackup.frequency = frequency;
    settings.automaticBackup.lastSuccessfulAutomaticBackupAt = new Date(
      now.getTime() - hours * 60 * 60 * 1000,
    ).toISOString();

    expect(isAutomaticBackupDue(settings, now)).toBe(true);
    settings.automaticBackup.lastSuccessfulAutomaticBackupAt = new Date(
      now.getTime() - hours * 60 * 60 * 1000 + 1,
    ).toISOString();
    expect(isAutomaticBackupDue(settings, now)).toBe(false);
  });

  it("does not become due while disabled", () => {
    const settings = defaultBackupRecoverySettings();
    expect(isAutomaticBackupDue(settings, new Date())).toBe(false);
  });

  it("does not crash when localStorage writes fail", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("quota");
      });
    expect(() => updateAutomaticBackupSettings({ enabled: true })).not.toThrow();
    setItem.mockRestore();
  });
});
