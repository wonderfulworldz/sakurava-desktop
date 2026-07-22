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

    // The helper returns a deterministic preferred-prefix order.
    expect(getAllTranslationKeys()).toEqual(keys);
    expect(keys.indexOf("common.save")).toBeLessThan(keys.indexOf("nav.home"));

    // Verify no duplicates
    const unique = [...new Set(keys)];
    expect(keys).toEqual(unique);
  });

  it("getBuiltInText returns the built-in text for a language and key", () => {
    expect(getBuiltInText("en", "nav.home")).toBe("Home");
    expect(getBuiltInText("id", "nav.home")).toBeUndefined();
    expect(getBuiltInText("en", "totally.missing.key")).toBeUndefined();
  });

  it("getKeyDescription returns a readable section path", () => {
    expect(getKeyDescription("nav.home")).toBe("Nav > Home");
    expect(getKeyDescription("settings.language.title")).toBe("Settings > Language > Title");
    expect(getKeyDescription("collection.searchPlaceholder.videos")).toBe(
      "Collection > Search Placeholder > Videos",
    );
    expect(getKeyDescription("singleword")).toBe("Singleword");
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
