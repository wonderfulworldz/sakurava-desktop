export const SAFE_FILTER_STORAGE_KEY = "sakurava.safeFilter.v1";
export const SAFE_FILTER_STATE_EVENT = "sakurava-safe-filter-state-changed";

/** Missing, malformed, and storage failures deliberately resolve to ON. */
export function getSafeFilterEnabled(storage: Storage | null = browserStorage()) {
  try {
    return storage?.getItem(SAFE_FILTER_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setSafeFilterEnabled(enabled: boolean, storage: Storage | null = browserStorage()) {
  try {
    storage?.setItem(SAFE_FILTER_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    return false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAFE_FILTER_STATE_EVENT, { detail: enabled }));
  }
  return true;
}

export function safeFilterFeatureState() {
  return { [SAFE_FILTER_STORAGE_KEY]: getSafeFilterEnabled() };
}

export function applySafeFilterFeatureState(values: Readonly<Record<string, boolean>>) {
  // Legacy protected state has no entry and therefore fails safe to ON.
  setSafeFilterEnabled(values[SAFE_FILTER_STORAGE_KEY] === false ? false : true);
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}
