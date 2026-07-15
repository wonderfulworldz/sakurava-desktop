import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import {
  defaultDatabaseBackupFileName,
  selectCatalogCsvExportFolder,
  selectCatalogExportDestination,
  selectImportCatalogSource,
} from "./dialogCommands";

describe("dialog command filenames", () => {
  it("uses the skv local timestamp pattern for database backup defaults", () => {
    expect(defaultDatabaseBackupFileName(new Date(2026, 4, 20, 14, 30, 12)))
      .toBe("skv-backup-20262005-143012.sqlite");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  it("returns cancellation safely for the catalog save picker", async () => {
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue(null) }));
    await expect(selectCatalogExportDestination(["videos"], "xlsx"))
      .resolves.toBeNull();
  });

  it("returns cancellation safely for the multi-CSV folder picker", async () => {
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue(null) }));
    await expect(selectCatalogCsvExportFolder()).resolves.toBeNull();
  });

  it("offers trusted CSV and XLSX catalog import filters", async () => {
    const open = vi.fn().mockResolvedValue("D:/Imports/catalog.xlsx");
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ open }));
    await expect(selectImportCatalogSource()).resolves.toBe("D:/Imports/catalog.xlsx");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.arrayContaining([
        { name: "Sakurava Catalog", extensions: ["xlsx", "csv"] },
      ]),
    }));
  });
});
