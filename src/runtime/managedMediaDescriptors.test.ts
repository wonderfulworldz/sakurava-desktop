import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("./tauriClient", () => ({
  invokeTauriCommand: (...args: unknown[]) => invoke(...args),
  isTauriRuntimeAvailable: () => true,
}));

import {
  primaryVisualDescriptorRequest,
  resolveManagedMediaDescriptors,
} from "./managedMediaDescriptors";

describe("managed media descriptor adapter", () => {
  it("uses one batch command for duplicate collection descriptor needs", async () => {
    invoke.mockResolvedValue([
      {
        requestId: "video-1:a",
        selectedSourceClass: "original",
        assetPath: "C:/media/one.jpg",
        family: null,
        tier: null,
        width: null,
        height: null,
        mediaKind: "image",
        originalAvailable: true,
        managedAvailable: false,
        fallbackReason: "current_original",
        staleLastValid: false,
        placeholder: false,
        revision: "r1",
      },
    ]);
    const request = primaryVisualDescriptorRequest({
      requestId: "video-1:a",
      ownerKind: "video",
      ownerId: "video-1",
      sourcePath: "C:/media/one.jpg",
      roleId: "video_collection_full_card",
      cssWidth: 320,
      cssHeight: 180,
    });
    const duplicate = { ...request, requestId: "video-1:b" };

    const result = await resolveManagedMediaDescriptors([request, duplicate]);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("managed_media_descriptor_resolve_batch");
    expect(invoke.mock.calls[0][1]).toEqual({ requests: [request] });
    expect(result.get("video-1:b")?.assetPath).toBe("C:/media/one.jpg");
  });

  it("fails closed when a managed descriptor response has no path", async () => {
    invoke.mockResolvedValue([
      {
        requestId: "video-1:a",
        selectedSourceClass: "managed_standard",
        assetPath: null,
        family: "LANDSCAPE_16_9",
        tier: "THUMBNAIL",
        width: 320,
        height: 180,
        mediaKind: "image",
        originalAvailable: true,
        managedAvailable: true,
        fallbackReason: "current_managed",
        staleLastValid: false,
        placeholder: false,
        revision: "r1",
      },
    ]);
    const request = primaryVisualDescriptorRequest({
      requestId: "video-1:a",
      ownerKind: "video",
      ownerId: "video-1",
      sourcePath: "C:/media/one.jpg",
      roleId: "video_collection_full_card",
      cssWidth: 320,
      cssHeight: 180,
    });

    const result = await resolveManagedMediaDescriptors([request]);

    expect(result.get(request.requestId)?.placeholder).toBe(true);
  });
});
