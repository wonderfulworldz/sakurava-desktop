import { beforeEach, describe, expect, it } from "vitest";
import { addCustomLanguage, removeCustomLanguage } from "./customLanguages";
import {
  getOverridesForLanguage,
  getStoredLanguageOverrides,
  inspectStoredLanguageOverrides,
  languageOverridesStorageKey,
  resetAllOverridesForLanguage,
  resetOverrideForLanguage,
  setOverrideForLanguage,
} from "./languageOverrides";
import { languageStorageKey, translate } from "./language";
import { translationStorageKeys, type TranslationStorage } from "./translationStorage";

class FailingStorage implements TranslationStorage {
  readonly values = new Map<string, string>();
  failJournalWrite = false;
  makeStale = false;
  private selectedReads = 0;
  getItem(key: string): string | null {
    if (key === languageStorageKey) {
      this.selectedReads += 1;
      if (this.makeStale && this.selectedReads === 2) this.values.set(languageOverridesStorageKey, "{}");
    }
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === translationStorageKeys.transactionJournal && this.failJournalWrite) throw new Error("journal unavailable");
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("language overrides", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns empty overrides when nothing is stored", () => {
    expect(getStoredLanguageOverrides()).toEqual({});
    expect(getOverridesForLanguage("en")).toEqual({});
    expect(getOverridesForLanguage("id")).toEqual({});
  });

  it("sets and retrieves an exact override through a logical transaction", () => {
    expect(setOverrideForLanguage("en", "nav.home", "  Dashboard  ").ok).toBe(true);
    expect(getOverridesForLanguage("EN")).toEqual({ "nav.home": "  Dashboard  " });
    expect(window.localStorage.getItem(translationStorageKeys.transactionJournal)).toBeNull();
  });

  it("uses selected override, then English override, bundled English, then raw key", () => {
    expect(translate("id", "nav.home", {}, { "nav.home": "Beranda" }, { "nav.home": "Dashboard" })).toBe("Beranda");
    expect(translate("id", "nav.home", {}, {}, { "nav.home": "Dashboard" })).toBe("Dashboard");
    expect(translate("id", "nav.home", {}, {}, {})).toBe("Home");
    expect(translate("id", "missing.language.key", {}, {}, {})).toBe("missing.language.key");
  });

  it("empty text resets while whitespace Translation text is preserved", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.home", "   ");
    expect(getOverridesForLanguage("en")).toEqual({ "nav.home": "   " });
    setOverrideForLanguage("en", "nav.home", "");
    expect(getOverridesForLanguage("en")).toEqual({});
  });

  it("resets one English override and cleans empty storage", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.videos", "My Videos");
    expect(resetOverrideForLanguage("en", "nav.home").ok).toBe(true);
    expect(getOverridesForLanguage("en")).toEqual({ "nav.videos": "My Videos" });
    resetAllOverridesForLanguage("en");
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBeNull();
  });

  it("resets active custom-language overrides but preserves orphaned overrides", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    setOverrideForLanguage("id", "nav.home", "Beranda");
    expect(resetAllOverridesForLanguage("id").ok).toBe(true);
    expect(getOverridesForLanguage("id")).toEqual({});

    expect(removeCustomLanguage("id").ok).toBe(true);
    window.localStorage.setItem(languageOverridesStorageKey, '{"id":{"nav.home":"Preserve me"}}');
    const result = resetAllOverridesForLanguage("id");
    expect(result).toEqual({ ok: true, status: "unchanged" });
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe('{"id":{"nav.home":"Preserve me"}}');
  });

  it("retains malformed raw storage and blocks sanitized rewrites", () => {
    const raw = '{"id":{"nav.home":"Beranda","future":42}}';
    window.localStorage.setItem(languageOverridesStorageKey, raw);
    const inspection = inspectStoredLanguageOverrides();
    expect(inspection.rejectedRaw).toBe(raw);
    expect(getOverridesForLanguage("id")).toEqual({ "nav.home": "Beranda" });
    expect(setOverrideForLanguage("id", "nav.videos", "Video").ok).toBe(false);
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe(raw);
  });

  it("retains invalid top-level and malformed JSON exactly", () => {
    for (const raw of ["not valid json", '"string"', "[1,2,3]"]) {
      window.localStorage.setItem(languageOverridesStorageKey, raw);
      expect(getStoredLanguageOverrides()).toEqual({});
      expect(inspectStoredLanguageOverrides().rejectedRaw).toBe(raw);
      expect(setOverrideForLanguage("en", "nav.home", "Dashboard").ok).toBe(false);
      expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe(raw);
    }
  });

  it("does not choose between duplicate normalized override identities", () => {
    const raw = '{"ID":{"nav.home":"One"},"id":{"nav.home":"Two"}}';
    window.localStorage.setItem(languageOverridesStorageKey, raw);
    const inspection = inspectStoredLanguageOverrides();
    expect(inspection.classification).toBe("ambiguous");
    expect(inspection.ambiguousIdentities).toContain("id");
    expect(getOverridesForLanguage("id")).toEqual({});
    expect(setOverrideForLanguage("id", "nav.home", "Three").ok).toBe(false);
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe(raw);
  });

  it("does not choose a value from duplicate JSON Translation keys", () => {
    const raw = '{"id":{"nav.home":"One","nav.home":"Two"}}';
    window.localStorage.setItem(languageOverridesStorageKey, raw);
    expect(inspectStoredLanguageOverrides().classification).toBe("ambiguous");
    expect(getStoredLanguageOverrides()).toEqual({});
    expect(getOverridesForLanguage("id")).toEqual({});
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe(raw);
  });

  it("preserves unrelated language records during a valid mutation", () => {
    const raw = '{"jp":{"nav.home":"Home JP"},"id":{"nav.home":"Beranda"}}';
    window.localStorage.setItem(languageOverridesStorageKey, raw);
    expect(setOverrideForLanguage("ID", "nav.videos", "Video").ok).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(languageOverridesStorageKey)!)).toEqual({
      jp: { "nav.home": "Home JP" },
      id: { "nav.home": "Beranda", "nav.videos": "Video" },
    });
  });

  it("rejects stale snapshots and journal failures without override mutation", () => {
    const stale = new FailingStorage();
    stale.makeStale = true;
    expect(setOverrideForLanguage("en", "nav.home", "Dashboard", stale)).toMatchObject({ ok: false, status: "stale_snapshot" });
    expect(stale.values.get(languageOverridesStorageKey)).toBe("{}");

    const failed = new FailingStorage();
    failed.failJournalWrite = true;
    expect(setOverrideForLanguage("en", "nav.home", "Dashboard", failed).ok).toBe(false);
    expect(failed.values.has(languageOverridesStorageKey)).toBe(false);
  });

  it("never translates catalog data unless a caller incorrectly supplies it as a key", () => {
    setOverrideForLanguage("en", "Sample Video Title", "Should Not Exist");
    expect(translate("en", "nav.home", {}, getOverridesForLanguage("en"))).toBe("Home");
  });
});
