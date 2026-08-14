import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("./tauriClient", () => ({ invokeTauriCommand: invokeMock }));

import {
  executeManagedMediaRemoval,
  previewManagedMediaRemoval,
} from "./managedMediaRemoval";

describe("managed-media removal bridge", () => {
  beforeEach(() => invokeMock.mockReset());

  it("uses separate preview and stale-token execute commands", async () => {
    invokeMock.mockResolvedValueOnce({ previewToken: "token" });
    await previewManagedMediaRemoval();
    expect(invokeMock).toHaveBeenLastCalledWith("managed_media_removal_preview");

    invokeMock.mockResolvedValueOnce({ removedVariantCount: 2 });
    await executeManagedMediaRemoval("token");
    expect(invokeMock).toHaveBeenLastCalledWith(
      "managed_media_removal_execute",
      { request: { previewToken: "token" } },
    );
  });
});
