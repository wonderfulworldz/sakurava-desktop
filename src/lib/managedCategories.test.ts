import { beforeEach, describe, expect, it } from "vitest";
import {
  addStoredManagedCategory,
  getStoredManagedCategories,
  MANAGED_CATEGORIES_STORAGE_KEY,
  renameStoredManagedCategory,
  validateManagedCategoryRename,
} from "./managedCategories";

describe("managed category storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds a trimmed managed category", () => {
    const result = addStoredManagedCategory("  Drama  ");

    expect(result).toEqual({
      state: "success",
      message: 'Added category "Drama".',
      categories: ["Drama"],
    });
    expect(getStoredManagedCategories()).toEqual(["Drama"]);
  });

  it("rejects blank and duplicate categories case-insensitively", () => {
    expect(addStoredManagedCategory(" ")).toMatchObject({
      state: "error",
      message: "Enter a category name.",
    });

    addStoredManagedCategory("Drama");

    expect(addStoredManagedCategory(" drama ")).toMatchObject({
      state: "error",
      message: "That category already exists.",
      categories: ["Drama"],
    });
  });

  it("does not crash on corrupt localStorage", () => {
    window.localStorage.setItem(MANAGED_CATEGORIES_STORAGE_KEY, "{bad json");

    expect(getStoredManagedCategories()).toEqual([]);
    expect(addStoredManagedCategory("Classic")).toMatchObject({
      state: "success",
      categories: ["Classic"],
    });
  });

  it("renames a managed category", () => {
    window.localStorage.setItem(
      MANAGED_CATEGORIES_STORAGE_KEY,
      '["Drama","Classic"]',
    );

    const result = renameStoredManagedCategory("Drama", " Modern Drama ");

    expect(result).toEqual({
      state: "success",
      message:
        'Renamed managed category "Drama" to "Modern Drama". Existing record categories were not changed.',
      categories: ["Modern Drama", "Classic"],
    });
    expect(getStoredManagedCategories()).toEqual(["Modern Drama", "Classic"]);
  });

  it("preserves managed category order when renaming", () => {
    window.localStorage.setItem(
      MANAGED_CATEGORIES_STORAGE_KEY,
      '["Drama","Classic","Portrait"]',
    );

    expect(renameStoredManagedCategory("Classic", "Archive")).toMatchObject({
      state: "success",
      categories: ["Drama", "Archive", "Portrait"],
    });
  });

  it("rejects blank managed category rename targets", () => {
    expect(renameStoredManagedCategory("Drama", " ", ["Drama"])).toMatchObject({
      state: "error",
      message: "Enter a new category name.",
      categories: ["Drama"],
    });
  });

  it("rejects duplicate managed category rename targets case-insensitively", () => {
    expect(
      renameStoredManagedCategory("Drama", "classic", ["Drama", "Classic"]),
    ).toMatchObject({
      state: "error",
      message: "That category name already exists.",
      categories: ["Drama", "Classic"],
    });
  });

  it("rejects managed category rename targets with the same name", () => {
    expect(renameStoredManagedCategory("Drama", " drama ", ["Drama"])).toMatchObject({
      state: "error",
      message: "Choose a different category name.",
      categories: ["Drama"],
    });
  });

  it("does not crash renaming with corrupt localStorage", () => {
    window.localStorage.setItem(MANAGED_CATEGORIES_STORAGE_KEY, "{bad json");

    expect(renameStoredManagedCategory("Drama", "Classic")).toMatchObject({
      state: "error",
      message: "Managed category could not be found.",
      categories: [],
    });
  });

  it("validates managed category rename input", () => {
    const categories = ["Drama", "Classic"];

    expect(validateManagedCategoryRename("Drama", " ", categories)).toEqual({
      state: "invalid",
      message: "Enter a new category name.",
    });
    expect(validateManagedCategoryRename("Drama", " drama ", categories)).toEqual({
      state: "invalid",
      message: "Choose a different category name.",
    });
    expect(validateManagedCategoryRename("Drama", "CLASSIC", categories)).toEqual({
      state: "invalid",
      message: "That category name already exists.",
    });
    expect(validateManagedCategoryRename("Drama", "New Drama", categories)).toEqual({
      state: "valid",
      message: "Ready to rename this managed category only.",
    });
  });
});
