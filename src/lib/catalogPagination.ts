export const CATALOG_PAGE_SIZE_OPTIONS = ["32", "64", "128", "256"] as const;
export const DEFAULT_CATALOG_PAGE_SIZE = "32";

export type CatalogPageSize = (typeof CATALOG_PAGE_SIZE_OPTIONS)[number];

export function normalizeCatalogPageSize(
  value: string | null | undefined,
): CatalogPageSize {
  return CATALOG_PAGE_SIZE_OPTIONS.includes(value as CatalogPageSize)
    ? (value as CatalogPageSize)
    : DEFAULT_CATALOG_PAGE_SIZE;
}

export function readStoredCatalogPageSize(storageKey: string): CatalogPageSize {
  if (typeof window === "undefined") {
    return DEFAULT_CATALOG_PAGE_SIZE;
  }

  try {
    return normalizeCatalogPageSize(window.localStorage.getItem(storageKey));
  } catch {
    return DEFAULT_CATALOG_PAGE_SIZE;
  }
}

export function storeCatalogPageSize(storageKey: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, normalizeCatalogPageSize(value));
  } catch {
    // Page-size persistence is optional; catalog pagination still works in-memory.
  }
}
