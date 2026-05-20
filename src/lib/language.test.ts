import { describe, expect, it, beforeEach } from "vitest";
import {
  defaultLanguageCode,
  getStoredLanguageCode,
  languageStorageKey,
  normalizeLanguageCode,
  storeLanguageCode,
  translate,
} from "./language";

describe("language", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to English and normalizes invalid saved values", () => {
    expect(normalizeLanguageCode("en")).toBe("en");
    expect(normalizeLanguageCode("id")).toBe("id");
    expect(normalizeLanguageCode("ja")).toBe(defaultLanguageCode);
    expect(getStoredLanguageCode()).toBe("en");

    window.localStorage.setItem(languageStorageKey, "invalid");

    expect(getStoredLanguageCode()).toBe("en");
  });

  it("stores and reloads the selected language", () => {
    storeLanguageCode("id");

    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
    expect(getStoredLanguageCode()).toBe("id");
  });

  it("falls back from selected language to English and then to the key", () => {
    // Indonesian key returns Indonesian text
    expect(translate("id", "nav.home")).toBe("Beranda");
    // Missing key in both dictionaries returns the raw key
    expect(translate("id", "missing.language.key")).toBe("missing.language.key");
    // English key returns English text
    expect(translate("en", "nav.home")).toBe("Home");
  });
});
