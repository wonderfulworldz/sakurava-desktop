import { beforeEach, describe, expect, it } from "vitest";
import {
  applyCustomLanguageCsvPreview,
  buildCustomLanguageCsvPreview,
  buildLanguageExportCsv,
  defaultLanguageCsvFileName,
} from "./languageCsv";
import { getAllTranslationKeys, getBuiltInText, translate } from "./language";
import {
  getOverridesForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import {
  addCustomLanguage,
  getStoredCustomLanguages,
} from "./customLanguages";

const csv = (...rows: string[]) =>
  ["language_code,key,text,context", ...rows].join("\n");

describe("language CSV", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses a recognizable timestamped filename", () => {
    expect(
      defaultLanguageCsvFileName("en", new Date(2026, 4, 20, 14, 30, 12)),
    ).toBe("custom-skv-lang-20262005-143012.csv");
  });

  it("exports the final header and every English registry key", () => {
    const output = buildLanguageExportCsv("en");
    expect(output.split("\n")[0]).toBe("language_code,key,text,context");
    expect(output.split("\n")).toHaveLength(getAllTranslationKeys().length + 1);
    for (const row of [
      ",nav.home,Home,Nav > Home",
      ",collection.filter,Filter,Collection > Filter",
      ",detail.metadata,Metadata,Detail > Metadata",
      ",form.basicIdentity,Basic Identity,Form > Basic Identity",
      ",categories.title,Categories,Categories > Title",
      ",viewer.shortcutsTitle,Shortcuts,Image Viewer > Shortcuts Title",
      ",settings.title,Settings,Settings > Title",
    ]) {
      expect(output).toContain(row);
    }
    expect(output).not.toContain("Private User Title");
  });

  it("exports structural keys with detailed contexts in grouped prefix order", () => {
    const output = buildLanguageExportCsv("en");
    for (const row of [
      ",categories.table.header.name,NAME,Categories > Table > Header > Name",
      ",categories.table.header.description,DESCRIPTION,Categories > Table > Header > Description",
      ",glossary.form.field.category,Category,Glossary > Form > Field > Category",
      ",glossary.form.field.thumbnail,Thumbnail,Glossary > Form > Field > Thumbnail",
      ",common.status.available,Available,Common > Status Value > Available",
      ",catalog.filterChip.category,Category,Catalog > Toolbar > Active Filter Chip > Category",
      ",catalog.filterChip.publisherLabel,Publisher / Label,Catalog > Toolbar > Active Filter Chip > Publisher/Label",
      ",viewer.shortcuts.key.esc,Esc,Image Viewer > Shortcuts > Key > Esc",
      ",viewer.shortcuts.action.closeViewer,Close viewer,Image Viewer > Shortcuts > Action > Close Viewer",
      ",viewer.more.saveAs,Save As,Image Viewer > More > Save As",
      ",viewer.fileInfo.name,Name,Image Viewer > File Info > Name",
    ]) {
      expect(output).toContain(row);
    }
    expect(output.indexOf(",common.")).toBeLessThan(output.indexOf(",home."));
    expect(output.indexOf(",home.")).toBeLessThan(output.indexOf(",detail."));
    expect(output.indexOf(",detail.")).toBeLessThan(output.indexOf(",form."));
    expect(output.indexOf(",form.")).toBeLessThan(output.indexOf(",categories."));
  });

  it("always exports English template text", () => {
    setOverrideForLanguage("id", "nav.home", "Beranda");
    expect(buildLanguageExportCsv("id")).toContain("id,nav.home,Home,Nav > Home");
  });

  it("adds and updates Indonesian as a custom language", () => {
    let preview = buildCustomLanguageCsvPreview(
      csv("id,nav.home,Beranda,Sidebar navigation"),
    );
    expect(preview.languageName).toBe("Indonesian");
    expect(preview.isNew).toBe(true);
    expect(applyCustomLanguageCsvPreview(preview).applied).toBe(1);
    expect(getStoredCustomLanguages()).toEqual([
      { code: "id", label: "Indonesian", baseLanguage: "en" },
    ]);

    preview = buildCustomLanguageCsvPreview(
      csv("id,nav.home,Beranda Baru,Sidebar navigation"),
    );
    expect(preview.isNew).toBe(false);
    applyCustomLanguageCsvPreview(preview);
    expect(getOverridesForLanguage("id")["nav.home"]).toBe("Beranda Baru");
  });

  it("rejects blank, English, and mixed language codes", () => {
    expect(
      buildCustomLanguageCsvPreview(csv(",nav.home,Beranda,Sidebar")).headerError,
    ).toContain("Fill language_code");
    expect(
      buildCustomLanguageCsvPreview(csv("en,nav.home,Changed,Sidebar")).headerError,
    ).toContain("Cannot import");
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,nav.home,Beranda,Sidebar", "ja,nav.videos,ビデオ,Sidebar"),
      ).errorRows,
    ).toBe(1);
  });

  it("rejects duplicate keys, unknown keys, and retired headers", () => {
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,nav.home,A,Sidebar", "id,nav.home,B,Sidebar"),
      ).errorRows,
    ).toBe(1);
    expect(
      buildCustomLanguageCsvPreview(
        csv("id,unknown.key,Unknown,Unknown"),
      ).errorRows,
    ).toBe(1);
    expect(
      buildCustomLanguageCsvPreview(
        "Language Code,Language Name,Key,Text,Description\nid,Indonesian,nav.home,Beranda,nav",
      ).headerError,
    ).toContain("language_code,key,text,context");
  });

  it("uses empty text as English fallback", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    setOverrideForLanguage("id", "nav.home", "Beranda");
    applyCustomLanguageCsvPreview(
      buildCustomLanguageCsvPreview(csv("id,nav.home,,Sidebar")),
    );
    const overrides = getOverridesForLanguage("id");
    expect(overrides["nav.home"]).toBeUndefined();
    expect(translate("id", "nav.home", {}, overrides)).toBe("Home");
  });

  it("never overwrites the English source", () => {
    applyCustomLanguageCsvPreview(
      buildCustomLanguageCsvPreview(csv("id,nav.home,Beranda,Sidebar")),
    );
    expect(getBuiltInText("en", "nav.home")).toBe("Home");
  });
});
