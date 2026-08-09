import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../runtime/tauriClient", () => ({
  invokeTauriCommand: vi.fn(),
  isTauriRuntimeAvailable: vi.fn(),
}));

import { listImages, getImageVisible } from "../runtime/imageCommands";
import { listPerformers, getPerformerVisible } from "../runtime/performerCommands";
import { invokeTauriCommand } from "../runtime/tauriClient";
import { getVideoVisible, listVideos } from "../runtime/videoCommands";
import { SAFE_FILTER_STORAGE_KEY } from "./safeFilterState";

const invoke = vi.mocked(invokeTauriCommand);

describe("Safe Filter catalog command projection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invoke.mockReset();
  });

  it("uses visible catalog and detail commands while Safe Filter is ON", async () => {
    invoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce({ state: "hidden", record: null });

    await Promise.all([listVideos(), listImages(), listPerformers()]);
    await expect(getVideoVisible("video-hidden")).resolves.toEqual({ state: "hidden", record: null });

    expect(invoke).toHaveBeenNthCalledWith(1, "video_list_visible");
    expect(invoke).toHaveBeenNthCalledWith(2, "image_list_visible");
    expect(invoke).toHaveBeenNthCalledWith(3, "performer_list_visible");
    expect(invoke).toHaveBeenNthCalledWith(4, "video_get_visible", { id: "video-hidden" });
  });

  it("uses complete commands only when the user has explicitly turned Safe Filter OFF", async () => {
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "false");
    invoke.mockResolvedValueOnce([]).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await listVideos();
    await expect(getImageVisible("image-missing")).resolves.toEqual({ state: "missing", record: null });
    await expect(getPerformerVisible("performer-missing")).resolves.toEqual({ state: "missing", record: null });

    expect(invoke).toHaveBeenNthCalledWith(1, "video_list");
    expect(invoke).toHaveBeenNthCalledWith(2, "image_get", { id: "image-missing" });
    expect(invoke).toHaveBeenNthCalledWith(3, "performer_get", { id: "performer-missing" });
  });
});
