import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBackupPackage,
  listBackupPackages,
  openBackupFolder,
  previewBackupPackage,
  restoreBackupPackage,
  rotateAutomaticBackupPackages,
} from "./databaseCommands";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

describe("backup package runtime wrappers", () => {
  beforeEach(() => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    tauriMocks.invoke.mockReset();
  });

  it("creates a package without accepting a frontend destination path", async () => {
    tauriMocks.invoke.mockResolvedValue({ packagePath: "C:/App/backups/package" });

    await createBackupPackage("manual", "My note");

    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_create", {
      backupType: "manual",
      note: "My note",
    });
  });

  it("lists and rotates automatic packages through scoped commands", async () => {
    tauriMocks.invoke.mockResolvedValue([]);
    await listBackupPackages();
    expect(tauriMocks.invoke).toHaveBeenLastCalledWith(
      "backup_package_list",
      undefined,
    );

    tauriMocks.invoke.mockResolvedValue({
      keptAutomatic: 3,
      removedAutomatic: 1,
      removedPaths: [],
    });
    await rotateAutomaticBackupPackages(3);
    expect(tauriMocks.invoke).toHaveBeenLastCalledWith(
      "backup_package_rotate_automatic",
      { keepCount: 3 },
    );
  });

  it("previews a backend-listed package by name without passing a filesystem path", async () => {
    const preview = {
      packageName: "sakurava-backup-20260706-120000-manual",
      database: {
        quickCheck: "ok",
        requiredSchemaPresent: true,
        counts: {
          videos: 1,
          images: 2,
          performers: 3,
          categories: 4,
          glossary: 5,
          credits: 6,
        },
      },
      warnings: [],
      errors: [],
    };
    tauriMocks.invoke.mockResolvedValue(preview);

    await expect(
      previewBackupPackage("sakurava-backup-20260706-120000-manual"),
    ).resolves.toEqual(preview);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_preview", {
      packageName: "sakurava-backup-20260706-120000-manual",
    });
  });

  it("restores a package by name only and returns the structured result", async () => {
    const result = {
      restoredPackageName: "sakurava-backup-20260706-120000-manual",
      safetyPackageName: "sakurava-backup-20260706-130000-safety",
      restoredAt: "2026-07-06T13:00:01Z",
      databaseRestored: true,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      warnings: [],
      errors: [],
    };
    tauriMocks.invoke.mockResolvedValue(result);

    await expect(
      restoreBackupPackage("sakurava-backup-20260706-120000-manual"),
    ).resolves.toEqual(result);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_restore", {
      packageName: "sakurava-backup-20260706-120000-manual",
    });
  });

  it("propagates typed package restore errors", async () => {
    const error = {
      code: "required_schema_missing",
      message: "Backup database is missing required table: credits",
      restoredPackageName: "broken-package",
      safetyPackageName: null,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      warnings: [],
      errors: ["Backup database is missing required table: credits"],
    };
    tauriMocks.invoke.mockRejectedValue(error);

    await expect(restoreBackupPackage("broken-package")).rejects.toEqual(error);
  });

  it("opens only the backend-resolved backup folder without a path argument", async () => {
    tauriMocks.invoke.mockResolvedValue({
      folderPath: "C:/App/backups",
      opened: true,
    });

    await openBackupFolder();

    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "backup_folder_open",
      undefined,
    );
  });
});
