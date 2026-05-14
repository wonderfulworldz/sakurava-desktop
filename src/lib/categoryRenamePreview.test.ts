import { describe, expect, it } from "vitest";
import {
  buildCategoryDeletePreview,
  buildCategoryRenamePreview,
} from "./categoryRenamePreview";

describe("category rename record preview", () => {
  it("counts affected records and examples case-insensitively", () => {
    const preview = buildCategoryRenamePreview(" drama ", {
      videos: [
        { title: "Video One", categoriesJson: '["Drama"]' },
        { title: "Video Two", categoriesJson: '["drama", "Classic"]' },
      ],
      images: [{ title: "Image One", categoriesJson: '["DRAMA"]' }],
      performers: [{ name: "Performer One", categoriesJson: '["Drama"]' }],
    });

    expect(preview).toEqual({
      videos: 2,
      images: 1,
      performers: 1,
      total: 4,
      examples: [
        { kind: "Video", label: "Video One" },
        { kind: "Video", label: "Video Two" },
        { kind: "Image", label: "Image One" },
        { kind: "Performer", label: "Performer One" },
      ],
    });
  });

  it("ignores invalid categoriesJson and limits examples", () => {
    const preview = buildCategoryRenamePreview(
      "Drama",
      {
        videos: Array.from({ length: 9 }, (_, index) => ({
          title: `Video ${index + 1}`,
          categoriesJson: index === 8 ? "{bad json" : '["Drama"]',
        })),
        images: [],
        performers: [],
      },
      3,
    );

    expect(preview.videos).toBe(8);
    expect(preview.total).toBe(8);
    expect(preview.examples).toHaveLength(3);
  });
});

describe("category delete record preview", () => {
  it("counts affected records and ignores invalid categoriesJson", () => {
    const preview = buildCategoryDeletePreview("classic", {
      videos: [{ title: "Classic Video", categoriesJson: '["Classic"]' }],
      images: [
        { title: "Classic Image", categoriesJson: '[" CLASSIC "]' },
        { title: "Invalid Image", categoriesJson: "{bad json" },
      ],
      performers: [{ name: "Classic Performer", categoriesJson: '["classic"]' }],
    });

    expect(preview.videos).toBe(1);
    expect(preview.images).toBe(1);
    expect(preview.performers).toBe(1);
    expect(preview.total).toBe(3);
    expect(preview.examples).toEqual([
      { kind: "Video", label: "Classic Video" },
      { kind: "Image", label: "Classic Image" },
      { kind: "Performer", label: "Classic Performer" },
    ]);
  });
});
