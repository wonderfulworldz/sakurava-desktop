import { beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_PREFERENCES_STORAGE_KEY,
  getCatalogPreferenceToggles,
  readCatalogExportPreferences,
  readCatalogPreferencePage,
  resetRememberedCatalogPreferences,
  setCatalogPreferenceToggle,
  storeCatalogExportPreferences,
  storeCatalogPreferencePage,
} from "./catalogPreferences";

describe("catalog preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses safe defaults for missing, invalid, and obsolete storage", () => {
    expect(getCatalogPreferenceToggles()).toEqual({
      rememberView: false,
      rememberSort: false,
      rememberFilters: false,
    });
    window.localStorage.setItem(CATALOG_PREFERENCES_STORAGE_KEY, "{broken");
    expect(readCatalogPreferencePage("videos")).toEqual({});
    window.localStorage.setItem(
      CATALOG_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 99, toggles: { rememberView: true }, pages: {} }),
    );
    expect(getCatalogPreferenceToggles().rememberView).toBe(false);
  });

  it("persists only enabled presentation slices", () => {
    setCatalogPreferenceToggle("rememberView", true);
    setCatalogPreferenceToggle("rememberFilters", true);
    storeCatalogPreferencePage("videos", {
      view: "table",
      sort: "Last Added",
      tableSort: { value: "Title A-Z", direction: "descending" },
      filters: { activeCategoryFilters: ["Favorite"], dataFilters: { rating: "4" } },
    });

    expect(readCatalogPreferencePage("videos")).toEqual({
      view: "table",
      filters: {
        activeCategoryFilters: ["Favorite"],
        dataFilters: { rating: "4" },
      },
    });
    const stored = JSON.parse(
      window.localStorage.getItem(CATALOG_PREFERENCES_STORAGE_KEY) ?? "{}",
    );
    expect(JSON.stringify(stored)).not.toContain("searchQuery");
    expect(JSON.stringify(stored)).not.toContain("pageSize");
  });

  it("removes a durable slice when its toggle is turned off", () => {
    setCatalogPreferenceToggle("rememberSort", true);
    storeCatalogPreferencePage("glossary", {
      sort: "updated-desc",
      tableSort: { value: "az", direction: "ascending" },
    });
    setCatalogPreferenceToggle("rememberSort", false);

    expect(readCatalogPreferencePage("glossary")).toEqual({});
    expect(
      window.localStorage.getItem(CATALOG_PREFERENCES_STORAGE_KEY),
    ).not.toContain("updated-desc");
  });

  it("reset clears remembered page state and keeps toggle choices", () => {
    setCatalogPreferenceToggle("rememberView", true);
    setCatalogPreferenceToggle("rememberFilters", true);
    storeCatalogPreferencePage("categoryManagement", {
      view: "card",
      filters: ["child-only", "performers"],
    });
    resetRememberedCatalogPreferences();

    expect(readCatalogPreferencePage("categoryManagement")).toEqual({
      view: undefined,
      filters: undefined,
    });
    expect(getCatalogPreferenceToggles()).toMatchObject({
      rememberView: true,
      rememberFilters: true,
    });
  });

  it("persists export sections and format independently from Remember toggles", () => {
    storeCatalogExportPreferences({ selectedDataTypes: ["videos", "glossary"], format: "csv" });

    expect(readCatalogExportPreferences()).toEqual({
      selectedDataTypes: ["videos", "glossary"],
      format: "csv",
    });
    expect(getCatalogPreferenceToggles()).toEqual({
      rememberView: false,
      rememberSort: false,
      rememberFilters: false,
    });
  });

  it("falls back safely for invalid export preferences and clears them on reset", () => {
    window.localStorage.setItem(CATALOG_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: 1,
      toggles: {},
      pages: {},
      export: { selectedDataTypes: ["invalid"], format: "pdf" },
    }));
    expect(readCatalogExportPreferences()).toEqual({
      selectedDataTypes: ["videos", "images", "performers", "categories", "glossary", "credits"],
      format: "xlsx",
    });

    storeCatalogExportPreferences({ selectedDataTypes: ["videos"], format: "csv" });
    resetRememberedCatalogPreferences();
    expect(readCatalogExportPreferences()).toEqual({
      selectedDataTypes: ["videos", "images", "performers", "categories", "glossary", "credits"],
      format: "xlsx",
    });
  });
});

