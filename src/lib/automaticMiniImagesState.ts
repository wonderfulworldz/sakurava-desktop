export const AUTOMATIC_MINI_IMAGES_STORAGE_KEY = "sakurava.automaticMiniImages.v1";
export const AUTOMATIC_MINI_IMAGES_STATE_EVENT = "sakurava-automatic-mini-images-state-changed";

/** Missing, malformed, and storage failures deliberately resolve to ON. */
export function getAutomaticMiniImagesEnabled(storage: Storage | null = browserStorage()) {
  try {
    return storage?.getItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutomaticMiniImagesEnabled(enabled: boolean, storage: Storage | null = browserStorage()) {
  try {
    storage?.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    return false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTOMATIC_MINI_IMAGES_STATE_EVENT, { detail: enabled }));
  }
  return true;
}

export function automaticMiniImagesFeatureState() {
  return { [AUTOMATIC_MINI_IMAGES_STORAGE_KEY]: getAutomaticMiniImagesEnabled() };
}

export function applyAutomaticMiniImagesFeatureState(values: Readonly<Record<string, boolean>>) {
  setAutomaticMiniImagesEnabled(values[AUTOMATIC_MINI_IMAGES_STORAGE_KEY] === false ? false : true);
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}
