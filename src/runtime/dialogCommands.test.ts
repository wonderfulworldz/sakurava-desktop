import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import {
  defaultDatabaseBackupFileName,
  selectCatalogCsvExportFolder,
  selectCatalogExportDestination,
  selectImportCatalogSource,
  selectLanguageCsvImportSource,
  selectTranslationRecoveryJsonDestination,
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

  it("keeps the Translation CSV source dialog contract", async () => {
    const open = vi.fn().mockResolvedValue("D:/Languages/custom.csv");
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ open }));
    await expect(selectLanguageCsvImportSource()).resolves.toBe("D:/Languages/custom.csv");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      title: "Import Sakurava Language CSV",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    }));
  });

  it("selects a Translation-specific JSON recovery destination", async () => {
    const save = vi.fn().mockResolvedValue("D:/Recovery/translation.json");
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ save }));
    await expect(selectTranslationRecoveryJsonDestination())
      .resolves.toBe("D:/Recovery/translation.json");
    expect(save).toHaveBeenCalledWith({
      title: "Export Translation Recovery Evidence",
      defaultPath: "sakurava-translation-recovery.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
  });

  it("represents Translation recovery destination cancellation accurately", async () => {
    const save = vi.fn().mockResolvedValue(null);
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
    vi.doMock("@tauri-apps/plugin-dialog", () => ({ save }));
    await expect(selectTranslationRecoveryJsonDestination()).resolves.toBeNull();
  });
});
