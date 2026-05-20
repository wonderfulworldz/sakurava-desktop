import { beforeEach, describe, expect, it } from "vitest";
import { getAllTranslationKeys, getBuiltInText, getKeyDescription } from "./language";

describe("language editor helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("getAllTranslationKeys returns sorted unique keys from all dictionaries", () => {
    const keys = getAllTranslationKeys();

    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain("nav.home");
    expect(keys).toContain("nav.videos");
    expect(keys).toContain("settings.title");
    expect(keys).toContain("home.welcome");
    expect(keys).toContain("collection.filter");

    // Verify sorted
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);

    // Verify no duplicates
    const unique = [...new Set(keys)];
    expect(keys).toEqual(unique);
  });

  it("getBuiltInText returns the built-in text for a language and key", () => {
    expect(getBuiltInText("en", "nav.home")).toBe("Home");
    expect(getBuiltInText("id", "nav.home")).toBe("Beranda");
    expect(getBuiltInText("en", "totally.missing.key")).toBeUndefined();
  });

  it("getKeyDescription returns a readable section path", () => {
    expect(getKeyDescription("nav.home")).toBe("nav");
    expect(getKeyDescription("settings.language.title")).toBe("settings > language");
    expect(getKeyDescription("collection.searchPlaceholder.videos")).toBe(
      "collection > searchPlaceholder",
    );
    expect(getKeyDescription("singleword")).toBe("singleword");
  });

  it("key and description are read-only data (not editable)", () => {
    // Keys are derived from the built-in dictionaries and cannot be modified
    const keys = getAllTranslationKeys();
    const originalLength = keys.length;

    // Attempting to modify the returned array does not affect the source
    keys.push("fake.key");
    expect(getAllTranslationKeys().length).toBe(originalLength);
  });
});
