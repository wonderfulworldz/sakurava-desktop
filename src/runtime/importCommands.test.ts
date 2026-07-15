import { afterEach, describe, expect, it, vi } from "vitest";
import { applyImportCatalogPlan, readImportCatalogFile } from "./importCommands";

describe("catalog import runtime wrapper", () => {
  afterEach(() => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  it("sends the immutable operation plan to one atomic runtime command", async () => {
    const invoke = vi.fn().mockResolvedValue({ transactionStatus: "committed" });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const plan = { contractVersion: 1, operationFingerprint: "skv1-test", operations: [] } as any;
    await applyImportCatalogPlan(plan);
    expect(invoke).toHaveBeenCalledWith("import_catalog_apply", { plan }, undefined);
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
