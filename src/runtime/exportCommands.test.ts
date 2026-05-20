import { describe, expect, it } from "vitest";
import { defaultExportCsvFileName, localFileTimestamp } from "./exportCommands";

describe("export command filenames", () => {
  it("uses local PC date components for skv CSV export names", () => {
    const localDate = new Date(2026, 4, 20, 14, 30, 12);

    expect(localFileTimestamp(localDate)).toBe("20262005-143012");
    expect(defaultExportCsvFileName("videos", localDate)).toBe(
      "skv-vid-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("images", localDate)).toBe(
      "skv-img-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("performers", localDate)).toBe(
      "skv-per-20262005-143012.csv",
    );
    expect(defaultExportCsvFileName("categories", localDate)).toBe(
      "skv-cat-20262005-143012.csv",
    );
  });
});
