export const GLOBAL_OUTPUT_STORAGE_KEY = "sakurava.globalOutput.v1";

export type GlobalOutputPreferences = {
  version: 1;
  parentPath: string | null;
};

export const DEFAULT_GLOBAL_OUTPUT_PREFERENCES: GlobalOutputPreferences = {
  version: 1,
  parentPath: null,
};

export function parseGlobalOutputPreferences(value: unknown): GlobalOutputPreferences {
  if (!value || typeof value !== "object") return DEFAULT_GLOBAL_OUTPUT_PREFERENCES;
  const candidate = value as Partial<GlobalOutputPreferences>;
  if (candidate.version !== 1) return DEFAULT_GLOBAL_OUTPUT_PREFERENCES;
  const parentPath = typeof candidate.parentPath === "string"
    ? candidate.parentPath.trim()
    : "";
  return {
    version: 1,
    parentPath: parentPath || null,
  };
}

export function loadGlobalOutputPreferences(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
): GlobalOutputPreferences {
  if (!storage) return DEFAULT_GLOBAL_OUTPUT_PREFERENCES;
  try {
    return parseGlobalOutputPreferences(
      JSON.parse(storage.getItem(GLOBAL_OUTPUT_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_GLOBAL_OUTPUT_PREFERENCES;
  }
}

export function saveGlobalOutputPreferences(
  preferences: GlobalOutputPreferences,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storage) return false;
  try {
    storage.setItem(
      GLOBAL_OUTPUT_STORAGE_KEY,
      JSON.stringify(parseGlobalOutputPreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}

export function getGlobalOutputParent() {
  return loadGlobalOutputPreferences().parentPath;
}
