import { beforeEach, describe, expect, it } from "vitest";
import {
  addCustomLanguage,
  customLanguagesStorageKey,
  getStoredCustomLanguages,
  inspectStoredCustomLanguages,
  isCustomLanguageCode,
  maxCustomLanguages,
  normalizeLanguageIdentity,
  removeCustomLanguage,
} from "./customLanguages";
import {
  defaultLanguageCode,
  getSupportedLanguages,
  languageStorageKey,
  normalizeLanguageCode,
} from "./language";
import { languageOverridesStorageKey } from "./languageOverrides";
import { translationStorageKeys, type TranslationStorage } from "./translationStorage";

class MemoryStorage implements TranslationStorage {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  failJournalWrite = false;
  corruptCustomWriteOnce = false;
  failCustomRemoval = false;
  makeStaleOnSecondSelectedRead = false;
  private selectedReads = 0;

  getItem(key: string): string | null {
    this.operations.push(`get:${key}`);
    if (key === languageStorageKey) {
      this.selectedReads += 1;
      if (this.makeStaleOnSecondSelectedRead && this.selectedReads === 2) {
        this.values.set(customLanguagesStorageKey, "[]");
      }
    }
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.operations.push(`set:${key}`);
    if (key === translationStorageKeys.transactionJournal && this.failJournalWrite) {
      throw new Error("journal unavailable");
    }
    if (key === customLanguagesStorageKey && this.corruptCustomWriteOnce) {
      this.corruptCustomWriteOnce = false;
      this.values.set(key, "corrupt");
      return;
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.operations.push(`remove:${key}`);
    if (key === customLanguagesStorageKey && this.failCustomRemoval) {
      throw new Error("custom removal unavailable");
    }
    this.values.delete(key);
  }
}

describe("custom languages", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts with English as the sole built-in language", () => {
    expect(getSupportedLanguages()).toEqual([
      { code: "en", label: "English", nativeLabel: "English" },
    ]);
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(isCustomLanguageCode("en")).toBe(false);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBeNull();
  });

  it("normalizes one identity without remapping custom codes", () => {
    expect(normalizeLanguageIdentity(" EN_us ")).toBe("en-us");
    expect(normalizeLanguageIdentity("jp")).toBe("jp");
    expect(normalizeLanguageIdentity("uk")).toBe("uk");
    expect(normalizeLanguageIdentity("custom/code")).toBe("custom/code");
    expect(normalizeLanguageIdentity("  ")).toBeNull();
  });

  it("retains malformed storage and blocks replacement", () => {
    const raw = "not json";
    window.localStorage.setItem(customLanguagesStorageKey, raw);
    const inspection = inspectStoredCustomLanguages();
    expect(inspection.rejectedRaw).toBe(raw);
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" }).ok).toBe(false);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBe(raw);
  });

  it("preserves stored code and label text while using normalized identity", () => {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "ID", label: " Indonesian ", baseLanguage: "en" }]),
    );
    expect(getStoredCustomLanguages()).toEqual([
      { code: "ID", label: " Indonesian ", baseLanguage: "en" },
    ]);
    expect(getSupportedLanguages()[1]).toEqual({
      code: "id",
      label: " Indonesian ",
      nativeLabel: " Indonesian ",
    });
    expect(normalizeLanguageCode("id")).toBe("id");
  });

  it("does not choose between duplicate normalized identities", () => {
    const raw = JSON.stringify([
      { code: "ID", label: "Indonesian", baseLanguage: "en" },
      { code: "id", label: "Bahasa Indonesia", baseLanguage: "en" },
    ]);
    window.localStorage.setItem(customLanguagesStorageKey, raw);
    const inspection = inspectStoredCustomLanguages();
    expect(inspection.classification).toBe("ambiguous");
    expect(inspection.ambiguousIdentities).toContain("id");
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(getSupportedLanguages()).toEqual([
      { code: "en", label: "English", nativeLabel: "English" },
    ]);
    expect(normalizeLanguageCode("id")).toBe(defaultLanguageCode);
    expect(removeCustomLanguage("id").ok).toBe(false);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBe(raw);
  });

  it("treats underscore and hyphen variants as one ambiguous identity", () => {
    const raw = JSON.stringify([
      { code: "en_US", label: "First", baseLanguage: "en" },
      { code: "en-us", label: "Second", baseLanguage: "en" },
    ]);
    window.localStorage.setItem(customLanguagesStorageKey, raw);
    expect(inspectStoredCustomLanguages().ambiguousIdentities).toContain("en-us");
    expect(getSupportedLanguages().map((language) => language.code)).toEqual(["en"]);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBe(raw);
  });

  it("performs no writes while inspecting custom-language storage", () => {
    const storage = new MemoryStorage();
    storage.values.set(customLanguagesStorageKey, JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]));
    expect(inspectStoredCustomLanguages(storage).languages).toHaveLength(1);
    expect(storage.operations.some((operation) => operation.startsWith("set:") || operation.startsWith("remove:"))).toBe(false);
  });

  it("does not choose a value from duplicate JSON object properties", () => {
    const raw = '[{"code":"id","code":"jp","label":"Ambiguous","baseLanguage":"en"}]';
    window.localStorage.setItem(customLanguagesStorageKey, raw);
    const inspection = inspectStoredCustomLanguages();
    expect(inspection.classification).toBe("ambiguous");
    expect(getStoredCustomLanguages()).toEqual([]);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBe(raw);
  });

  it("adds, updates, and removes custom Indonesian through journaled writes", () => {
    expect(addCustomLanguage({ code: "ID", label: "Indonesian", baseLanguage: "en" }).ok).toBe(true);
    expect(normalizeLanguageCode("id")).toBe("id");
    expect(isCustomLanguageCode("ID")).toBe(true);
    expect(addCustomLanguage({ code: "id", label: "Bahasa Indonesia", baseLanguage: "en" }).ok).toBe(true);
    expect(getStoredCustomLanguages()[0]).toEqual({ code: "id", label: "Bahasa Indonesia", baseLanguage: "en" });
    expect(window.localStorage.getItem(translationStorageKeys.transactionJournal)).toBeNull();
    expect(removeCustomLanguage("ID").ok).toBe(true);
    expect(normalizeLanguageCode("id")).toBe(defaultLanguageCode);
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBeNull();
  });

  it("removes only metadata and preserves selected and override raw state", () => {
    addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" });
    const selectedRaw = "ID";
    const overridesRaw = '{"id":{"nav.home":"Beranda khusus"}}';
    window.localStorage.setItem(languageStorageKey, selectedRaw);
    window.localStorage.setItem(languageOverridesStorageKey, overridesRaw);
    expect(removeCustomLanguage("id").ok).toBe(true);
    expect(window.localStorage.getItem(languageStorageKey)).toBe(selectedRaw);
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBe(overridesRaw);
  });

  it("protects English from replacement and removal", () => {
    expect(addCustomLanguage({ code: "EN", label: "Changed", baseLanguage: "en" }).ok).toBe(false);
    expect(removeCustomLanguage("en").ok).toBe(false);
  });

  it("permits recognized, locale-variant, and nonstandard custom codes", () => {
    for (const [code, label] of [["id", "Indonesian"], ["uk", "Ukrainian"], ["jp", "Japanese Custom"], ["EN_us", "English US Custom"]]) {
      expect(addCustomLanguage({ code, label, baseLanguage: "en" }).ok).toBe(true);
    }
    expect(getSupportedLanguages().map((language) => language.code)).toEqual(["en", "id", "uk", "jp", "en-us"]);
  });

  it("preserves unrelated stored records and unknown fields during mutation", () => {
    const existing = [{ code: "id", label: "Indonesian", baseLanguage: "en", future: { retained: true } }];
    window.localStorage.setItem(customLanguagesStorageKey, JSON.stringify(existing));
    expect(addCustomLanguage({ code: "jp", label: "Japanese Custom", baseLanguage: "en" }).ok).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(customLanguagesStorageKey)!);
    expect(stored[0]).toEqual(existing[0]);
  });

  it("rejects a stale snapshot before state-key mutation", () => {
    const storage = new MemoryStorage();
    storage.makeStaleOnSecondSelectedRead = true;
    const result = addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" }, storage);
    expect(result).toMatchObject({ ok: false, status: "stale_snapshot" });
    expect(storage.operations.filter((entry) => entry === `set:${customLanguagesStorageKey}`)).toEqual([]);
  });

  it("reports journal failures without mutating state keys", () => {
    const storage = new MemoryStorage();
    storage.failJournalWrite = true;
    const result = addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" }, storage);
    expect(result.ok).toBe(false);
    expect(storage.values.has(customLanguagesStorageKey)).toBe(false);
  });

  it("rolls back a failed state write and preserves a journal when rollback fails", () => {
    const rolledBack = new MemoryStorage();
    rolledBack.corruptCustomWriteOnce = true;
    const failed = addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" }, rolledBack);
    expect(failed).toMatchObject({ ok: false, status: "storage_failure" });
    expect(rolledBack.values.has(customLanguagesStorageKey)).toBe(false);
    expect(rolledBack.values.has(translationStorageKeys.transactionJournal)).toBe(false);

    const recovery = new MemoryStorage();
    recovery.corruptCustomWriteOnce = true;
    recovery.failCustomRemoval = true;
    const recoveryResult = addCustomLanguage({ code: "id", label: "Indonesian", baseLanguage: "en" }, recovery);
    expect(recoveryResult).toMatchObject({ ok: false, status: "transaction_recovery_required", recoveryRequired: true });
    expect(recovery.values.has(translationStorageKeys.transactionJournal)).toBe(true);
  });

  it("enforces the maximum of 25 custom languages", () => {
    for (let index = 0; index < maxCustomLanguages; index++) {
      expect(addCustomLanguage({ code: `x${index}`, label: `Custom ${index + 1}`, baseLanguage: "en" }).ok).toBe(true);
    }
    expect(addCustomLanguage({ code: "zz", label: "Overflow", baseLanguage: "en" }).ok).toBe(false);
  });
});
