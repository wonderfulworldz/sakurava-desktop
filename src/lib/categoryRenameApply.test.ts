import { describe, expect, it } from "vitest";
import { renameCategoryInCategoriesJson } from "./categoryRenameApply";

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
