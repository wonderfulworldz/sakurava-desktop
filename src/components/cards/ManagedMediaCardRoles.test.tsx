import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { primaryVisualDescriptorRequest, resolveManagedMediaDescriptors } = vi.hoisted(() => ({
  primaryVisualDescriptorRequest: vi.fn((request: Record<string, unknown>) => request),
  resolveManagedMediaDescriptors: vi.fn(async (requests: Array<Record<string, unknown>>) =>
    new Map(
      requests.map((request) => [
        request.requestId,
        {
          requestId: request.requestId,
          selectedSourceClass: "managed_standard",
          assetPath: "C:/managed/thumb.png",
          placeholder: false,
        },
      ]),
    ),
  ),
}));

vi.mock("../../runtime/managedMediaDescriptors", () => ({
  descriptorAssetPath: (descriptor: { assetPath?: string; placeholder?: boolean } | undefined) =>
    descriptor?.placeholder ? undefined : descriptor?.assetPath,
  primaryVisualDescriptorRequest,
  resolveManagedMediaDescriptors,
}));

import type { HomeRecentItem } from "../../lib/homeData";
import { ImageLiteCard } from "./ImageLiteCard";
import { PerformerLiteCard } from "./PerformerLiteCard";
import { VideoLiteCard } from "./VideoLiteCard";

const items: Record<"video" | "image" | "performer", HomeRecentItem> = {
  video: { kind: "videos", key: "video-1", title: "Video", detail: "", typeLabel: "Video", coverPath: "C:/source/video.png", favorite: false },
  image: { kind: "images", key: "image-1", title: "Image", detail: "", typeLabel: "Image", coverPath: "C:/source/image.png", favorite: false },
  performer: { kind: "performers", key: "performer-1", title: "Performer", detail: "", typeLabel: "Performer", coverPath: "C:/source/performer.png", favorite: false },
};

function wrap(ui: React.ReactElement) {
  return render(ui, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
}

describe("managed media lite and related card roles", () => {
  beforeEach(() => {
    primaryVisualDescriptorRequest.mockClear();
    resolveManagedMediaDescriptors.mockClear();
  });

  it.each([
    ["video_lite_card", <VideoLiteCard item={items.video} linkTo="/videos/video-1" />],
    ["image_lite_card", <ImageLiteCard item={items.image} linkTo="/images/image-1" />],
    ["performer_lite_card", <PerformerLiteCard item={items.performer} linkTo="/performers/performer-1" />],
  ])("requests the existing %s role for compact routed cards", async (roleId, card) => {
    wrap(card);
    await waitFor(() => expect(primaryVisualDescriptorRequest).toHaveBeenCalled());
    expect(primaryVisualDescriptorRequest).toHaveBeenCalledWith(
      expect.objectContaining({ roleId }),
    );
  });

  it.each([
    ["related_video_active", <VideoLiteCard item={items.video} linkTo="/videos/video-1" managedRoleId="related_video_active" />],
    ["related_image_active", <ImageLiteCard item={items.image} linkTo="/images/image-1" managedRoleId="related_image_active" />],
    ["related_performer_active", <PerformerLiteCard item={items.performer} linkTo="/performers/performer-1" managedRoleId="related_performer_active" />],
  ])("requests the existing %s role for related routed cards", async (roleId, card) => {
    wrap(card);
    await waitFor(() => expect(primaryVisualDescriptorRequest).toHaveBeenCalled());
    expect(primaryVisualDescriptorRequest).toHaveBeenCalledWith(
      expect.objectContaining({ roleId }),
    );
  });
});
