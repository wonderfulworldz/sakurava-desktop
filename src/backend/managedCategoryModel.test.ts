import {
  countManagedCategoryUsage,
  defaultManagedCategoryVisibility,
  normalizeManagedCategoryInput,
} from "./managedCategoryModel";

describe("Managed Category Credits scope", () => {
  it("defaults showInCredits to false without changing existing scope defaults", () => {
    expect(defaultManagedCategoryVisibility).toEqual({
      showInVideos: true,
      showInImages: true,
      showInPerformers: true,
      showInCredits: false,
    });
    expect(normalizeManagedCategoryInput({ name: "Voice" })).toEqual(
      expect.objectContaining({
        showInVideos: true,
        showInImages: true,
        showInPerformers: true,
        showInCredits: false,
      }),
    );
  });

  it("counts taxonomy key fields and ignores characterName", () => {
    const records = {
      videos: [],
      images: [],
      performers: [],
      credits: [
        {
          creditTypeCategoryId: "cat-voice",
          roleImportanceCategoryId: null,
          characterName: "cat-character",
        },
        {
          creditTypeCategoryId: null,
          roleImportanceCategoryId: "cat-main",
          characterName: "Voice",
        },
      ],
    };

    expect(countManagedCategoryUsage("Voice", records, "cat-voice").credits).toBe(1);
    expect(countManagedCategoryUsage("Main", records, "cat-main").credits).toBe(1);
    expect(
      countManagedCategoryUsage("Character", records, "cat-character").credits,
    ).toBe(0);
  });
});
