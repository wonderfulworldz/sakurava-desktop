import {
  defaultAliasesJson,
  defaultCategoriesJson,
  defaultGalleryImagePathsJson,
  defaultPerformerThumbnailPathsJson,
  defaultRelatedCatalogRecordsJson,
  defaultRelatedPerformersJson,
  defaultRatingJson,
  normalizeRatingJson,
  parseGalleryImagePathArray,
  parsePerformerThumbnailPathArray,
  parseRelatedCatalogRecordArray,
  parseRelatedPerformerArray,
  parseRatingObject,
  parseTextLabelArray,
  stringifyTextLabelArray,
} from "./json";
import {
  normalizeImageDefaults,
  normalizePerformerDefaults,
  normalizeVideoDefaults,
  validateImageInput,
  validatePerformerInput,
  validateVideoInput,
} from "./validation";
import type { NewImage, NewPerformer, NewVideo } from "./types";

const baseVideo = {
  title: " Sample Video ",
  originalTitle: "",
  code: "",
  censorship: "",
  availability: "",
  releaseDate: "",
  durationMinutes: null,
  resolution: "",
  fileSizeBytes: null,
  fileType: "",
  publisherLabel: "",
  coverPath: "",
  mediaPath: "",
  categoriesJson: "",
  relatedPerformersJson: "",
  relatedImagesJson: "",
  ratingJson: "",
  notes: "",
  favorite: false,
} satisfies NewVideo;

const baseImage = {
  title: " Sample Image ",
  originalTitle: "",
  code: "",
  censorship: "",
  availability: "",
  releaseDate: "",
  publisherLabel: "",
  coverPath: "",
  folderPath: "",
  imageCount: null,
  mainResolution: "",
  totalFileSizeBytes: null,
  mainFileType: "",
  galleryImagePathsJson: "",
  categoriesJson: "",
  relatedPerformersJson: "",
  relatedVideosJson: "",
  ratingJson: "",
  notes: "",
  favorite: false,
} satisfies NewImage;

const basePerformer = {
  name: " Sample Performer ",
  originalName: "",
  aliasesJson: "",
  status: "",
  debutDate: "",
  retiredDate: "",
  birthDate: "",
  birthplace: "",
  nationality: "",
  bloodType: "",
  heightCm: null,
  weightKg: null,
  measurements: "",
  cupSize: "",
  coverPath: "",
  performerThumbnailPathsJson: "",
  filmographyCount: null,
  pictorialsCount: null,
  relatedVideosJson: "",
  relatedImagesJson: "",
  categoriesJson: "",
  ratingJson: "",
  notes: "",
  favorite: false,
} satisfies NewPerformer;

describe("JSON helpers", () => {
  it("parses text label arrays safely", () => {
    expect(parseTextLabelArray('["Favorite","Classic",12,null]')).toEqual([
      "Favorite",
      "Classic",
    ]);
    expect(parseTextLabelArray("{bad json")).toEqual([]);
    expect(parseTextLabelArray('{"not":"array"}')).toEqual([]);
  });

  it("stringifies trimmed text labels", () => {
    expect(stringifyTextLabelArray([" Favorite ", "", "Classic"])).toBe(
      '["Favorite","Classic"]',
    );
  });

  it("normalizes empty or invalid JSON defaults", () => {
    expect(defaultCategoriesJson()).toBe("[]");
    expect(defaultAliasesJson("{bad json")).toBe("[]");
    expect(defaultPerformerThumbnailPathsJson("{bad json")).toBe("[]");
    expect(defaultGalleryImagePathsJson("{bad json")).toBe("[]");
    expect(defaultRelatedPerformersJson("{bad json")).toBe("[]");
    expect(defaultRelatedCatalogRecordsJson("{bad json")).toBe("[]");
    expect(defaultRatingJson("[1,2,3]")).toBe("{}");
    expect(normalizeRatingJson('{"visual":5}')).toBe('{"visual":5}');
    expect(parseRatingObject("{bad json")).toEqual({});
  });

  it("normalizes performer thumbnail paths safely", () => {
    const json =
      '[" C:/thumb-1.jpg ","","C:/thumb-2.jpg","C:/thumb-1.jpg",7,"C:/thumb-3.jpg","C:/thumb-4.jpg","C:/thumb-5.jpg"]';

    expect(parsePerformerThumbnailPathArray(json)).toEqual([
      "C:/thumb-1.jpg",
      "C:/thumb-2.jpg",
      "C:/thumb-3.jpg",
      "C:/thumb-4.jpg",
    ]);
    expect(defaultPerformerThumbnailPathsJson(json)).toBe(
      '["C:/thumb-1.jpg","C:/thumb-2.jpg","C:/thumb-3.jpg","C:/thumb-4.jpg"]',
    );
  });

  it("normalizes gallery image paths safely", () => {
    const json =
      '[" C:/gallery/one.jpg ","","C:/gallery/two.jpg","C:/gallery/one.jpg",7]';

    expect(parseGalleryImagePathArray(json)).toEqual([
      "C:/gallery/one.jpg",
      "C:/gallery/two.jpg",
    ]);
    expect(defaultGalleryImagePathsJson(json)).toBe(
      '["C:/gallery/one.jpg","C:/gallery/two.jpg"]',
    );
  });

  it("normalizes related performer references safely", () => {
    const json =
      '[{"performerId":" performer-1 ","nameSnapshot":" Performer One "},{"performerId":"performer-1","nameSnapshot":"Duplicate"},{"performerId":"","nameSnapshot":"Legacy Name"},{"performerId":7,"nameSnapshot":""},"bad"]';

    expect(parseRelatedPerformerArray(json)).toEqual([
      { performerId: "performer-1", nameSnapshot: "Performer One" },
      { performerId: "", nameSnapshot: "Legacy Name" },
    ]);
    expect(defaultRelatedPerformersJson(json)).toBe(
      '[{"performerId":"performer-1","nameSnapshot":"Performer One"},{"performerId":"","nameSnapshot":"Legacy Name"}]',
    );
  });

  it("normalizes related catalog record references safely", () => {
    const json =
      '[{"recordId":" image-1 ","titleSnapshot":" Image One "},{"recordId":"image-1","titleSnapshot":"Duplicate"},{"recordId":"","titleSnapshot":"Legacy Title"},{"recordId":7,"titleSnapshot":""},"bad"]';

    expect(parseRelatedCatalogRecordArray(json)).toEqual([
      { recordId: "image-1", titleSnapshot: "Image One" },
      { recordId: "", titleSnapshot: "Legacy Title" },
    ]);
    expect(defaultRelatedCatalogRecordsJson(json)).toBe(
      '[{"recordId":"image-1","titleSnapshot":"Image One"},{"recordId":"","titleSnapshot":"Legacy Title"}]',
    );
  });
});

