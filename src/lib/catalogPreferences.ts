import type { ExportCsvEntity, ExportFormat } from "./exportCsv";

export const CATALOG_PREFERENCES_STORAGE_KEY = "sakurava.catalogPreferences.v1";

const exportDataTypes: ExportCsvEntity[] = [
  "videos", "images", "performers", "categories", "glossary", "credits",
];

export type CatalogPreferencePage =
  | "videos"
  | "images"
  | "performers"
  | "categories"
  | "categoryManagement"
  | "glossary";

export type CatalogPreferenceToggles = {
  rememberView: boolean;
  rememberSort: boolean;
  rememberFilters: boolean;
};

export type CatalogPreferenceTableSort = {
  value: string;
  direction: "ascending" | "descending";
};

export type CatalogPreferencePageState = {
  view?: string;
  sort?: string;
  tableSort?: CatalogPreferenceTableSort | null;
  filters?: unknown;
};

export type CatalogExportPreferences = {
  selectedDataTypes: ExportCsvEntity[];
  format: ExportFormat;
};

type CatalogPreferences = {
  version: 1;
  toggles: CatalogPreferenceToggles;
  pages: Partial<Record<CatalogPreferencePage, CatalogPreferencePageState>>;
  export?: CatalogExportPreferences;
};

const defaultToggles: CatalogPreferenceToggles = {
  rememberView: false,
  rememberSort: false,
  rememberFilters: false,
};

const approvedPages = new Set<CatalogPreferencePage>([
  "videos",
  "images",
  "performers",
  "categories",
  "categoryManagement",
  "glossary",
]);

function emptyPreferences(): CatalogPreferences {
  return { version: 1, toggles: { ...defaultToggles }, pages: {} };
}

function defaultExportPreferences(): CatalogExportPreferences {
  return { selectedDataTypes: [...exportDataTypes], format: "xlsx" };
}

function normalizeExportPreferences(value: unknown): CatalogExportPreferences | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const selectedDataTypes = (value as { selectedDataTypes?: unknown }).selectedDataTypes;
  const format = (value as { format?: unknown }).format;
  if (
    !Array.isArray(selectedDataTypes)
    || !selectedDataTypes.every((dataType) => exportDataTypes.includes(dataType as ExportCsvEntity))
    || new Set(selectedDataTypes).size !== selectedDataTypes.length
    || (format !== "csv" && format !== "xlsx")
  ) {
    return undefined;
  }
  return {
    selectedDataTypes: exportDataTypes.filter((dataType) => selectedDataTypes.includes(dataType)),
    format,
  };
}

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeTableSort(value: unknown): CatalogPreferenceTableSort | null | undefined {
  if (value === null) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { value?: unknown }).value === "string" &&
    ((value as { direction?: unknown }).direction === "ascending" ||
      (value as { direction?: unknown }).direction === "descending")
  ) {
    return {
      value: (value as { value: string }).value,
      direction: (value as { direction: "ascending" | "descending" }).direction,
    };
  }
  return undefined;
}

function normalizePreferences(value: unknown): CatalogPreferences {
  const fallback = emptyPreferences();
  if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== 1) {
    return fallback;
  }

  const rawToggles = (value as { toggles?: unknown }).toggles;
  if (typeof rawToggles === "object" && rawToggles !== null) {
    fallback.toggles = {
      rememberView: (rawToggles as { rememberView?: unknown }).rememberView === true,
      rememberSort: (rawToggles as { rememberSort?: unknown }).rememberSort === true,
      rememberFilters: (rawToggles as { rememberFilters?: unknown }).rememberFilters === true,
    };
  }

  const rawPages = (value as { pages?: unknown }).pages;
  const exportPreferences = normalizeExportPreferences((value as { export?: unknown }).export);
  if (exportPreferences) fallback.export = exportPreferences;
  if (typeof rawPages !== "object" || rawPages === null) return fallback;

  for (const [page, rawState] of Object.entries(rawPages)) {
    if (!approvedPages.has(page as CatalogPreferencePage) || typeof rawState !== "object" || rawState === null) {
      continue;
    }
    const state: CatalogPreferencePageState = {};
    if (typeof (rawState as { view?: unknown }).view === "string") {
      state.view = (rawState as { view: string }).view;
    }
    if (typeof (rawState as { sort?: unknown }).sort === "string") {
      state.sort = (rawState as { sort: string }).sort;
    }
    const tableSort = normalizeTableSort((rawState as { tableSort?: unknown }).tableSort);
    if (tableSort !== undefined) state.tableSort = tableSort;
    if ("filters" in rawState) state.filters = (rawState as { filters?: unknown }).filters;
    fallback.pages[page as CatalogPreferencePage] = state;
  }
  return fallback;
}

function readPreferences(): CatalogPreferences {
  if (!storageAvailable()) return emptyPreferences();
  try {
    const raw = window.localStorage.getItem(CATALOG_PREFERENCES_STORAGE_KEY);
    return raw ? normalizePreferences(JSON.parse(raw)) : emptyPreferences();
  } catch {
    return emptyPreferences();
  }
}

function writePreferences(preferences: CatalogPreferences) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(CATALOG_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; storage failures must not break catalog use.
  }
}

export function getCatalogPreferenceToggles(): CatalogPreferenceToggles {
  return readPreferences().toggles;
}

export function setCatalogPreferenceToggle(
  key: keyof CatalogPreferenceToggles,
  enabled: boolean,
) {
  const preferences = readPreferences();
  preferences.toggles[key] = enabled;
  if (!enabled) {
    for (const state of Object.values(preferences.pages)) {
      if (!state) continue;
      if (key === "rememberView") delete state.view;
      if (key === "rememberSort") {
        delete state.sort;
        delete state.tableSort;
      }
      if (key === "rememberFilters") delete state.filters;
    }
  }
  writePreferences(preferences);
}

export function readCatalogPreferencePage(
  page: CatalogPreferencePage,
): CatalogPreferencePageState {
  const preferences = readPreferences();
  const state = preferences.pages[page] ?? {};
  return {
    ...(preferences.toggles.rememberView ? { view: state.view } : {}),
    ...(preferences.toggles.rememberSort
      ? { sort: state.sort, tableSort: state.tableSort }
      : {}),
    ...(preferences.toggles.rememberFilters ? { filters: state.filters } : {}),
  };
}

export function storeCatalogPreferencePage(
  page: CatalogPreferencePage,
  next: CatalogPreferencePageState,
) {
  const preferences = readPreferences();
  const current = preferences.pages[page] ?? {};
  if (preferences.toggles.rememberView && typeof next.view === "string") current.view = next.view;
  if (preferences.toggles.rememberSort) {
    if (typeof next.sort === "string") current.sort = next.sort;
    if (next.tableSort === null || normalizeTableSort(next.tableSort)) {
      current.tableSort = next.tableSort;
    }
  }
  if (preferences.toggles.rememberFilters && "filters" in next) current.filters = next.filters;
  preferences.pages[page] = current;
  writePreferences(preferences);
}

export function readCatalogExportPreferences(): CatalogExportPreferences {
  return readPreferences().export ?? defaultExportPreferences();
}

export function storeCatalogExportPreferences(next: CatalogExportPreferences) {
  const preferences = readPreferences();
  preferences.export = normalizeExportPreferences(next) ?? defaultExportPreferences();
  writePreferences(preferences);
}

export function resetRememberedCatalogPreferences() {
  const preferences = readPreferences();
  preferences.pages = {};
  delete preferences.export;
  writePreferences(preferences);
}

