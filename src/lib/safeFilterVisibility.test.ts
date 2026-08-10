import { describe, expect, it } from "vitest";
import {
  filterSafeFilterFields,
  filterSafeFilterLabels,
  filterSafeFilterSortOptions,
  isSafeFilterFieldVisible,
} from "./safeFilterVisibility";

describe("Safe Filter sensitive feature visibility", () => {
  it("hides only Censorship, Measurements, and Cup Size while Safe Filter is ON", () => {
    const fields = [
      "censorship",
      "measurements",
      "cupSize",
      "bodyType",
      "heightCm",
      "weightKg",
      "gender",
      "birthDate",
      "ratingAttraction",
      "glossaryRefs",
    ].map((name) => ({ name }));

    expect(filterSafeFilterFields(fields, true).map((field) => field.name)).toEqual([
      "bodyType",
      "heightCm",
      "weightKg",
      "gender",
      "birthDate",
      "ratingAttraction",
      "glossaryRefs",
    ]);
    expect(fields).toHaveLength(10);
  });

  it("restores complete sensitive visibility when Safe Filter is OFF", () => {
    expect(isSafeFilterFieldVisible("censorship", false)).toBe(true);
    expect(isSafeFilterFieldVisible("measurements", false)).toBe(true);
    expect(isSafeFilterFieldVisible("cupSize", false)).toBe(true);
  });

  it("applies the same bounded policy to detail rows and collection sorting", () => {
    expect(filterSafeFilterLabels([
      { label: "Body Type" },
      { label: "Height" },
      { label: "Measurement" },
      { label: "Cup Size" },
      { label: "Gender" },
    ], true)).toEqual([
      { label: "Body Type" },
      { label: "Height" },
      { label: "Gender" },
    ]);
    expect(filterSafeFilterSortOptions(["Title A-Z", "Censorship", "Rating"], true))
      .toEqual(["Title A-Z", "Rating"]);
  });
});