describe("validation helpers", () => {
  it("requires video title and validates duration", () => {
    expect(validateVideoInput({ ...baseVideo, title: "  " })).toEqual({
      valid: false,
      errors: [{ field: "title", message: "title is required." }],
    });

    expect(
      validateVideoInput({ ...baseVideo, durationMinutes: 120.5 }).errors,
    ).toContainEqual({
      field: "durationMinutes",
      message: "durationMinutes must be an integer when provided.",
    });

    expect(validateVideoInput({ ...baseVideo, durationMinutes: 120 }).valid).toBe(
      true,
    );
  });

  it("requires image title and validates image count", () => {
    expect(validateImageInput({ ...baseImage, title: "" }).valid).toBe(false);
    expect(validateImageInput({ ...baseImage, imageCount: 24 }).valid).toBe(true);
    expect(validateImageInput({ ...baseImage, imageCount: 24.25 }).errors).toContainEqual(
      {
        field: "imageCount",
        message: "imageCount must be an integer when provided.",
      },
    );
  });

  it("requires performer name and validates count fields", () => {
    expect(validatePerformerInput({ ...basePerformer, name: "" }).valid).toBe(
      false,
    );
    expect(
      validatePerformerInput({
        ...basePerformer,
        filmographyCount: 1.5,
        pictorialsCount: 2.25,
        heightCm: 160.5,
        weightKg: 47.25,
      }).errors,
    ).toEqual([
      {
        field: "filmographyCount",
        message: "filmographyCount must be an integer when provided.",
      },
      {
        field: "pictorialsCount",
        message: "pictorialsCount must be an integer when provided.",
      },
      {
        field: "heightCm",
        message: "heightCm must be an integer when provided.",
      },
      {
        field: "weightKg",
        message: "weightKg must be an integer when provided.",
      },
    ]);
  });
});

describe("default normalization", () => {
  it("normalizes video defaults without converting categories to ids", () => {
    expect(
      normalizeVideoDefaults({
        ...baseVideo,
        categoriesJson: '["Favorite","High Replay"]',
        relatedPerformersJson:
          '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
        relatedImagesJson:
          '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
        ratingJson: '{"rewatch":3}',
      }),
    ).toMatchObject({
      title: "Sample Video",
      categoriesJson: '["Favorite","High Replay"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      relatedImagesJson:
        '[{"recordId":"image-1","titleSnapshot":"Image One"}]',
      ratingJson: '{"rewatch":3}',
      favorite: false,
    });
  });

  it("normalizes image defaults", () => {
    expect(
      normalizeImageDefaults({
        ...baseImage,
        categoriesJson: "{bad json",
        galleryImagePathsJson:
          '[" C:/gallery/one.jpg ","","C:/gallery/two.jpg","C:/gallery/one.jpg",7]',
        relatedPerformersJson: "{bad json",
        relatedVideosJson: "{bad json",
        ratingJson: "",
      }),
    ).toMatchObject({
      title: "Sample Image",
      categoriesJson: "[]",
      galleryImagePathsJson:
        '["C:/gallery/one.jpg","C:/gallery/two.jpg"]',
      relatedPerformersJson: "[]",
      relatedVideosJson: "[]",
      ratingJson: "{}",
      imageCount: null,
    });
  });

  it("normalizes performer aliases, categories, rating, and counts", () => {
    expect(
      normalizePerformerDefaults({
        ...basePerformer,
        aliasesJson: '["Alias A","Alias B"]',
        performerThumbnailPathsJson:
          '[" C:/thumb-1.jpg ","","C:/thumb-2.jpg","C:/thumb-1.jpg","C:/thumb-3.jpg","C:/thumb-4.jpg","C:/thumb-5.jpg"]',
        categoriesJson: '["Classic"]',
        ratingJson: "{bad json",
      }),
    ).toMatchObject({
      name: "Sample Performer",
      aliasesJson: '["Alias A","Alias B"]',
      performerThumbnailPathsJson:
        '["C:/thumb-1.jpg","C:/thumb-2.jpg","C:/thumb-3.jpg","C:/thumb-4.jpg"]',
      categoriesJson: '["Classic"]',
      ratingJson: "{}",
      filmographyCount: null,
      pictorialsCount: null,
      relatedVideosJson: "[]",
      relatedImagesJson: "[]",
      heightCm: null,
      weightKg: null,
    });
  });
});
