import { describe, expect, it, vi } from "vitest";
import {
  decodeProtectedStateSnapshot,
  encodeProtectedStateSnapshot,
  exportProtectedStateSnapshot,
  prepareProtectedStateImport,
} from "./backupStateSnapshot";
import { translationStorageKeys, type TranslationStorage } from "./translationStorage";

function storage(initial: Record<string, string> = {}): TranslationStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function validStorage() {
  return storage({
    "sakurava.appearance.theme.v1": "dark",
    "sakurava.appearance.accent.v1": JSON.stringify({ type: "blue" }),
    "sakurava.appearance.density.v1": "compact",
    "sakurava.appearance.uiScale.v1": "110",
    "sakurava.backupRecovery.v1": JSON.stringify({
      version: 1,
      automaticBackup: {
        enabled: true,
        frequency: "weekly",
        lastSuccessfulAutomaticBackupAt: "2026-08-02T00:00:00Z",
        lastAutomaticBackupPackageName: "accepted-package",
      },
    }),
    "sakurava.catalogPreferences.v1": JSON.stringify({
      version: 1,
      toggles: {
        rememberView: true,
        rememberSort: true,
        rememberFilters: true,
      },
      pages: { videos: { view: "table", filters: { category: "Private" } } },
    }),
    "sakurava.mediaAssetRoots.v1": JSON.stringify(["D:\\Media"]),
    [translationStorageKeys.selectedLanguage]: "ja",
    [translationStorageKeys.customLanguages]: JSON.stringify([
      { code: "ja", label: "Japanese", baseLanguage: "en" },
    ]),
    [translationStorageKeys.languageOverrides]: JSON.stringify({
      ja: { "common.save": "保存" },
    }),
  });
}

describe("protected Backup state snapshot", () => {
  it("round-trips every approved owner without mutating storage", () => {
    const source = validStorage();
    const exported = exportProtectedStateSnapshot(source, {
      featureState: { cupSize: false },
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const encoded = encodeProtectedStateSnapshot(exported.value);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeProtectedStateSnapshot(encoded.value);
    expect(decoded).toEqual(exported);
    if (!decoded.ok) return;
    const prepared = prepareProtectedStateImport(decoded.value);
    expect(prepared.ok).toBe(true);
    expect(prepared.ok && prepared.value.featureState).toEqual({ cupSize: false });
    expect(source.setItem).not.toHaveBeenCalled();
    expect(source.removeItem).not.toHaveBeenCalled();
  });

  it("preserves absence separately from exact raw values", () => {
    const source = validStorage();
    const exported = exportProtectedStateSnapshot(source);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(
      exported.value.translation.values[translationStorageKeys.transactionJournal],
    ).toEqual({ present: false, raw: null });
    expect(
      exported.value.translation.values[translationStorageKeys.selectedLanguage],
    ).toEqual({ present: true, raw: "ja" });
  });

  it("rejects malformed owner state and unsupported snapshot versions", () => {
    const malformed = validStorage();
    (malformed.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === "sakurava.backupRecovery.v1" ? "{broken" : null,
    );
    expect(exportProtectedStateSnapshot(malformed)).toMatchObject({
      ok: false,
      code: "invalid_automatic_backup",
    });
    expect(
      decodeProtectedStateSnapshot(
        JSON.stringify({ format: "sakurava-protected-state", version: 2 }),
      ),
    ).toMatchObject({ ok: false, code: "invalid_snapshot" });
  });

  it("rejects protected English custom-language identity and pending journals", () => {
    const english = validStorage();
    (english.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === translationStorageKeys.customLanguages) {
        return JSON.stringify([{ code: "en", label: "English", baseLanguage: "en" }]);
      }
      return null;
    });
    expect(exportProtectedStateSnapshot(english)).toMatchObject({
      ok: false,
      code: "invalid_translation",
    });

    const pending = validStorage();
    (pending.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === translationStorageKeys.transactionJournal ? "{invalid journal" : null,
    );
    expect(exportProtectedStateSnapshot(pending)).toMatchObject({
      ok: false,
      code: "invalid_translation",
    });
  });

  it("rejects malformed pagination and feature-state contracts", () => {
    const source = validStorage();
    (source.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === "sakurava.catalog.videos.pageSize.v1" ? "999" : null,
    );
    expect(
      exportProtectedStateSnapshot(source, {
        paginationStorageKeys: ["sakurava.catalog.videos.pageSize.v1"],
      }),
    ).toMatchObject({ ok: false, code: "invalid_pagination" });
    expect(
      exportProtectedStateSnapshot(validStorage(), {
        featureState: { "invalid feature key": true },
      }),
    ).toMatchObject({ ok: false, code: "invalid_snapshot" });
  });
});
