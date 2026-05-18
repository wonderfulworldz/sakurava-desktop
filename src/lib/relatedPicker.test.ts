import {
  catalogRecordChipLabel,
  catalogRecordLabel,
  catalogRecordSearchText,
  compactPerformerLabel,
  performerSearchText,
} from "./relatedPicker";
import type { Image, Performer, Video } from "../backend/types";

describe("related picker helpers", () => {
  it("formats performer aliases compactly", () => {
    expect(compactPerformerLabel(performer({ aliasesJson: "[]" }))).toBe(
      "Aoi Sakura",
    );
    expect(compactPerformerLabel(performer({ aliasesJson: '["Sakura Aoi"]' })))
      .toBe("Aoi Sakura - Sakura Aoi");
    expect(
      compactPerformerLabel(
        performer({ aliasesJson: '["Sakura Aoi","Aoi","Hanami"]' }),
      ),
    ).toBe("Aoi Sakura - Sakura Aoi, +2 more");
  });

  it("matches performer search text by name, original name, and aliases", () => {
    const searchText = performerSearchText(
      performer({
        name: "Aoi Sakura",
        originalName: "Hanami Aoi",
        aliasesJson: '["Sakura Aoi","Cherry"]',
      }),
    );

    expect(searchText).toContain("aoi sakura");
    expect(searchText).toContain("hanami aoi");
    expect(searchText).toContain("cherry");
  });

  it("formats and searches catalog records by code and title fields", () => {
    const video = catalogVideo({
      code: "VID-123",
      title: "Spring Feature",
      originalTitle: "Original Spring",
    });
    const image = catalogImage({
      code: "IMG-001",
      title: "Hanami Gallery",
      originalTitle: "Spring Set",
    });

    expect(catalogRecordLabel(video)).toBe("VID-123 - Spring Feature");
    expect(catalogRecordLabel(image)).toBe("IMG-001 - Hanami Gallery");
    expect(catalogRecordChipLabel(video)).toBe("VID-123");
    expect(catalogRecordChipLabel(catalogVideo({ code: "", title: "No Code" })))
      .toBe("No Code");
    expect(catalogRecordSearchText(video)).toContain("vid-123");
    expect(catalogRecordSearchText(image)).toContain("spring set");
  });
});

function performer(overrides: Partial<Performer> = {}): Performer {
  return {
    id: "performer_aoi",
    name: "Aoi Sakura",
    originalName: "",
    aliasesJson: "[]",
    status: "Active",
    birthDate: "",
    coverPath: "",
    performerThumbnailPathsJson: "[]",
    filmographyCount: null,
    pictorialsCount: null,
    categoriesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides,
  };
}

function catalogVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "video_spring",
    title: "Spring Feature",
    originalTitle: "",
    code: "VID-001",
    censorship: "Censored",
    availability: "Owned",
    releaseDate: "",
    durationMinutes: null,
    publisherLabel: "",
    coverPath: "",
    mediaPath: "",
    relatedPerformersJson: "[]",
    relatedImagesJson: "[]",
    categoriesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides,
  };
}

function catalogImage(overrides: Partial<Image> = {}): Image {
  return {
    id: "image_hanami",
    title: "Hanami Gallery",
    originalTitle: "",
    code: "IMG-001",
    censorship: "Censored",
    availability: "Owned",
    releaseDate: "",
    publisherLabel: "",
    coverPath: "",
    folderPath: "",
    imageCount: null,
    galleryImagePathsJson: "[]",
    relatedPerformersJson: "[]",
    relatedVideosJson: "[]",
    categoriesJson: "[]",
    ratingJson: "{}",
    notes: "",
    favorite: false,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides,
  };
}
