import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRestoreBackupPackageRequest,
  createBackupPackage,
  deleteBackupPackage,
  exportBackupPackage,
  importSelectedBackupPackage,
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
      protectedState: expect.stringContaining('"format":"sakurava-protected-state"'),
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

  it("builds a deterministic Restore request from an explicit date", () => {
    const packageName = "sakurava-backup-20260706-120000-manual";
    const protectedState = '{"format":"sakurava-protected-state","version":1}';
    const date = new Date(2026, 6, 6, 12, 0, 0);

    const request = buildRestoreBackupPackageRequest(
      packageName,
      protectedState,
      date,
    );

    expect(request).toEqual({
      packageName,
      migrationYymm: "2607",
      currentProtectedState: protectedState,
    });
    expect(request).not.toHaveProperty("sourcePath");
    expect(
      buildRestoreBackupPackageRequest(packageName, protectedState, date),
    ).toEqual(request);
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
    tauriMocks.invoke
      .mockResolvedValueOnce({
        operationId: "a".repeat(64),
        mode: "restore",
        protectedState: JSON.stringify({
          format: "sakurava-protected-state",
          version: 1,
          appearance: { version: 1, values: {
            "sakurava.appearance.theme.v1": { present: false, raw: null },
            "sakurava.appearance.accent.v1": { present: false, raw: null },
            "sakurava.appearance.density.v1": { present: false, raw: null },
            "sakurava.appearance.uiScale.v1": { present: false, raw: null },
          } },
          automaticBackup: { version: 1, values: {
            "sakurava.backupRecovery.v1": { present: false, raw: null },
          } },
          catalogPreferences: { version: 1, values: {
            "sakurava.catalogPreferences.v1": { present: false, raw: null },
          } },
          catalogPagination: { version: 1, values: {} },
          mediaAssetScope: { version: 1, values: {
            "sakurava.mediaAssetRoots.v1": { present: false, raw: null },
          } },
          featureState: { version: 1, values: {} },
          translation: { version: 1, values: {
            "sakurava.language.selected.v1": { present: false, raw: null },
            "sakurava.customLanguages.v1": { present: false, raw: null },
            "sakurava.languageOverrides.v1": { present: false, raw: null },
            "sakurava.translationTransaction.v1": { present: false, raw: null },
          } },
        }),
        expectedStateSha256: "b".repeat(64),
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(result);

    await expect(
      restoreBackupPackage("sakurava-backup-20260706-120000-manual"),
    ).resolves.toEqual(result);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_restore", {
      packageName: "sakurava-backup-20260706-120000-manual",
      migrationYymm: expect.stringMatching(/^\d{4}$/),
      currentProtectedState: expect.stringContaining(
        '"format":"sakurava-protected-state"',
      ),
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "backup_package_restore_complete",
      { operationId: "a".repeat(64), appliedStateSha256: "b".repeat(64) },
    );
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

  it("deletes a backend-listed package by package name only", async () => {
    tauriMocks.invoke.mockResolvedValue({
      packageName: "sakurava-backup-20260706-120000-manual",
      deleted: true,
    });

    await deleteBackupPackage("sakurava-backup-20260706-120000-manual");

    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_delete", {
      packageName: "sakurava-backup-20260706-120000-manual",
    });
  });

  it("exports a package to the trusted folder-picker destination", async () => {
    tauriMocks.invoke.mockResolvedValue({
      packageName: "sakurava-backup-20260706-120000-manual",
      exported: true,
      exportedPath: "D:/Exports/sakurava-backup-20260706-120000-manual",
    });

    await exportBackupPackage(
      "sakurava-backup-20260706-120000-manual",
      "D:/Exports",
    );

    expect(tauriMocks.invoke).toHaveBeenCalledWith("backup_package_export", {
      packageName: "sakurava-backup-20260706-120000-manual",
      destinationRoot: "D:/Exports",
    });
  });

  it("imports a selected package through a backend-owned picker without path arguments", async () => {
    const result = {
      cancelled: false,
      imported: true,
      packageName: "imported-backup-manual",
    };
    tauriMocks.invoke.mockResolvedValue(result);

    await expect(importSelectedBackupPackage()).resolves.toEqual(result);

    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "backup_package_import_selected",
      undefined,
    );
    expect(tauriMocks.invoke).not.toHaveBeenCalledWith(
      "backup_package_restore",
      expect.anything(),
    );
  });

  it("returns a cancelled selected-package import safely", async () => {
    const result = { cancelled: true, imported: false, packageName: null };
    tauriMocks.invoke.mockResolvedValue(result);

    await expect(importSelectedBackupPackage()).resolves.toEqual(result);
  });
});
