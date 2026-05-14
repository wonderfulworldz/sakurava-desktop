import { describe, expect, it } from "vitest";
import {
  removeCategoryFromCategoriesJson,
  renameCategoryInCategoriesJson,
} from "./categoryRenameApply";

describe("category rename apply helper", () => {
  it("renames a category", () => {
    expect(
      renameCategoryInCategoriesJson('["Drama","Classic"]', "Drama", "Modern"),
    ).toEqual({
      changed: true,
      categoriesJson: '["Modern","Classic"]',
    });
  });

  it("matches source category case-insensitively", () => {
    expect(
      renameCategoryInCategoriesJson('["drama","Classic"]', "DRAMA", "Modern"),
    ).toEqual({
      changed: true,
      categoriesJson: '["Modern","Classic"]',
    });
  });

  it("trims category labels and target name", () => {
    expect(
      renameCategoryInCategoriesJson(
        '["  Drama  "," Classic "]',
        " drama ",
        " Modern ",
      ),
    ).toEqual({
      changed: true,
      categoriesJson: '["Modern","Classic"]',
    });
  });

  it("prevents duplicate categories inside a record", () => {
    expect(
      renameCategoryInCategoriesJson(
        '["Drama","Modern","classic","Classic"]',
        "Drama",
        "Modern",
      ),
    ).toEqual({
      changed: true,
      categoriesJson: '["Modern","classic"]',
    });
  });

  it("does not crash on invalid JSON", () => {
    expect(renameCategoryInCategoriesJson("{bad json", "Drama", "Modern")).toEqual({
      changed: false,
      categoriesJson: "{bad json",
    });
  });

  it("does not change records without the source category", () => {
    expect(
      renameCategoryInCategoriesJson('["Classic"]', "Drama", "Modern"),
    ).toEqual({
      changed: false,
      categoriesJson: '["Classic"]',
    });
  });
});

describe("category remove apply helper", () => {
  it("removes a category", () => {
    expect(removeCategoryFromCategoriesJson('["Drama","Classic"]', "Drama")).toEqual({
      changed: true,
      categoriesJson: '["Classic"]',
    });
  });

  it("matches source category case-insensitively", () => {
    expect(removeCategoryFromCategoriesJson('["drama","Classic"]', "DRAMA")).toEqual({
      changed: true,
      categoriesJson: '["Classic"]',
    });
  });

  it("trims labels and removes blank categories", () => {
    expect(
      removeCategoryFromCategoriesJson(
        '["  Drama  "," Classic ","  "]',
        " drama ",
      ),
    ).toEqual({
      changed: true,
      categoriesJson: '["Classic"]',
    });
  });

  it("preserves remaining category order", () => {
    expect(
      removeCategoryFromCategoriesJson(
        '["First","Drama","Second","Third"]',
        "Drama",
      ),
    ).toEqual({
      changed: true,
      categoriesJson: '["First","Second","Third"]',
    });
  });

  it("does not crash on invalid JSON", () => {
    expect(removeCategoryFromCategoriesJson("{bad json", "Drama")).toEqual({
      changed: false,
      categoriesJson: "{bad json",
    });
  });

  it("does not change records without the source category", () => {
    expect(removeCategoryFromCategoriesJson('["Classic"]', "Drama")).toEqual({
      changed: false,
      categoriesJson: '["Classic"]',
    });
  });

  it("returns an empty array when the only category is removed", () => {
    expect(removeCategoryFromCategoriesJson('["Drama"]', "Drama")).toEqual({
      changed: true,
      categoriesJson: "[]",
    });
  });
});
