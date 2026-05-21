export const customLanguagesStorageKey = "sakurava.customLanguages.v1";
export const removedBundledLanguagesStorageKey = "sakurava.removedBundledLanguages.v1";

export type CustomLanguageMeta = {
  code: string;
  label: string;
  baseLanguage: string;
};

/** Bundled non-English languages that ship with the app but are removable. */
export const bundledLanguages: CustomLanguageMeta[] = [
  { code: "id", label: "Indonesian", baseLanguage: "en" },
];

export function getRemovedBundledLanguages(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(removedBundledLanguagesStorageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function markBundledLanguageRemoved(code: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const removed = getRemovedBundledLanguages();
  const normalizedCode = code.trim().toLowerCase();
  if (removed.includes(normalizedCode)) {
    return;
  }

  try {
    window.localStorage.setItem(
      removedBundledLanguagesStorageKey,
      JSON.stringify([...removed, normalizedCode]),
    );
  } catch {
    // Low-risk persistence.
  }
}

function unmarkBundledLanguageRemoved(code: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const removed = getRemovedBundledLanguages();
  const normalizedCode = code.trim().toLowerCase();
  const filtered = removed.filter((c) => c !== normalizedCode);

  try {
    if (filtered.length === 0) {
      window.localStorage.removeItem(removedBundledLanguagesStorageKey);
    } else {
      window.localStorage.setItem(
        removedBundledLanguagesStorageKey,
        JSON.stringify(filtered),
      );
    }
  } catch {
    // Low-risk persistence.
  }
}

export function getStoredCustomLanguages(): CustomLanguageMeta[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(customLanguagesStorageKey);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is CustomLanguageMeta =>
        item &&
        typeof item === "object" &&
        typeof item.code === "string" &&
        typeof item.label === "string" &&
        typeof item.baseLanguage === "string" &&
        item.code.trim() !== "" &&
        item.label.trim() !== "",
    );
  } catch {
    return [];
  }
}

export function addCustomLanguage(meta: CustomLanguageMeta): void {
  if (typeof window === "undefined") {
    return;
  }

  const existing = getStoredCustomLanguages();
  const normalizedCode = meta.code.trim().toLowerCase();

  // If re-adding a bundled language, unmark it as removed
  if (bundledLanguages.some((b) => b.code === normalizedCode)) {
    unmarkBundledLanguageRemoved(normalizedCode);
  }

  // Replace if exists, otherwise append
  const filtered = existing.filter(
    (lang) => lang.code.trim().toLowerCase() !== normalizedCode,
  );
  filtered.push({
    code: normalizedCode,
    label: meta.label.trim(),
    baseLanguage: (meta.baseLanguage || "en").trim().toLowerCase(),
  });

  try {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify(filtered),
    );
  } catch {
    // Custom language persistence is low-risk.
  }
}

export function removeCustomLanguage(code: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCode = code.trim().toLowerCase();

  // Cannot remove English
  if (normalizedCode === "en") {
    return;
  }

  // Mark bundled language as removed so it doesn't reappear
  if (bundledLanguages.some((b) => b.code === normalizedCode)) {
    markBundledLanguageRemoved(normalizedCode);
  }

  // Remove from custom languages storage
  const existing = getStoredCustomLanguages();
  const filtered = existing.filter(
    (lang) => lang.code.trim().toLowerCase() !== normalizedCode,
  );

  try {
    if (filtered.length === 0) {
      window.localStorage.removeItem(customLanguagesStorageKey);
    } else {
      window.localStorage.setItem(
        customLanguagesStorageKey,
        JSON.stringify(filtered),
      );
    }
  } catch {
    // Custom language persistence is low-risk.
  }
}

export function isCustomLanguageCode(code: string): boolean {
  const normalizedCode = code.trim().toLowerCase();
  return getStoredCustomLanguages().some(
    (lang) => lang.code.trim().toLowerCase() === normalizedCode,
  );
}
