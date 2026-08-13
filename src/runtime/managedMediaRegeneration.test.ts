import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
}));

import { regenerateMissingOrOutdatedManagedMedia } from "./managedMediaRegeneration";

describe("managed media regeneration bridge", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    window.__TAURI_INTERNALS__ = { invoke: tauriMocks.invoke };
  });

  it("requests the bounded missing/outdated regeneration command", async () => {
    tauriMocks.invoke.mockResolvedValue({ queuedCount: 2, alreadyActiveCount: 1 });

    await expect(regenerateMissingOrOutdatedManagedMedia()).resolves.toEqual({
      queuedCount: 2,
      alreadyActiveCount: 1,
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "managed_media_regenerate_missing_or_outdated",
      undefined,
    );
  });

  it("rejects malformed queue results", async () => {
    tauriMocks.invoke.mockResolvedValue({ queuedCount: -1, alreadyActiveCount: 0 });

    await expect(regenerateMissingOrOutdatedManagedMedia()).rejects.toThrow(
      "Managed media regeneration result is invalid.",
    );
  });
});
