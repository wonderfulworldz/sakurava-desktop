import { describe, expect, it } from "vitest";
import { buildCategoryAudit } from "./categoryAudit";

describe("buildCategoryAudit", () => {
  it("aggregates trimmed categories case-insensitively by catalog kind", () => {
    const audit = buildCategoryAudit({
      videos: [
        { categoriesJson: '["Action", " favorite ", "ACTION"]' },
        { categoriesJson: '["Favorite"]' },
      ],
      images: [{ categoriesJson: '["favorite", "Portrait"]' }],
      performers: [{ categoriesJson: '["Featured", "portrait"]' }],
    });

    expect(audit).toEqual({
      totalUnique: 4,
      videoCategories: 2,
      imageCategories: 2,
      performerCategories: 2,
      rows: [
        { name: "Action", videos: 1, images: 0, performers: 0, total: 1 },
        { name: "favorite", videos: 2, images: 1, performers: 0, total: 3 },
        { name: "Featured", videos: 0, images: 0, performers: 1, total: 1 },
        { name: "Portrait", videos: 0, images: 1, performers: 1, total: 2 },
      ],
    });
  });

  it("ignores invalid JSON, non-array JSON, blank labels, and non-string values", () => {
    const audit = buildCategoryAudit({
      videos: [
        { categoriesJson: null },
        { categoriesJson: "" },
        { categoriesJson: "{bad json" },
        { categoriesJson: '{"not":"array"}' },
        { categoriesJson: '["", "  ", 7, null, "Drama"]' },
      ],
      images: [],
      performers: [],
    });

    expect(audit.rows).toEqual([
      { name: "Drama", videos: 1, images: 0, performers: 0, total: 1 },
    ]);
    expect(audit.totalUnique).toBe(1);
  });
});
