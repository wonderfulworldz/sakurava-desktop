import { beforeEach, describe, expect, it } from "vitest";
import {
  applyLanguageCsvPreview,
  buildLanguageCsv,
  buildLanguageCsvPreview,
  defaultLanguageCsvFileName,
} from "./languageCsv";
import { getAllTranslationKeys, getBuiltInText, translate } from "./language";
import {
  getOverridesForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";

describe("language CSV", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("filename", () => {
    it("uses en-skv-lang-YYYYDDMM-HHmmss.csv format for English", () => {
      const date = new Date(2026, 4, 20, 14, 30, 12); // May 20, 2026 14:30:12
      const filename = defaultLanguageCsvFileName("en", date);
      expect(filename).toBe("en-skv-lang-20262005-143012.csv");
    });

    it("uses id-skv-lang-YYYYDDMM-HHmmss.csv format for Indonesian", () => {
      const date = new Date(2026, 4, 20, 14, 30, 12);
      const filename = defaultLanguageCsvFileName("id", date);
      expect(filename).toBe("id-skv-lang-20262005-143012.csv");
    });

    it("uses local PC time components", () => {
      const date = new Date(2026, 0, 5, 9, 3, 7); // Jan 5, 2026 09:03:07
      const filename = defaultLanguageCsvFileName("en", date);
      expect(filename).toBe("en-skv-lang-20260501-090307.csv");
    });
  });

  describe("export", () => {
    it("exports CSV with Key,Text,Description,Status headers", () => {
      const csv = buildLanguageCsv("en");
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Key,Text,Description,Status");
    });

    it("exports all known UI keys", () => {
      const csv = buildLanguageCsv("en");
      const lines = csv.split("\n");
      const keys = getAllTranslationKeys();
      // Header + all keys
      expect(lines.length).toBe(keys.length + 1);
    });

    it("exports selected language only (English text for en)", () => {
      const csv = buildLanguageCsv("en");
      expect(csv).toContain("nav.home,Home,nav,Built-in");
    });

    it("exports selected language only (Indonesian text for id)", () => {
      const csv = buildLanguageCsv("id");
      expect(csv).toContain("nav.home,Beranda,nav,Built-in");
    });

    it("exports existing overrides with Custom status", () => {
      setOverrideForLanguage("en", "nav.home", "Dashboard");
      const csv = buildLanguageCsv("en");
      expect(csv).toContain("nav.home,Dashboard,nav,Custom");
    });

    it("escapes commas and quotes in text values", () => {
      setOverrideForLanguage("en", "nav.home", 'Hello, "World"');
      const csv = buildLanguageCsv("en");
      expect(csv).toContain('nav.home,"Hello, ""World""",nav,Custom');
    });
  });

  describe("import preview", () => {
    it("accepts valid CSV with correct headers", () => {
      const csv = "Key,Text,Description,Status\nnav.home,Dashboard,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.totalRows).toBe(1);
      expect(preview.validRows).toBe(1);
      expect(preview.overrideRows).toBe(1);
      expect(preview.errorRows).toBe(0);
      expect(preview.rows[0].key).toBe("nav.home");
      expect(preview.rows[0].text).toBe("Dashboard");
      expect(preview.rows[0].action).toBe("override");
    });

    it("rejects invalid/missing headers", () => {
      const csv = "Wrong,Headers\nfoo,bar";
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.validRows).toBe(0);
      expect(preview.errorRows).toBe(1);
      expect(preview.rows[0].error).toContain("Invalid CSV headers");
    });

    it("rejects empty CSV", () => {
      const preview = buildLanguageCsvPreview("en", "");
      expect(preview.errorRows).toBe(1);
      expect(preview.rows[0].error).toContain("Empty CSV file");
    });

    it("marks unknown keys as warning and does not apply", () => {
      const csv = "Key,Text,Description,Status\nunknown.key.xyz,Some text,unknown,Custom";
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.warningRows).toBe(1);
      expect(preview.rows[0].action).toBe("skip");
      expect(preview.rows[0].warning).toContain("Unknown key");
    });

    it("marks duplicate keys as error and does not apply", () => {
      const csv = "Key,Text,Description,Status\nnav.home,Dashboard,nav,Custom\nnav.home,Other,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.errorRows).toBe(1);
      expect(preview.rows[1].action).toBe("skip");
      expect(preview.rows[1].error).toContain("Duplicate key");
    });

    it("empty Text marks row as reset action", () => {
      const csv = "Key,Text,Description,Status\nnav.home,,nav,Built-in";
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.resetRows).toBe(1);
      expect(preview.rows[0].action).toBe("reset");
    });

    it("handles commas and quotes in CSV cells", () => {
      const csv = 'Key,Text,Description,Status\nnav.home,"Hello, ""World""",nav,Custom';
      const preview = buildLanguageCsvPreview("en", csv);

      expect(preview.rows[0].text).toBe('Hello, "World"');
      expect(preview.rows[0].action).toBe("override");
    });
  });

  describe("import apply", () => {
    it("requires valid preview to apply", () => {
      const csv = "Key,Text,Description,Status\nnav.home,Dashboard,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);
      const report = applyLanguageCsvPreview(preview);

      expect(report.applied).toBe(1);
      expect(report.overrides).toBe(1);
      expect(report.resets).toBe(0);
    });

    it("applies override and updates translate output", () => {
      const csv = "Key,Text,Description,Status\nnav.home,My Dashboard,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);
      applyLanguageCsvPreview(preview);

      const overrides = getOverridesForLanguage("en");
      expect(overrides["nav.home"]).toBe("My Dashboard");
      expect(translate("en", "nav.home", {}, overrides)).toBe("My Dashboard");
    });

    it("empty Text resets override", () => {
      setOverrideForLanguage("en", "nav.home", "Dashboard");
      expect(getOverridesForLanguage("en")["nav.home"]).toBe("Dashboard");

      const csv = "Key,Text,Description,Status\nnav.home,,nav,Built-in";
      const preview = buildLanguageCsvPreview("en", csv);
      applyLanguageCsvPreview(preview);

      expect(getOverridesForLanguage("en")["nav.home"]).toBeUndefined();
      expect(translate("en", "nav.home")).toBe("Home");
    });

    it("does not apply unknown or duplicate keys", () => {
      const csv = "Key,Text,Description,Status\nunknown.key,Foo,x,Custom\nnav.home,A,nav,Custom\nnav.home,B,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);
      const report = applyLanguageCsvPreview(preview);

      expect(report.applied).toBe(1);
      expect(report.warnings).toBe(1);
      expect(report.errors).toBe(1);
      expect(getOverridesForLanguage("en")["nav.home"]).toBe("A");
      expect(getOverridesForLanguage("en")["unknown.key"]).toBeUndefined();
    });

    it("built-in dictionary remains unchanged after apply", () => {
      const csv = "Key,Text,Description,Status\nnav.home,Custom Home,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);
      applyLanguageCsvPreview(preview);

      // Built-in text is unchanged
      expect(getBuiltInText("en", "nav.home")).toBe("Home");
      // Override is separate
      expect(getOverridesForLanguage("en")["nav.home"]).toBe("Custom Home");
    });

    it("catalog data remains unchanged", () => {
      const csv = "Key,Text,Description,Status\nnav.home,Custom,nav,Custom";
      const preview = buildLanguageCsvPreview("en", csv);
      applyLanguageCsvPreview(preview);

      // Catalog data keys are never in the translation system
      expect(translate("en", "Sample Video Title")).toBe("Sample Video Title");
    });
  });
});
