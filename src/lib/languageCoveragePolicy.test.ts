import { describe, expect, it } from "vitest";
import { getAllTranslationKeys, getBuiltInText } from "./language";

describe("language coverage policy", () => {
  it("English dictionary covers all known translation keys", () => {
    const keys = getAllTranslationKeys();

    const missingKeys: string[] = [];
    for (const key of keys) {
      const text = getBuiltInText("en", key);
      if (text === undefined) {
        missingKeys.push(key);
      }
    }

    expect(missingKeys).toEqual([]);
  });

  it("English dictionary values are non-empty strings", () => {
    const keys = getAllTranslationKeys();

    const emptyKeys: string[] = [];
    for (const key of keys) {
      const text = getBuiltInText("en", key);
      if (text !== undefined && text.trim() === "") {
        emptyKeys.push(key);
      }
    }

    expect(emptyKeys).toEqual([]);
  });

  it("translation keys follow dot-separated naming convention", () => {
    const keys = getAllTranslationKeys();

    const invalidKeys = keys.filter((key) => {
      // Stable dot-separated identifiers may use camelCase within a segment.
      return !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/.test(key);
    });

    expect(invalidKeys).toEqual([]);
  });

  it("no duplicate keys exist across dictionaries", () => {
    const keys = getAllTranslationKeys();
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("does not register Indonesian as a bundled dictionary", () => {
    const keys = getAllTranslationKeys();
    const indonesianKeys = keys.filter(
      (key) => getBuiltInText("id", key) !== undefined,
    );
    expect(indonesianKeys).toEqual([]);
  });

  it("key count is tracked for coverage awareness", () => {
    const keys = getAllTranslationKeys();

    // As of Batch 34.16, we have a known set of keys.
    // This test documents the current count and will break if keys are
    // accidentally removed. Update the minimum when adding new keys.
    expect(keys.length).toBeGreaterThanOrEqual(80);
  });
});
