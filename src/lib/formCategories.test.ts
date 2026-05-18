import {
  addFormCategory,
  normalizeFormCategories,
  removeFormCategory,
} from "./formCategories";

describe("form category helpers", () => {
  it("trims labels, removes blanks, dedupes case-insensitively, and preserves first order", () => {
    expect(
      normalizeFormCategories([" Classic ", "", "Drama", "classic", "DRAMA"]),
    ).toEqual(["Classic", "Drama"]);
  });

  it("adds a category only when it is not already selected", () => {
    expect(addFormCategory(["Classic"], " Updated ")).toEqual([
      "Classic",
      "Updated",
    ]);
    expect(addFormCategory(["Classic"], "classic")).toEqual(["Classic"]);
  });

  it("removes a category case-insensitively", () => {
    expect(removeFormCategory(["Classic", "Updated"], " classic ")).toEqual([
      "Updated",
    ]);
  });
});
