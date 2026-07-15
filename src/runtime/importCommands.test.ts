import { afterEach, describe, expect, it, vi } from "vitest";
import { readImportCatalogFile } from "./importCommands";

describe("catalog import runtime wrapper", () => {
  afterEach(() => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  it("reads trusted CSV/XLSX bytes through the catalog command", async () => {
    const invoke = vi.fn().mockResolvedValue({
      sourcePath: "D:/Imports/catalog.xlsx",
      displayName: "catalog.xlsx",
      format: "xlsx",
      bytes: [80, 75],
      bytesRead: 2,
      success: true,
    });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    await expect(readImportCatalogFile("D:/Imports/catalog.xlsx"))
      .resolves.toMatchObject({ format: "xlsx", bytes: [80, 75] });
    expect(invoke).toHaveBeenCalledWith(
      "import_catalog_file_read",
      { sourcePath: "D:/Imports/catalog.xlsx" },
      undefined,
    );
  });
});
