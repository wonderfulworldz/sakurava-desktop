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

  it("derives quality correctly for portrait orientation using long/short side", () => {
    // Portrait 1080x1920 should be FHD (long side 1920 >= 1920)
    expect(deriveQualityBucket({ resolution: "1080x1920" })).toBe("FHD");
    // Portrait 720x1280 should be HD (long side 1280 >= 1280)
    expect(deriveQualityBucket({ resolution: "720x1280" })).toBe("HD");
    // Portrait 2160x3840 should be 4K (long side 3840 >= 3840)
    expect(deriveQualityBucket({ resolution: "2160x3840" })).toBe("4K");
    // Portrait 1440x2560 should be 2K (long side 2560 >= 2560)
    expect(deriveQualityBucket({ resolution: "1440x2560" })).toBe("2K");
    // Portrait 4320x7680 should be 8K (long side 7680 >= 7680)
    expect(deriveQualityBucket({ resolution: "4320x7680" })).toBe("8K");
    // Portrait 480x640 should be SD (long side 640 < 1280)
    expect(deriveQualityBucket({ resolution: "480x640" })).toBe("SD");
  });

  it("derives quality for landscape orientation", () => {
    expect(deriveQualityBucket({ resolution: "1920x1080" })).toBe("FHD");
    expect(deriveQualityBucket({ resolution: "2560x1440" })).toBe("2K");
    expect(deriveQualityBucket({ resolution: "3840x2160" })).toBe("4K");
    expect(deriveQualityBucket({ resolution: "7680x4320" })).toBe("8K");
    expect(deriveQualityBucket({ resolution: "1280x720" })).toBe("HD");
    expect(deriveQualityBucket({ resolution: "640x480" })).toBe("SD");
  });

  it("derives debut year from saved performer debut fields without using birth date", () => {
    expect(deriveDebutYear({ debutDate: "2018-04-01" })).toBe(2018);
    expect(deriveDebutYear({ debutYear: 2020 })).toBe(2020);
    expect(deriveDebutYear({ yearsActive: "2015-present" })).toBe(2015);
    expect(deriveDebutYear({ birthDate: "1998-01-01" })).toBeNull();
  });
});
