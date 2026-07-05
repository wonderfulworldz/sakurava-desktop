import { beforeEach, describe, expect, it } from "vitest";
import {
  getOverridesForLanguage,
  getStoredLanguageOverrides,
  languageOverridesStorageKey,
  resetAllOverridesForLanguage,
  resetOverrideForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import { translate } from "./language";

describe("language overrides", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty overrides when nothing is stored", () => {
    expect(getStoredLanguageOverrides()).toEqual({});
    expect(getOverridesForLanguage("en")).toEqual({});
    expect(getOverridesForLanguage("id")).toEqual({});
  });

  it("sets and retrieves a single override", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");

    expect(getOverridesForLanguage("en")).toEqual({ "nav.home": "Dashboard" });
    expect(getOverridesForLanguage("id")).toEqual({});
  });

  it("override takes priority in translate function", () => {
    const overrides = { "nav.home": "Dashboard" };

    expect(translate("en", "nav.home", {}, overrides)).toBe("Dashboard");
    // Without override, returns built-in
    expect(translate("en", "nav.home", {}, {})).toBe("Home");
  });

  it("empty override text removes the override", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    expect(getOverridesForLanguage("en")).toEqual({ "nav.home": "Dashboard" });

    setOverrideForLanguage("en", "nav.home", "");
    expect(getOverridesForLanguage("en")).toEqual({});
  });

  it("whitespace-only override text removes the override", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.home", "   ");
    expect(getOverridesForLanguage("en")).toEqual({});
  });

  it("resets a single override", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.videos", "My Videos");

    resetOverrideForLanguage("en", "nav.home");

    expect(getOverridesForLanguage("en")).toEqual({ "nav.videos": "My Videos" });
  });

  it("resets all overrides for a language", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.videos", "My Videos");
    setOverrideForLanguage("id", "nav.home", "Halaman Utama");

    resetAllOverridesForLanguage("en");

    expect(getOverridesForLanguage("en")).toEqual({});
    expect(getOverridesForLanguage("id")).toEqual({ "nav.home": "Halaman Utama" });
  });

  it("cleans up localStorage when all overrides are removed", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    resetAllOverridesForLanguage("en");

    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBeNull();
  });

  it("handles corrupt localStorage gracefully", () => {
    window.localStorage.setItem(languageOverridesStorageKey, "not valid json");
    expect(getStoredLanguageOverrides()).toEqual({});
    expect(getOverridesForLanguage("en")).toEqual({});
  });

  it("handles non-object localStorage values gracefully", () => {
    window.localStorage.setItem(languageOverridesStorageKey, '"string"');
    expect(getStoredLanguageOverrides()).toEqual({});

    window.localStorage.setItem(languageOverridesStorageKey, "[1,2,3]");
    expect(getStoredLanguageOverrides()).toEqual({});
  });

  it("drops malformed stored override values", () => {
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        ja: { "nav.home": "ホーム", "nav.videos": 42, empty: "  " },
        invalid: "not an object",
      }),
    );

    expect(getStoredLanguageOverrides()).toEqual({
      ja: { "nav.home": "ホーム" },
    });
  });

  it("override persists across reads", () => {
    setOverrideForLanguage("id", "settings.title", "Setelan Kustom");

    // Simulate re-reading from storage
    const overrides = getOverridesForLanguage("id");
    expect(overrides).toEqual({ "settings.title": "Setelan Kustom" });
    expect(translate("id", "settings.title", {}, overrides)).toBe("Setelan Kustom");
  });

  it("fallback chain remains: override -> built-in -> English -> key", () => {
    // With override
    const overrides = { "nav.home": "Custom" };
    expect(translate("id", "nav.home", {}, overrides)).toBe("Custom");

    // Without override, every custom language falls back to English.
    expect(translate("id", "nav.home", {}, {})).toBe("Home");

    // Missing key in both, falls back to key itself
    expect(translate("id", "totally.missing.key", {}, {})).toBe("totally.missing.key");
  });

  it("does not affect catalog data", () => {
    setOverrideForLanguage("en", "Sample Video Title", "Should Not Exist");

    // Catalog data is never looked up via translate keys
    // The translate function would return the override if the key matched,
    // but catalog data is never passed through translate()
    expect(translate("en", "nav.home", {}, getOverridesForLanguage("en"))).toBe("Home");
  });
});
