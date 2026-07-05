import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBackupPackage,
  listBackupPackages,
  openBackupFolder,
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
