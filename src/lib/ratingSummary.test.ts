import { describe, expect, it } from "vitest";
import {
  calculateAverageRating,
  createRatingSummary,
  getRatingBucket,
  getRatingDimensions,
  normalizeRatingScore,
  parseRatingJson,
} from "./ratingSummary";

describe("ratingSummary", () => {
  it("parses object-style ratingJson", () => {
    expect(parseRatingJson('{"visual":4,"story":3}')).toEqual({
      visual: 4,
      story: 3,
    });
  });

  it("ignores invalid, malformed, and out-of-range values", () => {
    const dimensions = getRatingDimensions(
      '{"visual":4,"bad":"5","low":0,"high":6,"":3}',
      [{ name: "visual", label: "Visual" }],
    );

    expect(dimensions).toEqual([
      { key: "visual", label: "Visual", value: 4 },
    ]);
  });

  it("rejects scores outside the valid 1 to 5 range", () => {
    expect(normalizeRatingScore(0)).toBeNull();
    expect(normalizeRatingScore(6)).toBeNull();
    expect(normalizeRatingScore("4")).toBeNull();
    expect(normalizeRatingScore(4)).toBe(4);
  });

  it("calculates average/final score from valid dimensions", () => {
    expect(
      calculateAverageRating([
        { value: 4 },
        { value: 5 },
        { value: 3 },
      ]),
    ).toBe(4);
  });

  it("maps floor buckets for future catalog filtering", () => {
    expect(getRatingBucket(4.2)).toBe(4);
    expect(getRatingBucket(4.9)).toBe(4);
    expect(getRatingBucket(5)).toBe(5);
  });

  it("returns an honest no-rating state for empty or invalid ratingJson", () => {
    expect(createRatingSummary("{}")).toMatchObject({
      dimensions: [],
      average: null,
      displayScore: null,
      bucket: null,
      isRated: false,
    });
    expect(createRatingSummary("{invalid")).toMatchObject({
      dimensions: [],
      average: null,
      displayScore: null,
      bucket: null,
      isRated: false,
    });
  });

  it("formats unknown rating keys defensively", () => {
    expect(getRatingDimensions('{"story_score":4}')).toEqual([
      { key: "story_score", label: "Story Score", value: 4 },
    ]);
  });
});
