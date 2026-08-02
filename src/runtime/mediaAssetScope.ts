import { invokeTauriCommand, isTauriRuntimeAvailable } from "./tauriClient";

export const MEDIA_ASSET_ROOTS_STORAGE_KEY = "sakurava.mediaAssetRoots.v1";

export type MediaAssetRootResult = {
  rootPath: string;
  success: boolean;
};

export function getStoredMediaAssetRoots() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(MEDIA_ASSET_ROOTS_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeMediaAssetRoots(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return [];
  }
}

export function storeMediaAssetRoots(roots: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    MEDIA_ASSET_ROOTS_STORAGE_KEY,
    JSON.stringify(dedupeMediaAssetRoots(roots)),
  );
}

export async function allowMediaAssetRoot(rootPath: string) {
  return invokeTauriCommand<MediaAssetRootResult>("media_asset_allow_root", {
    rootPath,
  });
}

export async function restoreStoredMediaAssetRoots() {
  const roots = getStoredMediaAssetRoots();

  if (!isTauriRuntimeAvailable() || roots.length === 0) {
    return [];
  }

  const allowedRoots: string[] = [];
  for (const root of roots) {
    try {
      const result = await allowMediaAssetRoot(root);
      if (result.success) {
        allowedRoots.push(result.rootPath);
      }
    } catch {
      continue;
    }
  }

  return allowedRoots;
}

function dedupeMediaAssetRoots(roots: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const root of roots) {
    const trimmed = root.trim();
    const key = trimmed.toLocaleLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped;
}
