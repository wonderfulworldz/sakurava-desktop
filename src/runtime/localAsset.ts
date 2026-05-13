import { convertFileSrc } from "@tauri-apps/api/core";

export function localImagePathToAssetSrc(path: string | null | undefined) {
  const normalizedPath = path?.trim();

  if (!normalizedPath || !isTauriAssetConversionAvailable()) {
    return null;
  }

  try {
    return convertFileSrc(normalizedPath);
  } catch {
    return null;
  }
}

function isTauriAssetConversionAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__?.convertFileSrc === "function"
  );
}
