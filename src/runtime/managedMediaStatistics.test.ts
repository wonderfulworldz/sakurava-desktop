import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

import { getManagedMediaStatistics } from "./managedMediaStatistics";

describe("managed media statistics bridge", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    window.__TAURI_INTERNALS__ = { invoke: tauriMocks.invoke };
  });

  it("reads the bounded source, storage, and pending contract", async () => {
    tauriMocks.invoke.mockResolvedValue({
      readyCount: 3,
      sourceCount: 5,
      pendingCount: 1,
      publishedStorageBytes: 4096,
    });

    await expect(getManagedMediaStatistics()).resolves.toEqual({
      readyCount: 3,
      sourceCount: 5,
      pendingCount: 1,
      publishedStorageBytes: 4096,
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "managed_media_statistics_get",
      undefined,
    );
  });

  it("rejects malformed statistics", async () => {
    tauriMocks.invoke.mockResolvedValue({
      readyCount: 3,
      sourceCount: 2,
      pendingCount: 0,
      publishedStorageBytes: 0,
    });

    await expect(getManagedMediaStatistics()).rejects.toThrow(
      "Managed media statistics are invalid.",
    );
  });
});
