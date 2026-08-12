import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

import { getManagedMediaProgressStatus } from "./managedMediaStatus";

describe("managed media progress bridge", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    window.__TAURI_INTERNALS__ = { invoke: tauriMocks.invoke };
  });

  it("reads the bounded source-level progress contract", async () => {
    tauriMocks.invoke.mockResolvedValue({ ready: 3, total: 5, processing: true });

    await expect(getManagedMediaProgressStatus()).resolves.toEqual({
      ready: 3,
      total: 5,
      processing: true,
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "managed_media_progress_get",
      undefined,
    );
  });

  it("rejects misleading or malformed counts", async () => {
    tauriMocks.invoke.mockResolvedValue({ ready: 6, total: 5, processing: true });
    await expect(getManagedMediaProgressStatus()).rejects.toThrow(
      "Managed media progress status is invalid.",
    );
  });
});
