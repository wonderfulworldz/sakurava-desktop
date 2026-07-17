import { afterEach, describe, expect, it, vi } from "vitest";
import { applyImportCatalogPlan, readImportCatalogFile } from "./importCommands";
import { operationFingerprint } from "../lib/importExportContract";
import { importPlanFingerprintPayload } from "../lib/importOperationPlan";

describe("catalog import runtime wrapper", () => {
  afterEach(() => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  it("sends the immutable operation plan to one atomic runtime command", async () => {
    const invoke = vi.fn().mockResolvedValue({ transactionStatus: "committed" });
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const plan: any = {
      contractVersion: 3,
      issuanceYymm: "2607",
      sourceFingerprint: "skvf1-00000000",
      operationFingerprint: "",
      catalogSnapshot: { videos: [], images: [], performers: [], categories: [], glossary: [], credits: [] },
      skippedCount: 0,
      operations: [],
    };
    plan.operationFingerprint = operationFingerprint(importPlanFingerprintPayload(plan));
    await applyImportCatalogPlan(plan);
    expect(invoke).toHaveBeenCalledWith("import_catalog_apply", { plan }, undefined);
  });

  it("rejects an invalid structural plan before invoking Rust", async () => {
    const invoke = vi.fn();
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const plan = { skippedCount: -25, operations: [] } as any;

    await expect(applyImportCatalogPlan(plan)).rejects.toMatchObject({
      name: "ImportPlanContractError",
      field: "skippedCount",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects a plan mutated after Preview before invoking Rust", async () => {
    const invoke = vi.fn();
    (globalThis as any).__TAURI_INTERNALS__ = { invoke };
    const plan: any = {
      contractVersion: 3,
      issuanceYymm: "2607",
      sourceFingerprint: "skvf1-00000000",
      operationFingerprint: "",
      catalogSnapshot: { videos: [], images: [], performers: [], categories: [], glossary: [], credits: [] },
      skippedCount: 0,
      operations: [],
    };
    plan.operationFingerprint = operationFingerprint(importPlanFingerprintPayload(plan));
    plan.skippedCount = 1;

    await expect(applyImportCatalogPlan(plan)).rejects.toMatchObject({
      name: "ImportPlanContractError",
      field: "operationFingerprint",
    });
    expect(invoke).not.toHaveBeenCalled();
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
