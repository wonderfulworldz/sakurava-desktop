import { beforeEach, describe, expect, it } from "vitest";
import { addCustomLanguage, customLanguagesStorageKey, removeCustomLanguage } from "./customLanguages";
import {
  builtInLanguages,
  defaultLanguageCode,
  getBuiltInText,
  getStoredLanguageCode,
  languageStorageKey,
  normalizeLanguageCode,
  resolveAvailableLanguageCode,
  storeLanguageCode,
  translate,
} from "./language";
import { translationStorageKeys, type TranslationStorage } from "./translationStorage";

class SelectionStorage implements TranslationStorage {
  readonly values = new Map<string, string>();
  failJournal = false;
  stale = false;
  private selectedReads = 0;
  getItem(key: string): string | null {
    if (key === languageStorageKey) {
      this.selectedReads += 1;
      if (this.stale && this.selectedReads === 3) this.values.set(languageStorageKey, "changed");
    }
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === translationStorageKeys.transactionJournal && this.failJournal) throw new Error("journal unavailable");
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("language", () => {
  beforeEach(() => window.localStorage.clear());

  it("exposes English as the sole built-in and no built-in Indonesian text", () => {
    expect(defaultLanguageCode).toBe("en");
    expect(builtInLanguages).toEqual([{ code: "en", label: "English", nativeLabel: "English" }]);
    expect(getBuiltInText("en", "nav.home")).toBe("Home");
    expect(getBuiltInText("id", "nav.home")).toBeUndefined();
  });

  it("defaults unknown or uninstalled identities to English", () => {
    expect(normalizeLanguageCode("en")).toBe("en");
    expect(normalizeLanguageCode("id")).toBe(defaultLanguageCode);
    expect(resolveAvailableLanguageCode("jp")).toBeNull();
    window.localStorage.setItem(languageStorageKey, "invalid");
    expect(getStoredLanguageCode()).toBe("en");
    expect(window.localStorage.getItem(languageStorageKey)).toBe("invalid");
  });

  it("stores selected raw code with a recoverable logical transaction", () => {
    addCustomLanguage({ code: "ID", label: "Indonesian", baseLanguage: "en" });
    expect(storeLanguageCode("ID")).toMatchObject({ ok: true, status: "committed" });
    expect(window.localStorage.getItem(languageStorageKey)).toBe("ID");
    expect(getStoredLanguageCode()).toBe("id");
    expect(window.localStorage.getItem(translationStorageKeys.transactionJournal)).toBeNull();
  });

  it("rejects unknown selections without rewriting the stored value", () => {
    window.localStorage.setItem(languageStorageKey, "preserve-me");
    expect(storeLanguageCode("id")).toMatchObject({ ok: false, status: "unknown_language" });
    expect(window.localStorage.getItem(languageStorageKey)).toBe("preserve-me");
  });

  it("does not rewrite a raw value that already resolves effectively to English", () => {
    window.localStorage.setItem(languageStorageKey, "removed-custom-code");
    expect(storeLanguageCode("en")).toEqual({ ok: true, status: "unchanged" });
    expect(window.localStorage.getItem(languageStorageKey)).toBe("removed-custom-code");
  });

  it("falls back in memory after custom removal without rewriting selected raw state", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    storeLanguageCode("ID");
    expect(removeCustomLanguage("id").ok).toBe(true);
    expect(getStoredLanguageCode()).toBe("en");
    expect(window.localStorage.getItem(languageStorageKey)).toBe("ID");
  });

  it("uses custom override, English override, bundled English, then raw key", () => {
    expect(translate("id", "nav.home", {}, { "nav.home": "Beranda" }, { "nav.home": "Dashboard" })).toBe("Beranda");
    expect(translate("id", "nav.home", {}, {}, { "nav.home": "Dashboard" })).toBe("Dashboard");
    expect(translate("id", "nav.home")).toBe("Home");
    expect(translate("id", "missing.language.key")).toBe("missing.language.key");
  });

  it("falls back safely without clearing pending transaction evidence", () => {
    window.localStorage.setItem(customLanguagesStorageKey, JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]));
    window.localStorage.setItem(languageStorageKey, "id");
    const journal = '{"unreadable":"pending"}';
    window.localStorage.setItem(translationStorageKeys.transactionJournal, journal);
    expect(getStoredLanguageCode()).toBe("en");
    expect(normalizeLanguageCode("id")).toBe("en");
    expect(window.localStorage.getItem(translationStorageKeys.transactionJournal)).toBe(journal);
    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
  });

  it("surfaces stale and journal-write failure without selected-key mutation", () => {
    const stale = new SelectionStorage();
    stale.values.set(customLanguagesStorageKey, JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]));
    stale.stale = true;
    expect(storeLanguageCode("id", stale)).toMatchObject({ ok: false, status: "stale_snapshot" });
    expect(stale.values.get(languageStorageKey)).toBe("changed");

    const failed = new SelectionStorage();
    failed.values.set(customLanguagesStorageKey, JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]));
    failed.failJournal = true;
    expect(storeLanguageCode("id", failed).ok).toBe(false);
    expect(failed.values.has(languageStorageKey)).toBe(false);
  });
});
