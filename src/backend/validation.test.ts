import {
  defaultAliasesJson,
  defaultCategoriesJson,
  defaultRatingJson,
  normalizeRatingJson,
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
    expect(defaultRatingJson("[1,2,3]")).toBe("{}");
    expect(normalizeRatingJson('{"visual":5}')).toBe('{"visual":5}');
    expect(parseRatingObject("{bad json")).toEqual({});
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
        ratingJson: '{"rewatch":3}',
      }),
    ).toMatchObject({
      title: "Sample Video",
      categoriesJson: '["Favorite","High Replay"]',
      ratingJson: '{"rewatch":3}',
      favorite: false,
    });
  });

  it("normalizes image defaults", () => {
    expect(
      normalizeImageDefaults({
        ...baseImage,
        categoriesJson: "{bad json",
        ratingJson: "",
      }),
    ).toMatchObject({
      title: "Sample Image",
      categoriesJson: "[]",
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
