import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomLanguage,
  customLanguagesStorageKey,
  getStoredCustomLanguages,
  isCustomLanguageCode,
  maxCustomLanguages,
  removeCustomLanguage,
} from "./customLanguages";
import {
  defaultLanguageCode,
  getSupportedLanguages,
  normalizeLanguageCode,
} from "./language";

describe("custom languages", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts with English as the only supported language", () => {
    expect(getSupportedLanguages()).toEqual([
      { code: "en", label: "English", nativeLabel: "English" },
    ]);
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(isCustomLanguageCode("en")).toBe(false);
  });

  it("handles corrupt storage safely", () => {
    window.localStorage.setItem(customLanguagesStorageKey, "not json");
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(getSupportedLanguages()).toHaveLength(1);
  });

  it("normalizes and sanitizes stored custom languages", () => {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([
        { code: "JA", label: " Japanese ", baseLanguage: "xx" },
        { code: "ja", label: "Duplicate", baseLanguage: "en" },
        { code: "../bad", label: "Unsafe", baseLanguage: "en" },
        { code: "id", label: "Indonesian", baseLanguage: "en" },
      ]),
    );
    expect(getStoredCustomLanguages()).toEqual([
      { code: "ja", label: "Japanese", baseLanguage: "en" },
      { code: "id", label: "Indonesian", baseLanguage: "en" },
    ]);
  });

  it("adds, updates, and removes every non-English language", () => {
    expect(
      addCustomLanguage({ code: "ID", label: "Indonesian", baseLanguage: "en" })
        .ok,
    ).toBe(true);
    expect(normalizeLanguageCode("id")).toBe("id");
    expect(isCustomLanguageCode("id")).toBe(true);
    expect(
      addCustomLanguage({
        code: "id",
        label: "Bahasa Indonesia",
        baseLanguage: "en",
      }).ok,
    ).toBe(true);
    expect(getStoredCustomLanguages()[0].label).toBe("Bahasa Indonesia");
    expect(removeCustomLanguage("id").ok).toBe(true);
    expect(normalizeLanguageCode("id")).toBe(defaultLanguageCode);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBeNull();
  });

  it("protects English from replacement and removal", () => {
    expect(
      addCustomLanguage({ code: "en", label: "Changed", baseLanguage: "en" }).ok,
    ).toBe(false);
    expect(removeCustomLanguage("en").ok).toBe(false);
    expect(getSupportedLanguages()[0].code).toBe("en");
  });

  it("rejects unsafe metadata and duplicate labels", () => {
    expect(
      addCustomLanguage({ code: "../id", label: "Unsafe", baseLanguage: "en" })
        .ok,
    ).toBe(false);
    addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
    expect(
      addCustomLanguage({ code: "jp", label: "Japanese", baseLanguage: "en" })
        .ok,
    ).toBe(false);
  });

  it("enforces the maximum of 25 custom languages", () => {
    for (let index = 0; index < maxCustomLanguages; index++) {
      expect(
        addCustomLanguage({
          code: `x${index.toString(36).padStart(2, "0")}`,
          label: `Custom ${index + 1}`,
          baseLanguage: "en",
        }).ok,
      ).toBe(true);
    }
    expect(
      addCustomLanguage({ code: "zz", label: "Overflow", baseLanguage: "en" })
        .ok,
    ).toBe(false);
    expect(getStoredCustomLanguages()).toHaveLength(maxCustomLanguages);
  });
});
