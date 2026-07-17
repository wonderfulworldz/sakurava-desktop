import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));

import {
  applySakuravaRefMigration,
  getSakuravaRefMigrationStatus,
  requireMigratedSakuravaRefs,
} from "./sakuravaRefCommands";

describe("Sakurava Ref migration runtime wrappers", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    (globalThis as any).__TAURI_INTERNALS__ = { invoke: tauriMocks.invoke };
  });

  afterEach(() => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  it("reads preflight status without accepting a frontend database path", async () => {
    tauriMocks.invoke.mockResolvedValue({ state: "legacy", required: true });
    await getSakuravaRefMigrationStatus();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("sakurava_ref_migration_get_status", undefined);
  });

  it("allows Ref-dependent work only for an authoritatively migrated catalog", async () => {
    tauriMocks.invoke.mockResolvedValue({ state: "migrated", required: false });
    await expect(requireMigratedSakuravaRefs()).resolves.toMatchObject({ state: "migrated" });
  });

  it.each([
    ["legacy", "must be upgraded"],
    ["invalid", "need recovery"],
  ] as const)("fails closed for %s migration state", async (state, message) => {
    tauriMocks.invoke.mockResolvedValue({ state, required: state === "legacy" });
    await expect(requireMigratedSakuravaRefs()).rejects.toThrow(message);
  });

  it("passes one deterministic local issuance month to the trusted migration command", async () => {
    tauriMocks.invoke.mockResolvedValue({ migrated: true });
    await applySakuravaRefMigration(new Date(2026, 6, 17, 8));
    expect(tauriMocks.invoke).toHaveBeenCalledWith("sakurava_ref_migration_apply", {
      migrationYymm: "2607",
    });
  });
});
