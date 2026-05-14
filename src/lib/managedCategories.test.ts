import { beforeEach, describe, expect, it } from "vitest";
import {
  addStoredManagedCategory,
  getStoredManagedCategories,
  MANAGED_CATEGORIES_STORAGE_KEY,
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

  it("validates planned managed category rename input", () => {
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
      message: "Rename application is planned and not active in this batch.",
    });
  });
});
