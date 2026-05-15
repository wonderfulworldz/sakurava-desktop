import {
  defaultAliasesJson,
  defaultCategoriesJson,
  defaultRelatedPerformersJson,
  defaultRatingJson,
  normalizeRatingJson,
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
  publisherLabel: "",
  coverPath: "",
  mediaPath: "",
  categoriesJson: "",
  relatedPerformersJson: "",
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
  categoriesJson: "",
  relatedPerformersJson: "",
  ratingJson: "",
  notes: "",
  favorite: false,
} satisfies NewImage;

const basePerformer = {
  name: " Sample Performer ",
  originalName: "",
  aliasesJson: "",
  status: "",
  birthDate: "",
  coverPath: "",
  filmographyCount: null,
  pictorialsCount: null,
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
    expect(defaultRelatedPerformersJson("{bad json")).toBe("[]");
    expect(defaultRatingJson("[1,2,3]")).toBe("{}");
    expect(normalizeRatingJson('{"visual":5}')).toBe('{"visual":5}');
    expect(parseRatingObject("{bad json")).toEqual({});
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
        ratingJson: '{"rewatch":3}',
      }),
    ).toMatchObject({
      title: "Sample Video",
      categoriesJson: '["Favorite","High Replay"]',
      relatedPerformersJson:
        '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
      ratingJson: '{"rewatch":3}',
      favorite: false,
    });
  });

  it("normalizes image defaults", () => {
    expect(
      normalizeImageDefaults({
        ...baseImage,
        categoriesJson: "{bad json",
        relatedPerformersJson: "{bad json",
        ratingJson: "",
      }),
    ).toMatchObject({
      title: "Sample Image",
      categoriesJson: "[]",
      relatedPerformersJson: "[]",
      ratingJson: "{}",
      imageCount: null,
    });
  });

  it("normalizes performer aliases, categories, rating, and counts", () => {
    expect(
      normalizePerformerDefaults({
        ...basePerformer,
        aliasesJson: '["Alias A","Alias B"]',
        categoriesJson: '["Classic"]',
        ratingJson: "{bad json",
      }),
    ).toMatchObject({
      name: "Sample Performer",
      aliasesJson: '["Alias A","Alias B"]',
      categoriesJson: '["Classic"]',
      ratingJson: "{}",
      filmographyCount: null,
      pictorialsCount: null,
    });
  });
});
