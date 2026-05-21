import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomLanguage,
  customLanguagesStorageKey,
  getStoredCustomLanguages,
  isCustomLanguageCode,
  removeCustomLanguage,
} from "./customLanguages";
import {
  applyCustomLanguageCsvPreview,
  buildCustomLanguageCsvPreview,
} from "./languageCsv";
import {
  defaultLanguageCode,
  getSupportedLanguages,
  normalizeLanguageCode,
  translate,
} from "./language";
import { getOverridesForLanguage, setOverrideForLanguage } from "./languageOverrides";
import { resetAllOverridesForLanguage } from "./languageOverrides";

describe("custom languages", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("storage", () => {
    it("returns empty list when nothing stored", () => {
      expect(getStoredCustomLanguages()).toEqual([]);
    });

    it("adds a custom language", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      const stored = getStoredCustomLanguages();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toEqual({ code: "ja", label: "Japanese", baseLanguage: "en" });
    });

    it("normalizes language code to lowercase", () => {
      addCustomLanguage({ code: "JA", label: "Japanese", baseLanguage: "en" });
      expect(getStoredCustomLanguages()[0].code).toBe("ja");
    });

    it("replaces existing custom language on re-add", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      addCustomLanguage({ code: "ja", label: "Japanese Updated", baseLanguage: "en" });
      const stored = getStoredCustomLanguages();
      expect(stored).toHaveLength(1);
      expect(stored[0].label).toBe("Japanese Updated");
    });

    it("removes a custom language", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      addCustomLanguage({ code: "ko", label: "Korean", baseLanguage: "en" });
      removeCustomLanguage("ja");
      const stored = getStoredCustomLanguages();
      expect(stored).toHaveLength(1);
      expect(stored[0].code).toBe("ko");
    });

    it("cleans up localStorage when all custom languages removed", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      removeCustomLanguage("ja");
      expect(window.localStorage.getItem(customLanguagesStorageKey)).toBeNull();
    });

    it("isCustomLanguageCode detects custom languages", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      expect(isCustomLanguageCode("ja")).toBe(true);
      expect(isCustomLanguageCode("en")).toBe(false);
      expect(isCustomLanguageCode("xx")).toBe(false);
    });

    it("handles corrupt localStorage gracefully", () => {
      window.localStorage.setItem(customLanguagesStorageKey, "not json");
      expect(getStoredCustomLanguages()).toEqual([]);
    });

    it("cannot remove English", () => {
      removeCustomLanguage("en");
      expect(getSupportedLanguages().some((l) => l.code === "en")).toBe(true);
    });
  });

  describe("dynamic language list", () => {
    it("getSupportedLanguages includes custom languages", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      const languages = getSupportedLanguages();
      expect(languages.some((l) => l.code === "ja")).toBe(true);
      expect(languages.some((l) => l.code === "en")).toBe(true);
    });

    it("normalizeLanguageCode accepts custom language codes", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      expect(normalizeLanguageCode("ja")).toBe("ja");
    });

    it("normalizeLanguageCode falls back to en for unknown codes", () => {
      expect(normalizeLanguageCode("xx")).toBe(defaultLanguageCode);
    });

    it("Indonesian is removable and disappears from language list", () => {
      // Indonesian should be present by default
      expect(getSupportedLanguages().some((l) => l.code === "id")).toBe(true);

      // Remove Indonesian
      removeCustomLanguage("id");

      // Indonesian should disappear
      expect(getSupportedLanguages().some((l) => l.code === "id")).toBe(false);
    });

    it("removing active Indonesian falls back to English via normalizeLanguageCode", () => {
      removeCustomLanguage("id");
      // "id" is no longer a valid language code
      expect(normalizeLanguageCode("id")).toBe("en");
    });
  });

  describe("custom language CSV (5-column format)", () => {
    it("accepts valid custom language CSV", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.languageCode).toBe("ja");
      expect(preview.languageName).toBe("Japanese");
      expect(preview.isNew).toBe(true);
      expect(preview.validRows).toBe(1);
      expect(preview.overrideRows).toBe(1);
    });

    it("blocks Language Code en", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nen,English,nav.home,Home,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.headerError).toContain("Cannot import custom language with code 'en'");
    });

    it("blocks mixed language codes in one CSV", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav\nko,Korean,nav.videos,비디오,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.rows.some((r) => r.error?.includes("Mixed language codes"))).toBe(true);
    });

    it("marks unknown keys as warning", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,unknown.key.xyz,テスト,unknown";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.warningRows).toBe(1);
      expect(preview.rows[0].warning).toContain("Unknown key");
    });

    it("empty Text marks row as reset", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.resetRows).toBe(1);
    });

    it("detects existing custom language as modify (not new)", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.isNew).toBe(false);
    });
  });

  describe("custom language apply", () => {
    it("adds custom language and applies translations", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav\nja,Japanese,nav.videos,ビデオ,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      const report = applyCustomLanguageCsvPreview(preview);

      expect(report.applied).toBe(2);
      expect(getStoredCustomLanguages().some((l) => l.code === "ja")).toBe(true);
      expect(getOverridesForLanguage("ja")["nav.home"]).toBe("ホーム");
    });

    it("incomplete language falls back to English", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);

      const overrides = getOverridesForLanguage("ja");
      expect(translate("ja", "nav.home", {}, overrides)).toBe("ホーム");
      expect(translate("ja", "nav.videos", {}, overrides)).toBe("Videos");
    });

    it("modifies existing custom language", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      setOverrideForLanguage("ja", "nav.home", "旧ホーム");

      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese Updated,nav.home,新ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);

      expect(getStoredCustomLanguages()[0].label).toBe("Japanese Updated");
      expect(getOverridesForLanguage("ja")["nav.home"]).toBe("新ホーム");
    });

    it("removing custom language clears overrides", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      setOverrideForLanguage("ja", "nav.home", "ホーム");

      removeCustomLanguage("ja");
      resetAllOverridesForLanguage("ja");

      expect(getStoredCustomLanguages()).toHaveLength(0);
      expect(getOverridesForLanguage("ja")).toEqual({});
    });

    it("catalog data remains unchanged", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);

      expect(translate("ja", "Sample Video Title", {}, getOverridesForLanguage("ja"))).toBe("Sample Video Title");
    });
  });
});
