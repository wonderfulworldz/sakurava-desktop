export const customLanguagesStorageKey = "sakurava.customLanguages.v1";
export const maxCustomLanguages = 25;

export type CustomLanguageMeta = {
  code: string;
  label: string;
  baseLanguage: string;
};

const protectedLanguageCodes = new Set(["en"]);

export type CustomLanguageMutationResult = {
  ok: boolean;
  error?: string;
};

export function normalizeCustomLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{1,15}$/.test(code) ? code : null;
}

export function normalizeCustomLanguageLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  return label.length >= 2 && label.length <= 60 ? label : null;
}

export function isProtectedLanguageCode(code: string): boolean {
  return protectedLanguageCodes.has(code.trim().toLowerCase());
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

    const result: CustomLanguageMeta[] = [];
    const seenCodes = new Set<string>();
    const seenLabels = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<CustomLanguageMeta>;
      const code = normalizeCustomLanguageCode(candidate.code);
      const label = normalizeCustomLanguageLabel(candidate.label);
      if (
        !code ||
        !label ||
        isProtectedLanguageCode(code) ||
        seenCodes.has(code) ||
        seenLabels.has(label.toLocaleLowerCase())
      ) {
        continue;
      }
      seenCodes.add(code);
      seenLabels.add(label.toLocaleLowerCase());
      result.push({ code, label, baseLanguage: "en" });
      if (result.length === maxCustomLanguages) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function addCustomLanguage(
  meta: CustomLanguageMeta,
): CustomLanguageMutationResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "Custom languages require browser storage." };
  }

  const existing = getStoredCustomLanguages();
  const normalizedCode = normalizeCustomLanguageCode(meta.code);
  const normalizedLabel = normalizeCustomLanguageLabel(meta.label);
  if (!normalizedCode || !normalizedLabel) {
    return { ok: false, error: "Language code or name is invalid." };
  }
  if (isProtectedLanguageCode(normalizedCode)) {
    return { ok: false, error: "Built-in languages cannot be replaced." };
  }
  const existingByCode = existing.find((lang) => lang.code === normalizedCode);
  if (!existingByCode && existing.length >= maxCustomLanguages) {
    return {
      ok: false,
      error: `Up to ${maxCustomLanguages} custom languages can be installed.`,
    };
  }
  if (
    existing.some(
      (lang) =>
        lang.code !== normalizedCode &&
        lang.label.toLocaleLowerCase() === normalizedLabel.toLocaleLowerCase(),
    )
  ) {
    return { ok: false, error: "A custom language with this name already exists." };
  }

  // Replace if exists, otherwise append
  const filtered = existing.filter(
    (lang) => lang.code.trim().toLowerCase() !== normalizedCode,
  );
  filtered.push({
    code: normalizedCode,
    label: normalizedLabel,
    baseLanguage: "en",
  });

  try {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify(filtered),
    );
  } catch {
    return { ok: false, error: "Custom language storage is unavailable." };
  }
  return { ok: true };
}

export function removeCustomLanguage(code: string): CustomLanguageMutationResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "Custom languages require browser storage." };
  }

  const normalizedCode = code.trim().toLowerCase();
  if (isProtectedLanguageCode(normalizedCode)) {
    return { ok: false, error: "Built-in languages cannot be removed." };
  }
  if (!isCustomLanguageCode(normalizedCode)) {
    return { ok: false, error: "Custom language was not found." };
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
    return { ok: false, error: "Custom language storage is unavailable." };
  }
  return { ok: true };
}

export function isCustomLanguageCode(code: string): boolean {
  const normalizedCode = code.trim().toLowerCase();
  return getStoredCustomLanguages().some(
    (lang) => lang.code.trim().toLowerCase() === normalizedCode,
  );
}
