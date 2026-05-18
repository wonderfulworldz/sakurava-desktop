import { describe, expect, it } from "vitest";
import {
  deriveDebutYear,
  deriveQualityBucket,
  deriveReleaseYear,
} from "./catalogDerivedFields";

describe("catalogDerivedFields", () => {
  it("derives release year from saved release date text", () => {
    expect(deriveReleaseYear("2026-05-11")).toBe(2026);
    expect(deriveReleaseYear("")).toBeNull();
    expect(deriveReleaseYear("not-a-date")).toBeNull();
  });

  it("derives quality from saved quality or resolution fields", () => {
    expect(deriveQualityBucket({ quality: "4K" })).toBe("4K");
    expect(deriveQualityBucket({ resolution: "1920x1080" })).toBe("FHD");
    expect(deriveQualityBucket({ mainResolution: "1280x720" })).toBe("HD");
    expect(deriveQualityBucket({ width: 3840, height: 2160 })).toBe("4K");
    expect(deriveQualityBucket({ width: 640, height: 480 })).toBe("SD");
    expect(deriveQualityBucket({ resolution: "Not detected" })).toBeNull();
  });

  it("derives debut year from saved performer debut fields without using birth date", () => {
    expect(deriveDebutYear({ debutDate: "2018-04-01" })).toBe(2018);
    expect(deriveDebutYear({ debutYear: 2020 })).toBe(2020);
    expect(deriveDebutYear({ yearsActive: "2015-present" })).toBe(2015);
    expect(deriveDebutYear({ birthDate: "1998-01-01" })).toBeNull();
  });
});
