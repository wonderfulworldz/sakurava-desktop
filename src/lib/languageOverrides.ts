import type { LanguageCode } from "./language";

export const languageOverridesStorageKey = "sakurava.languageOverrides.v1";

type LanguageOverrides = Partial<Record<LanguageCode, Record<string, string>>>;

export function getStoredLanguageOverrides(): LanguageOverrides {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(languageOverridesStorageKey);
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as LanguageOverrides;
  } catch {
    return {};
  }
}

export function getOverridesForLanguage(
  languageCode: LanguageCode,
): Record<string, string> {
  const overrides = getStoredLanguageOverrides();
  return overrides[languageCode] ?? {};
}

export function setOverrideForLanguage(
  languageCode: LanguageCode,
  key: string,
  value: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const overrides = getStoredLanguageOverrides();
  const languageOverrides = overrides[languageCode] ?? {};

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    delete languageOverrides[key];
  } else {
    languageOverrides[key] = trimmedValue;
  }

  const nextOverrides: LanguageOverrides = { ...overrides };
  if (Object.keys(languageOverrides).length === 0) {
    delete nextOverrides[languageCode];
  } else {
    nextOverrides[languageCode] = languageOverrides;
  }

  try {
    if (Object.keys(nextOverrides).length === 0) {
      window.localStorage.removeItem(languageOverridesStorageKey);
    } else {
      window.localStorage.setItem(
        languageOverridesStorageKey,
        JSON.stringify(nextOverrides),
      );
    }
  } catch {
    // Override persistence is low-risk. Failed writes should not crash the app.
  }
}

export function resetOverrideForLanguage(
  languageCode: LanguageCode,
  key: string,
): void {
  setOverrideForLanguage(languageCode, key, "");
}

export function resetAllOverridesForLanguage(languageCode: LanguageCode): void {
  if (typeof window === "undefined") {
    return;
  }

  const overrides = getStoredLanguageOverrides();
  delete overrides[languageCode];

  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(languageOverridesStorageKey);
    } else {
      window.localStorage.setItem(
        languageOverridesStorageKey,
        JSON.stringify(overrides),
      );
    }
  } catch {
    // Override persistence is low-risk. Failed writes should not crash the app.
  }
}
