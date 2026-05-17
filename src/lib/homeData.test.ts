import { describe, expect, it } from "vitest";
import type {
  Image as ImageRecord,
  Performer,
  Video as VideoRecord,
} from "../backend/types";
import { buildLastEdited, buildRecentlyAdded } from "./homeData";

type TimestampOverrides<T> = Omit<Partial<T>, "createdAt" | "updatedAt"> & {
  createdAt?: number | string;
  updatedAt?: number | string;
};

describe("homeData", () => {
  it("sorts Continue Cataloging by Tauri millisecond updatedAt values and limits to 3", () => {
    const lastEdited = buildLastEdited({
      videos: [
        video({ id: "video-1", title: "Video 1", updatedAt: "1778611701000" }),
        video({ id: "video-2", title: "Video 2", updatedAt: "1778611702000" }),
        video({ id: "video-3", title: "Video 3", updatedAt: "1778611703000" }),
      ],
      images: [
        image({ id: "image-1", title: "Image 1", updatedAt: "1778611705000" }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "Performer 1",
          updatedAt: "1778611704000",
        }),
      ],
    });

    expect(lastEdited.map((item) => item.title)).toEqual([
      "Image 1",
      "Performer 1",
      "Video 3",
    ]);
    expect(lastEdited).toHaveLength(3);
  });

  it("sorts Recently Added by Tauri millisecond createdAt values across all record types", () => {
    const recentlyAdded = buildRecentlyAdded({
      videos: [
        video({ id: "video-1", title: "Video 1", createdAt: "1778611701000" }),
        video({ id: "video-2", title: "Video 2", createdAt: "1778611702000" }),
      ],
      images: [
        image({ id: "image-1", title: "Image 1", createdAt: "1778611704000" }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "Performer 1",
          createdAt: "1778611703000",
        }),
      ],
    });

    expect(recentlyAdded.map((item) => item.title)).toEqual([
      "Image 1",
      "Performer 1",
      "Video 2",
      "Video 1",
    ]);
  });

  it("continues to sort ISO timestamp strings correctly", () => {
    const lastEdited = buildLastEdited({
      videos: [
        video({
          id: "video-1",
          title: "ISO Video",
          updatedAt: "2026-05-17T10:00:00.000Z",
        }),
      ],
      images: [
        image({
          id: "image-1",
          title: "ISO Image",
          updatedAt: "2026-05-17T12:00:00.000Z",
        }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "ISO Performer",
          updatedAt: "2026-05-17T11:00:00.000Z",
        }),
      ],
    });

    const recentlyAdded = buildRecentlyAdded({
      videos: [
        video({
          id: "video-1",
          title: "ISO Video",
          createdAt: "2026-05-17T10:00:00.000Z",
        }),
      ],
      images: [
        image({
          id: "image-1",
          title: "ISO Image",
          createdAt: "2026-05-17T12:00:00.000Z",
        }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "ISO Performer",
          createdAt: "2026-05-17T11:00:00.000Z",
        }),
      ],
    });

    expect(lastEdited.map((item) => item.title)).toEqual([
      "ISO Image",
      "ISO Performer",
      "ISO Video",
    ]);
    expect(recentlyAdded.map((item) => item.title)).toEqual([
      "ISO Image",
      "ISO Performer",
      "ISO Video",
    ]);
  });

  it("accepts finite numeric timestamp values", () => {
    const lastEdited = buildLastEdited({
      videos: [
        video({ id: "video-1", title: "Numeric Video", updatedAt: 1778611701000 }),
      ],
      images: [
        image({ id: "image-1", title: "Numeric Image", updatedAt: 1778611703000 }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "Numeric Performer",
          updatedAt: 1778611702000,
        }),
      ],
    });

    expect(lastEdited.map((item) => item.title)).toEqual([
      "Numeric Image",
      "Numeric Performer",
      "Numeric Video",
    ]);
  });

  it("does not force type diversity when newest records are all videos", () => {
    const lastEdited = buildLastEdited({
      videos: [
        video({ id: "video-1", title: "Newest Video 1", updatedAt: "1778611706000" }),
        video({ id: "video-2", title: "Newest Video 2", updatedAt: "1778611705000" }),
        video({ id: "video-3", title: "Newest Video 3", updatedAt: "1778611704000" }),
      ],
      images: [
        image({ id: "image-1", title: "Older Image", updatedAt: "1778611703000" }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "Older Performer",
          updatedAt: "1778611702000",
        }),
      ],
    });
    const recentlyAdded = buildRecentlyAdded({
      videos: [
        video({ id: "video-1", title: "Newest Video 1", createdAt: "1778611706000" }),
        video({ id: "video-2", title: "Newest Video 2", createdAt: "1778611705000" }),
        video({ id: "video-3", title: "Newest Video 3", createdAt: "1778611704000" }),
        video({ id: "video-4", title: "Newest Video 4", createdAt: "1778611703000" }),
      ],
      images: [
        image({ id: "image-1", title: "Older Image", createdAt: "1778611702000" }),
      ],
      performers: [
        performer({
          id: "performer-1",
          name: "Older Performer",
          createdAt: "1778611701000",
        }),
      ],
    });

    expect(lastEdited.map((item) => item.typeLabel)).toEqual([
      "Video",
      "Video",
      "Video",
    ]);
    expect(recentlyAdded.map((item) => item.typeLabel)).toEqual([
      "Video",
      "Video",
      "Video",
      "Video",
    ]);
  });
});

function video(overrides: TimestampOverrides<VideoRecord> = {}): VideoRecord {
  return {
    id: "video",
    title: "Video",
    originalTitle: "",
    code: "",
    censorship: "",
    availability: "",
    releaseDate: "",
    durationMinutes: null,
    publisherLabel: "",
    coverPath: "",
    mediaPath: "",
    categoriesJson: "[]",
    relatedPerformersJson: "[]",
    relatedImagesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "0",
    updatedAt: "0",
    ...overrides,
  } as VideoRecord;
}

function image(overrides: TimestampOverrides<ImageRecord> = {}): ImageRecord {
  return {
    id: "image",
    title: "Image",
    originalTitle: "",
    code: "",
    censorship: "",
    availability: "",
    releaseDate: "",
    publisherLabel: "",
    coverPath: "",
    folderPath: "",
    imageCount: null,
    galleryImagePathsJson: "[]",
    categoriesJson: "[]",
    relatedPerformersJson: "[]",
    relatedVideosJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "0",
    updatedAt: "0",
    ...overrides,
  } as ImageRecord;
}

function performer(overrides: TimestampOverrides<Performer> = {}): Performer {
  return {
    id: "performer",
    name: "Performer",
    originalName: "",
    aliasesJson: "[]",
    status: "",
    birthDate: "",
    coverPath: "",
    performerThumbnailPathsJson: "[]",
    filmographyCount: null,
    pictorialsCount: null,
    categoriesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "0",
    updatedAt: "0",
    ...overrides,
  } as Performer;
}
