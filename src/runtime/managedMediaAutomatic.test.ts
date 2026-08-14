import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));

import { synchronizeAutomaticMiniImagesPolicy } from "./managedMediaAutomatic";

describe("Automatic Mini Images bridge", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    window.__TAURI_INTERNALS__ = { invoke: tauriMocks.invoke };
  });

  it("synchronizes the resolved persistent policy to the Tauri runtime", async () => {
    tauriMocks.invoke.mockResolvedValue(undefined);
    await synchronizeAutomaticMiniImagesPolicy(false);
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "managed_media_automatic_actions_sync",
      { enabled: false },
    );
  });
});
