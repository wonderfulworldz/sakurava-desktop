import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLanguageExportCsv,
  buildCustomLanguageCsvPreview,
  applyCustomLanguageCsvPreview,
  defaultLanguageCsvFileName,
} from "./languageCsv";
import { getAllTranslationKeys, getBuiltInText, translate } from "./language";
import {
  getOverridesForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import { addCustomLanguage } from "./customLanguages";

describe("language CSV", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("filename", () => {
    it("uses custom-skv-lang-YYYYDDMM-HHmmss.csv when English selected", () => {
      const date = new Date(2026, 4, 20, 14, 30, 12);
      const filename = defaultLanguageCsvFileName("en", date);
      expect(filename).toBe("custom-skv-lang-20262005-143012.csv");
    });

    it("uses languageCode-skv-lang-YYYYDDMM-HHmmss.csv for custom language", () => {
      const date = new Date(2026, 4, 20, 14, 30, 12);
      expect(defaultLanguageCsvFileName("id", date)).toBe("id-skv-lang-20262005-143012.csv");
      expect(defaultLanguageCsvFileName("ja", date)).toBe("ja-skv-lang-20262005-143012.csv");
    });

    it("uses local PC time components", () => {
      const date = new Date(2026, 0, 5, 9, 3, 7);
      const filename = defaultLanguageCsvFileName("en", date);
      expect(filename).toBe("custom-skv-lang-20260501-090307.csv");
    });
  });

  describe("export from English (starter CSV)", () => {
    it("exports with 5-column headers only", () => {
      const csv = buildLanguageExportCsv("en");
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Language Code,Language Name,Key,Text,Description");
    });

    it("includes all known translation keys", () => {
      const csv = buildLanguageExportCsv("en");
      const lines = csv.split("\n");
      const keys = getAllTranslationKeys();
      expect(lines.length).toBe(keys.length + 1);
    });

    it("uses Language Code 'custom' not 'en'", () => {
      const csv = buildLanguageExportCsv("en");
      const lines = csv.split("\n");
      const firstDataRow = lines[1];
      expect(firstDataRow.startsWith("custom,Custom Language,")).toBe(true);
    });

    it("has Text prefilled from English built-in text", () => {
      const csv = buildLanguageExportCsv("en");
      expect(csv).toContain(",nav.home,Home,nav");
      expect(csv).toContain(",nav.videos,Videos,nav");
    });

    it("does not export an editable English language file", () => {
      const csv = buildLanguageExportCsv("en");
      // Language Code is "custom", not "en"
      expect(csv).not.toContain("\nen,");
    });
  });

  describe("export from custom language", () => {
    it("uses selected language code and name", () => {
      setOverrideForLanguage("id", "nav.home", "Beranda Custom");
      const csv = buildLanguageExportCsv("id");
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Language Code,Language Name,Key,Text,Description");
      expect(lines[1]).toContain("id,Indonesian,");
    });

    it("has Text prefilled from selected language effective text", () => {
      setOverrideForLanguage("id", "nav.home", "Beranda Custom");
      const csv = buildLanguageExportCsv("id");
      // Override text used
      expect(csv).toContain(",nav.home,Beranda Custom,nav");
    });

    it("falls back to English for missing custom keys", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      setOverrideForLanguage("ja", "nav.home", "ホーム");
      const csv = buildLanguageExportCsv("ja");
      // Has override
      expect(csv).toContain(",nav.home,ホーム,nav");
      // Falls back to English for missing keys
      expect(csv).toContain(",nav.videos,Videos,nav");
    });
  });

  describe("import (5-column format)", () => {
    it("accepts valid 5-column custom language CSV", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);

      expect(preview.languageCode).toBe("ja");
      expect(preview.languageName).toBe("Japanese");
      expect(preview.validRows).toBe(1);
      expect(preview.overrideRows).toBe(1);
    });

    it("blocks Language Code en", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nen,English,nav.home,Custom Home,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.headerError).toContain("Cannot import custom language with code 'en'");
    });

    it("blocks missing Language Code", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\n,,nav.home,Test,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.headerError).toContain("Language Code is required");
    });

    it("blocks missing Language Name", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,,nav.home,Test,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.headerError).toContain("Language Name is required");
    });

    it("blocks old 7-column CSV format with clear error", () => {
      const csv = "Language Code,Language Name,Base Language,Key,Text,Description,Status\nja,Japanese,en,nav.home,ホーム,nav,Custom";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.headerError).toContain("Unsupported 7-column CSV format");
    });

    it("blocks mixed language codes", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav\nko,Korean,nav.videos,비디오,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.rows.some((r) => r.error?.includes("Mixed language codes"))).toBe(true);
    });

    it("marks unknown keys as warning", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,unknown.key.xyz,テスト,unknown";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.warningRows).toBe(1);
      expect(preview.rows[0].action).toBe("skip");
    });

    it("marks duplicate keys as error", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,A,nav\nja,Japanese,nav.home,B,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.errorRows).toBe(1);
    });

    it("empty Text marks row as reset (fallback to English)", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.resetRows).toBe(1);
      expect(preview.rows[0].action).toBe("reset");
    });

    it("import add new custom language works", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.isNew).toBe(true);
      const report = applyCustomLanguageCsvPreview(preview);
      expect(report.applied).toBe(1);
      expect(getOverridesForLanguage("ja")["nav.home"]).toBe("ホーム");
    });

    it("import update existing custom language works", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      setOverrideForLanguage("ja", "nav.home", "旧ホーム");

      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese Updated,nav.home,新ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      expect(preview.isNew).toBe(false);
      applyCustomLanguageCsvPreview(preview);
      expect(getOverridesForLanguage("ja")["nav.home"]).toBe("新ホーム");
    });

    it("empty Text falls back to English", () => {
      addCustomLanguage({ code: "ja", label: "Japanese", baseLanguage: "en" });
      setOverrideForLanguage("ja", "nav.home", "ホーム");

      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);

      const overrides = getOverridesForLanguage("ja");
      expect(overrides["nav.home"]).toBeUndefined();
      expect(translate("ja", "nav.home", {}, overrides)).toBe("Home");
    });

    it("English remains unchanged after any import", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);
      expect(getBuiltInText("en", "nav.home")).toBe("Home");
    });

    it("catalog data remains unchanged", () => {
      const csv = "Language Code,Language Name,Key,Text,Description\nja,Japanese,nav.home,ホーム,nav";
      const preview = buildCustomLanguageCsvPreview(csv);
      applyCustomLanguageCsvPreview(preview);
      expect(translate("ja", "Sample Video Title", {}, getOverridesForLanguage("ja"))).toBe("Sample Video Title");
    });
  });
});
