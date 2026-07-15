import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";
import App from "./App";
import StickyHorizontalScroll from "./components/StickyHorizontalScroll";
import GlobalImageViewer from "./components/gallery/GlobalImageViewer";
import GlobalImageViewerWindow from "./components/gallery/GlobalImageViewerWindow";
import CategoriesPage from "./pages/CategoriesPage";
import {
  appearanceAccentStorageKey,
  appearanceDensityStorageKey,
  appearanceThemeStorageKey,
  appearanceUiScaleStorageKey,
} from "./lib/appearanceTheme";
import { formatDateOnlyDisplay, formatLocalTimestampDisplay } from "./lib/dateDisplay";
import { buildGlossaryCsv, buildVideosCsv, sakuravaRef } from "./lib/exportCsv";
import { EXPORT_CONTRACT_VERSION } from "./lib/exportWorkbook";
import {
  getAllTranslationKeys,
  getKeyDescription,
  languageStorageKey,
} from "./lib/language";
import {
  customLanguagesStorageKey,
  maxCustomLanguages,
} from "./lib/customLanguages";
import { languageOverridesStorageKey } from "./lib/languageOverrides";
import { rankPickerSearchResults } from "./lib/relatedPicker";
import { clearAllSessionFilterStateForTests } from "./lib/sessionFilterState";
import {
  BACKUP_RECOVERY_STORAGE_KEY,
  defaultBackupRecoverySettings,
  loadBackupRecoverySettings,
  resetAutomaticBackupRuntimeStateForTests,
} from "./lib/automaticBackup";
import tailwindConfig from "../tailwind.config";

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMocks.open,
  save: dialogMocks.save,
}));

type TestTauriInvoke = NonNullable<Window["__TAURI_INTERNALS__"]>["invoke"];

type TestTauriEventCallback = (event: {
  event: string;
  id: number;
  payload: any;
}) => void;

describe("date display helpers", () => {
  it("formats date-only values with padded days without timezone shifting", () => {
    expect(formatDateOnlyDisplay("2026-02-02")).toBe("Feb 02, 2026");
    expect(formatDateOnlyDisplay("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("formats local timestamps without forcing UTC", () => {
    const localTimestamp = new Date(2026, 1, 2, 3, 4).getTime();
    const formatted = formatLocalTimestampDisplay(localTimestamp);

    expect(formatted).toMatch(/^Feb 02, 2026,/);
    expect(formatted).not.toContain("2026-02-02");
  });
});

describe("picker search ranking", () => {
  const itemFields = (item: {
    id: string;
    title: string;
    secondary?: string[];
  }) => ({
    id: item.id,
    primary: item.title,
    secondary: item.secondary ?? [],
  });

  it("matches 1-character queries by token prefix only", () => {
    const results = rankPickerSearchResults(
      [
        { id: "1", title: "Abc" },
        { id: "2", title: "B Aa" },
        { id: "3", title: "Cba" },
        { id: "4", title: "1ab" },
      ],
      "A",
      itemFields,
    );

    expect(results.map((item) => item.title)).toEqual(["Abc", "B Aa"]);
  });

  it("allows 2+ character contains while ranking prefix results first", () => {
    const results = rankPickerSearchResults(
      [
        { id: "contains", title: "1ab" },
        { id: "prefix-b", title: "Abd" },
        { id: "prefix-a", title: "Abc" },
        { id: "miss", title: "A bc" },
      ],
      "Ab",
      itemFields,
    );

    expect(results.map((item) => item.title)).toEqual(["Abc", "Abd", "1ab"]);
  });

  it("ranks secondary field matches after primary matches and normalizes diacritics", () => {
    const results = rankPickerSearchResults(
      [
        { id: "secondary", title: "Bravo", secondary: ["Ábaco"] },
        { id: "primary", title: "Ábaco" },
        { id: "contains", title: "X ab" },
      ],
      "aba",
      itemFields,
    );

    expect(results.map((item) => item.id)).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("returns full deterministic ranked results unless a caller requests a limit", () => {
    const items = Array.from({ length: 35 }, (_, index) => ({
      id: `item-${index}`,
      title: `Alpha ${String(index).padStart(2, "0")}`,
    }));
    const results = rankPickerSearchResults(
      items,
      "alpha",
      itemFields,
    );
    const limitedResults = rankPickerSearchResults(items, "alpha", itemFields, 30);

    expect(results).toHaveLength(35);
    expect(results[0]?.title).toBe("Alpha 00");
    expect(results[34]?.title).toBe("Alpha 34");
    expect(limitedResults).toHaveLength(30);
    expect(limitedResults[29]?.title).toBe("Alpha 29");
  });
});

function createTauriEventHarness() {
  let nextCallbackId = 1;
  const callbacks = new Map<number, TestTauriEventCallback>();
  const listenersByEvent = new Map<string, number>();

  return {
    callbacks,
    listenersByEvent,
    transformCallback: vi.fn((callback: TestTauriEventCallback) => {
      const callbackId = nextCallbackId;
      nextCallbackId += 1;
      callbacks.set(callbackId, callback);
      return callbackId;
    }),
  };
}

function confirmDialog(confirmName: string | RegExp) {
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: confirmName }));
}

function clickAndConfirm(
  buttonName: string | RegExp,
  confirmName: string | RegExp,
) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  confirmDialog(confirmName);
}

function clickSaveAndConfirm() {
  clickAndConfirm("Save", /^(Save|Save changes)$/);
}

function clickSaveEntryAndConfirm() {
  clickAndConfirm(/^(Save Entry|Save Category)$/, /^(Save|Save changes)$/);
}

function selectCategoryFilter(optionName: string) {
  if (!screen.queryByRole("listbox", { name: "Category filter options" })) {
    fireEvent.click(screen.getByTestId("category-management-filter-control"));
  }
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function catalogSortControl(kind: "videos" | "images" | "performers") {
  return screen.getByTestId(`${kind}.sort-sort-control`);
}

function selectCatalogSort(
  kind: "videos" | "images" | "performers",
  optionName: string,
) {
  fireEvent.click(catalogSortControl(kind));
  fireEvent.click(
    within(screen.getByRole("listbox", { name: "Sort options" }))
      .getByRole("option", { name: optionName }),
  );
}

function catalogColumnWidths(kind: "videos" | "images" | "performers") {
  return Array.from(screen.getByTestId(`${kind}-catalog-table-colgroup`).children)
    .map((column) => ({
      id: column.getAttribute("data-column-id"),
      width: (column as HTMLElement).style.width,
    }));
}

function catalogTableInlineWidth(kind: "videos" | "images" | "performers") {
  const table = screen.getByTestId(`${kind}-catalog-table`) as HTMLElement;
  return {
    minWidth: table.style.minWidth,
    width: table.style.width,
  };
}

function selectCategorySort(optionName: string) {
  fireEvent.click(screen.getByRole("button", { name: "Sort" }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function testBackupPackage(
  packageName: string,
  backupType: "manual" | "automatic" | "safety" = "manual",
  note = "",
) {
  return {
    packageName,
    packagePath: `C:/App/backups/${packageName}`,
    manifest: {
      format: "sakurava-backup-directory",
      version: 1,
      createdAt: "2026-07-06T12:00:00Z",
      backupType,
      note,
      includes: {
        database: true,
        originalMedia: false,
        appManagedAssets: false,
      },
      database: { file: "sakurava.sqlite" },
    },
  };
}

function testBackupPreview(packageName: string) {
  return {
    packageName,
    manifest: testBackupPackage(packageName).manifest,
    database: {
      file: "sakurava.sqlite",
      quickCheck: "ok",
      requiredSchemaPresent: true,
      counts: {
        videos: 11,
        images: 12,
        performers: 13,
        categories: 14,
        glossary: 15,
        credits: 16,
      },
    },
    content: {
      databaseIncluded: true,
      originalMediaIncluded: false,
      appManagedAssetsIncluded: false,
    },
    warnings: ["Package v1 excludes app-managed assets."],
    errors: [],
  };
}

async function clickHistoryRestore(packageName: string) {
  await clickHistoryAction(packageName, "Restore");
}

async function confirmPackageRestore() {
  const dialog = await screen.findByRole("dialog", { name: "Restore this backup?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Restore Backup" }));
}

async function clickHistoryAction(
  packageName: string,
  action: "Restore" | "Download" | "Delete",
) {
  const moreButton = await screen.findByRole("button", {
    name: `More backup actions ${packageName}`,
  });
  fireEvent.click(moreButton);
  fireEvent.click(await screen.findByRole("menuitem", { name: action }));
}

describe("App", () => {
  let systemThemeDark = false;
  let systemThemeListeners = new Set<(event: MediaQueryListEvent) => void>();

  afterEach(() => {
    cleanup();
    document
      .querySelectorAll("[data-memory-popup]")
      .forEach((popup) => popup.remove());
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useRealTimers();
    window.history.pushState({}, "", "/");
    delete window.__TAURI_INTERNALS__;
    delete (window as Partial<Window>).__TAURI_EVENT_PLUGIN_INTERNALS__;
    window.localStorage.clear();
    resetAutomaticBackupRuntimeStateForTests();
    clearAllSessionFilterStateForTests();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    delete document.documentElement.dataset.accent;
    delete document.documentElement.dataset.density;
    delete document.documentElement.dataset.uiScale;
    document.documentElement.style.removeProperty("--appearance-accent");
    systemThemeDark = false;
    systemThemeListeners = new Set();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: systemThemeDark,
        media: query,
        onchange: null,
        addEventListener: (
          event: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (event === "change") systemThemeListeners.add(listener);
        },
        removeEventListener: (
          event: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (event === "change") systemThemeListeners.delete(listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: undefined,
    });
    dialogMocks.open.mockReset();
    dialogMocks.save.mockReset();
  });

  it("renders the app shell and Home page", () => {
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "Home" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Sakurava")).not.toBeInTheDocument();
    const logo = screen.getByRole("img", { name: "Sakurava logo" });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/assets/sakurava-logo-v1.svg");
    expect(logo.parentElement).not.toHaveClass("bg-sakura-500");
    expect(
      screen.queryByPlaceholderText("Home search planned"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Home filters planned" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Welcome to Sakurava")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /videos/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /images/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /performers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /categories/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /glossary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Local mode")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Storage status placeholder"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Last update placeholder")).not.toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(screen.getByText("Continue Cataloging")).toBeInTheDocument();
    expect(screen.getByText("No records yet.")).toBeInTheDocument();
    expect(screen.getByText(/No recent records yet/i)).toBeInTheDocument();
    expect(document.querySelector(".home-accent-streak")).not.toBeNull();
    expect(document.querySelector(".home-accent-streak-strong")).not.toBeNull();
    expect(document.querySelector(".bg-rose-300\\/40")).toBeNull();
  });

  it("collapses and expands the sidebar without changing navigation", () => {
    render(<App />);

    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Navigate to Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByText("Private local catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Offline first")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Navigate to Settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("link", { name: "Navigate to Glossary" }),
    ).toHaveAttribute("href", "/glossary");

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Private local catalog")).toBeInTheDocument();
    expect(screen.queryByText("Offline first")).not.toBeInTheDocument();
    expect(screen.queryByText(/Static frontend preview/i)).not.toBeInTheDocument();
  });

  it("keeps main navigation separate and places Glossary above Settings", () => {
    render(<App />);

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(primaryNavigation).getAllByRole("link").map((link) =>
        link.getAttribute("href")
      ),
    ).toEqual([
      "/",
      "/videos",
      "/images",
      "/performers",
      "/settings/category-management",
    ]);

    const supportNavigation = screen.getByRole("navigation", {
      name: "Support navigation",
    });
    expect(
      within(supportNavigation).getAllByRole("link").map((link) =>
        link.getAttribute("href")
      ),
    ).toEqual(["/glossary", "/settings"]);
    expect(
      within(supportNavigation)
        .getByRole("link", { name: "Navigate to Glossary" })
        .querySelector("svg"),
    ).not.toBeNull();
  });

  it("opens the Glossary Library shell from the sidebar", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Navigate to Glossary" }));

    expect(
      await screen.findByRole("heading", { name: "Glossary Library" }),
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: "Glossary Library" });
    expect(heading).toHaveClass("text-4xl", "font-semibold", "tracking-normal");
    expect(
      screen.getByText(
        "Store and manage definitions, references, and terms for your personal use.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Entry" }))
      .toHaveClass("bg-sakura-500", "text-white");
    expect(screen.queryByText("Reference Library")).not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Alias Mapping" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Glossary entries are independent/))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Navigate to Settings" }))
      .toHaveAttribute("href", "/settings");
  });

  it("opens the non-persistent Glossary add form and validates required fields", async () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));

    expect(screen.getByRole("heading", { name: "Add Glossary Entry" }))
      .toBeInTheDocument();
    expect(screen.queryByText("Add state")).not.toBeInTheDocument();
    for (const field of [
      "Term",
      "Synonyms",
      "Search glossary parent terms",
      "Thumbnail",
      "Source Title",
      "Source URL",
      "Definition",
    ]) {
      expect(screen.getByLabelText(field)).toBeInTheDocument();
    }
    expect(screen.getByRole("switch", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Favorite" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("Term").closest("label"))
      .toHaveTextContent("Term *");
    expect(screen.getByLabelText("Definition").closest("label"))
      .toHaveTextContent("Definition *");

    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));

    expect(await screen.findByText("Term is required.")).toBeInTheDocument();
    expect(screen.getByText("Definition is required.")).toBeInTheDocument();
  });

  it("supports local-only Glossary form fields and synonym chips", async () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "Temporary Term" },
    });
    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Temporary definition preview only." },
    });
    fireEvent.focus(screen.getByLabelText("Search glossary parent terms"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select glossary parent Alias Mapping",
      }),
    );
    fireEvent.change(screen.getByLabelText("Thumbnail"), {
      target: { value: "D:/Reference/thumb.png" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Favorite" }));
    fireEvent.change(screen.getByLabelText("Source Title"), {
      target: { value: "Temporary source" },
    });
    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "https://example.invalid/source" },
    });
    fireEvent.change(screen.getByLabelText("Synonyms"), {
      target: { value: "Synonyms1,Synonyms2,Synonyms3," },
    });

    expect(screen.getByRole("button", { name: "Remove synonym Synonyms1" }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Search glossary parent terms"))
        .toHaveDisplayValue("Alias Mapping");
    });
    expect(screen.getByRole("switch", { name: "Favorite" }))
      .toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Remove synonym Synonyms2" }));
    expect(screen.queryByRole("button", { name: "Remove synonym Synonyms2" }))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Synonyms"), {
      target: { value: "Preview chip" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add synonym" }));
    expect(screen.getByRole("button", { name: "Remove synonym Preview chip" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));

    expect(
      await screen.findByText(
        "Open the desktop app to save Glossary entries.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Temporary Term")).not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Alias Mapping" }),
    ).toBeInTheDocument();
  });

  it("validates Glossary Source URL without opening external links", async () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "URL Term" },
    });
    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Definition with invalid URL." },
    });
    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "example.invalid/source" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));

    expect(
      await screen.findByText("Source URL must start with http:// or https://."),
    ).toBeInTheDocument();
  });

  it("cancels the local-only Glossary form and clears temporary fields", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "Clear Me" },
    });
    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Clear this definition." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard changes?" }))
      .toBeInTheDocument();
    confirmDialog("Discard");
    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
    expect(screen.getByLabelText("Term")).toHaveValue("");
    expect(screen.getByLabelText("Definition")).toHaveValue("");
  });

  it("opens a static Glossary row on click without mutating the table", async () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.click(screen.getByRole("row", { name: "Edit glossary entry Alias Mapping" }));

    expect(screen.getByLabelText("Term")).toHaveValue("Alias Mapping");
    expect(screen.getByLabelText("Source Title"))
      .toHaveValue("Internal reference note");
    expect(screen.getByRole("heading", { name: "Edit Glossary Entry" }))
      .toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "Changed Alias Mapping" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Entry" }));

    expect(
      await screen.findByText(
        "Open the desktop app to save Glossary entries.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Alias Mapping" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Changed Alias Mapping")).not.toBeInTheDocument();
  });

  it("renders the static Glossary table columns and rows-per-page options", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    const table = screen.getByRole("table");
    const tableScroll = screen.getByTestId("glossary-table-scroll");
    expect(tableScroll).toHaveClass("sticky-horizontal-scroll-body", "overflow-x-auto");
    expect(tableScroll.closest("[data-sticky-horizontal-scroll='true']"))
      .toHaveClass("sticky-horizontal-scroll-frame");
    expect(tableScroll.className).not.toContain("px-");
    expect(tableScroll.className).not.toContain("mx-");
    expect(table.className).not.toContain("sakura");
    expect(screen.getByTestId("glossary-sort-control").closest(".relative")?.querySelector("svg"))
      .not.toBeNull();
    expect(screen.getByTestId("glossary-category-filter-control").closest(".relative")?.querySelector("svg"))
      .not.toBeNull();

    for (const column of ["TERM", "SYNONYMS", "CATEGORIES", "DEFINITION", "SOURCE"]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "Thumbnail" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Favorite" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Thumbnail")).not.toBeInTheDocument();
    expect(screen.queryByText("Favorite")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Action" }))
      .not.toBeInTheDocument();

    expect(
      screen.getByRole("row", { name: "Edit glossary entry Alias Mapping" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Source Citation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Nested Child" }),
    ).toBeInTheDocument();
    const aliasRow = screen.getByRole("row", {
      name: "Edit glossary entry Alias Mapping",
    });
    expect(aliasRow).toHaveAttribute("data-glossary-row-kind", "parent");
    expect(aliasRow.querySelector("td:first-child button")).toHaveAttribute(
      "aria-label",
      "Collapse glossary children for Alias Mapping",
    );
    expect(within(aliasRow).getByTitle("Alias Mapping")).toHaveClass("truncate");
    const aliasPlaceholder = within(aliasRow).getByLabelText(
      "Alias Mapping thumbnail not available",
    );
    expect(aliasPlaceholder).not.toHaveTextContent("N/A");
    expect(aliasPlaceholder.querySelector("svg")).not.toBeNull();
    expect(aliasPlaceholder).toHaveClass("glossary-thumbnail-box", "aspect-square", "size-11");
    expect(
      screen.getByTitle(
        "A reference note that tracks alternate names for a term without changing performer aliases or catalog metadata.",
      ),
    ).toHaveClass("truncate");
    expect(within(aliasRow).getByText("+3"))
      .toHaveAttribute("title", "Alternate name, Nickname, Reference alias");
    expect(within(aliasRow).queryByText("Alternate name")).not.toBeInTheDocument();
    expect(within(aliasRow).queryByText("Nickname")).not.toBeInTheDocument();
    const nestedChildRow = screen.getByRole("row", {
      name: "Edit glossary entry Nested Child",
    });
    expect(nestedChildRow).toHaveAttribute(
      "data-glossary-child-indent",
      "from-thumbnail",
    );
    const nestedChildPlaceholder = within(nestedChildRow).getByLabelText(
      "Nested Child thumbnail not available",
    );
    expect(nestedChildPlaceholder).toHaveClass(
      "glossary-thumbnail-box",
      "aspect-square",
      "size-11",
    );
    expect(nestedChildPlaceholder.parentElement).toHaveClass("ml-6");
    expect(within(nestedChildRow).getByRole("button", {
      name: "Toggle favorite Nested Child",
    })).toHaveClass("ml-6");
    const localReferenceRow = screen.getByRole("row", {
      name: "Edit glossary entry Local Reference",
    });
    expect(localReferenceRow).toHaveAttribute("data-glossary-row-kind", "parent");
    expect(within(localReferenceRow).getAllByText("N/A").length)
      .toBeGreaterThanOrEqual(4);
    expect(within(localReferenceRow).getAllByTitle("N/A")[0])
      .toHaveClass("inline-flex");
    expect(screen.getByRole("link", { name: "Open source Internal reference note" }))
      .toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Open source Internal reference note" }))
      .toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("link", { name: "Open source Internal reference note" }))
      .toHaveClass("truncate");
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.getByText("Page size")).toBeInTheDocument();
    expect(screen.getByText("per page")).toBeInTheDocument();
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Terms per page")).toHaveDisplayValue("32");
    for (const pageSize of ["32", "64", "128", "256"]) {
      expect(
        within(screen.getByLabelText("Terms per page")).getByRole("option", {
          name: pageSize,
        }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByLabelText("Terms per page control"));
    expect(
      screen.getByRole("listbox", {
        name: "Terms per page options",
      }).parentElement,
    ).toHaveAttribute("data-placement", "down");
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("expands and collapses Glossary parent rows without opening edit", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    const childRow = screen.getByRole("row", {
      name: "Edit glossary entry Category Drift",
    });
    expect(childRow).toHaveAttribute("data-glossary-row-depth", "1");
    expect(childRow).toHaveAttribute("data-glossary-row-kind", "parent");
    expect(childRow.querySelector("td:first-child button")).toHaveAttribute(
      "aria-label",
      "Collapse glossary children for Category Drift",
    );
    expect(
      (childRow.querySelector("td:first-child") as HTMLTableCellElement).style
        .paddingLeft,
    ).toBe("2rem");
    const nestedChildRow = screen.getByRole("row", {
      name: "Edit glossary entry Nested Child",
    });
    expect(nestedChildRow.querySelector("td:first-child [data-glossary-hierarchy-spacer]"))
      .not.toBeNull();
    expect(
      (nestedChildRow.querySelector("td:first-child") as HTMLTableCellElement)
        .style.paddingLeft,
    ).toBe("3.25rem");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Collapse glossary children for Alias Mapping",
      }),
    );

    expect(screen.queryByLabelText("Term")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry Nested Child" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand glossary children for Alias Mapping",
      }),
    );

    expect(
      screen.getByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).toHaveAttribute("data-glossary-row-depth", "1");
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Nested Child" }),
    ).toHaveAttribute("data-glossary-row-depth", "2");
  });

  it("filters static Glossary entries by search and category", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    const glossaryFilterControl = screen.getByTestId("glossary-category-filter-control");

    expect(screen.getByPlaceholderText("Search terms...")).toBeInTheDocument();
    expect(
      within(glossaryFilterControl).queryByRole("searchbox"),
    ).not.toBeInTheDocument();
    expect(glossaryFilterControl.parentElement).toHaveClass("shrink-0", "sm:w-auto");
    expect(within(glossaryFilterControl).queryByText("Categories")).not.toBeInTheDocument();
    const zeroSelectedBadge = screen.getByLabelText("0 active filters");
    expect(zeroSelectedBadge).toBeInTheDocument();
    expect(zeroSelectedBadge).toHaveTextContent("0");
    expect(screen.queryByText("All parent terms")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sort")).toBeInTheDocument();
    const sortPicker = screen.getByLabelText("Sort").closest("div") as HTMLElement;
    expect(sortPicker.querySelector("svg.lucide-arrow-up-down")).not.toBeNull();
    expect(sortPicker.querySelector("svg.lucide-search")).toBeNull();
    expect(screen.queryByText("View")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search terms"), {
      target: { value: "taxonomy" },
    });

    expect(screen.queryByLabelText("Glossary active filters")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove filter Search: taxonomy" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all filters" }))
      .not.toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry Alias Mapping" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear glossary search" }));
    expect(screen.getByLabelText("Search terms")).toHaveValue("");
    expect(screen.queryByLabelText("Glossary active filters")).not.toBeInTheDocument();

    fireEvent.click(glossaryFilterControl);
    expect(
      within(screen.getByRole("listbox", { name: "Category filter options" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["All", "Parents Only", "Children Only"]);
    expect(
      within(screen.getByRole("listbox", { name: "Category filter options" })).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Parents Only" }));

    expect(within(glossaryFilterControl).queryByText("Categories")).not.toBeInTheDocument();
    const oneSelectedBadge = screen.getByLabelText("1 active filters");
    expect(oneSelectedBadge).toBeInTheDocument();
    expect(oneSelectedBadge).toHaveClass("rounded-md");
    expect(oneSelectedBadge).not.toHaveClass("rounded-full");
    const categoryFilterBadge = screen.getByTestId("glossary-category-filter-badge");
    const categoryFilterChevron = screen.getByTestId("glossary-category-filter-chevron");
    expect(
      categoryFilterBadge.compareDocumentPosition(categoryFilterChevron)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove filter Filter: Parents Only" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter Filter: Parents Only" }),
    ).toHaveTextContent("Filter: Parents Only");
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry Source Citation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Filter: Parents Only" }));
    fireEvent.click(glossaryFilterControl);
    fireEvent.click(
      screen.getByRole("option", { name: "Children Only" }),
    );

    expect(within(glossaryFilterControl).queryByText("Categories")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter Filter: Children Only" }))
      .toHaveTextContent("Filter: Children Only");
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Source Citation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry AAA Standalone" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(within(glossaryFilterControl).queryByText("Categories")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Glossary active filters")).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Edit glossary entry AAA Standalone" }))
      .toBeInTheDocument();
  });

  it("keeps Glossary search filter sort and page size in session memory", () => {
    window.history.pushState({}, "", "/glossary");
    const glossaryRender = render(<App />);

    fireEvent.change(screen.getByLabelText("Search terms"), {
      target: { value: "taxonomy" },
    });
    fireEvent.click(screen.getByTestId("glossary-category-filter-control"));
    fireEvent.click(
      screen.getByRole("option", { name: "Parents Only" }),
    );
    fireEvent.focus(screen.getByLabelText("Sort"));
    fireEvent.click(screen.getByRole("button", { name: "Select sort Term Z-A" }));
    fireEvent.change(screen.getByLabelText("Terms per page"), {
      target: { value: "64" },
    });
    glossaryRender.unmount();

    window.history.pushState({}, "", "/glossary");
    const restoredGlossaryRender = render(<App />);

    expect(screen.getByLabelText("Search terms")).toHaveValue("taxonomy");
    expect(screen.getByLabelText("Glossary active filters")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter Filter: Parents Only" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("glossary-sort-control")).toHaveTextContent("Term Z-A");
    expect(screen.getByLabelText("Terms per page")).toHaveDisplayValue("64");

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    restoredGlossaryRender.unmount();

    window.history.pushState({}, "", "/glossary");
    render(<App />);

    expect(screen.getByLabelText("Search terms")).toHaveValue("");
    expect(screen.queryByLabelText("Glossary active filters")).not.toBeInTheDocument();
    expect(screen.getByTestId("glossary-sort-control"))
      .toHaveTextContent("Term A-Z");
    expect(screen.getByLabelText("Terms per page")).toHaveDisplayValue("32");
  });

  it("sorts static Glossary entries by term", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    const tableBody = screen.getByRole("table").querySelector("tbody");
    expect(tableBody).not.toBeNull();
    let rows = within(tableBody as HTMLElement).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Alias Mapping"),
      expect.stringContaining("Category Drift"),
      expect.stringContaining("Nested Child"),
      expect.stringContaining("Local Reference"),
      expect.stringContaining("Source Citation"),
      expect.stringContaining("AAA Standalone"),
    ]);

    fireEvent.focus(screen.getByLabelText("Sort"));
    expect(screen.getByRole("listbox", { name: "Sort options" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select sort Term Z-A" }));

    rows = within(tableBody as HTMLElement).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Local Reference"),
      expect.stringContaining("Source Citation"),
      expect.stringContaining("Alias Mapping"),
      expect.stringContaining("Category Drift"),
      expect.stringContaining("Nested Child"),
      expect.stringContaining("AAA Standalone"),
    ]);

    for (const option of ["Term A-Z", "Term Z-A", "Last Added", "Last Modified"]) {
      fireEvent.focus(screen.getByLabelText("Sort"));
      expect(screen.getByRole("button", { name: `Select sort ${option}` }))
        .toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Sort by TERM" }));
    rows = within(tableBody as HTMLElement).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Alias Mapping"),
      expect.stringContaining("Category Drift"),
      expect.stringContaining("Nested Child"),
      expect.stringContaining("Local Reference"),
      expect.stringContaining("Source Citation"),
      expect.stringContaining("AAA Standalone"),
    ]);
    expect(
      screen.getByRole("button", { name: "Sort by TERM" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by TERM" }));
    expect(
      screen.getByRole("button", { name: "Sort by TERM" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("truncates long Glossary table values without widening columns", async () => {
    window.history.pushState({}, "", "/glossary");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "glossary_list") {
        return [
          persistedGlossaryEntry({
            id: "glossary-long",
            term: "Glossary Entry With An Exceptionally Long Term That Should Truncate",
            definition:
              "This glossary definition is intentionally long so the row keeps its width and clamps the text instead of stretching the table.",
            synonymsJson: JSON.stringify([
              "First synonym",
              "Second synonym",
              "Third synonym",
            ]),
            category: "A Very Long Glossary Category Label That Should Truncate",
            sourceTitle: "An Extremely Long Source Title That Should Not Expand The Table",
            sourceUrl:
              "https://example.invalid/some/very/long/source/path/that/should/stay/clipped",
          }),
        ];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "glossary_category",
            name: "A Very Long Glossary Category Label That Should Truncate",
          }),
        ];
      }
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const table = await screen.findByRole("table");
    expect(
      within(table).getByText(
        "Glossary Entry With An Exceptionally Long Term That Should Truncate",
      ),
    ).toHaveClass("truncate");
    expect(
      within(table).getByText(
        "This glossary definition is intentionally long so the row keeps its width and clamps the text instead of stretching the table.",
      ),
    ).toHaveClass("truncate");
    expect(
      within(table).getByText("A Very Long Glossary Category Label That Should Truncate"),
    ).toHaveClass("truncate");
    expect(
      within(table).getByRole("link", {
        name: "Open source An Extremely Long Source Title That Should Not Expand The Table",
      }),
    ).toHaveClass("overflow-hidden");
    expect(within(table).getByText("+3")).toBeInTheDocument();
  });

  it("shows a neutral Glossary empty state for unmatched static filters", () => {
    window.history.pushState({}, "", "/glossary");
    render(<App />);

    fireEvent.change(screen.getByLabelText("Search terms"), {
      target: { value: "no matching glossary sample" },
    });

    expect(screen.getByText("No glossary entries found")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("loads persisted Glossary entries from the runtime", async () => {
    window.history.pushState({}, "", "/glossary");
    const persisted = persistedGlossaryEntry({
      term: "Persisted Runtime Term",
      synonymsJson: '["Runtime synonym"]',
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "glossary_list") return [persisted];
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Persisted Runtime Term"))
      .toBeInTheDocument();
    expect(screen.getByText("+1")).toHaveAttribute("title", "Runtime synonym");
    expect(screen.queryByText("Alias Mapping")).not.toBeInTheDocument();
    expect(
      vi.mocked(invoke).mock.calls.some(([command]) =>
        command === "glossary_list"
      ),
    ).toBe(true);
  });

  it("creates a persisted Glossary entry through the runtime command", async () => {
    window.history.pushState({}, "", "/glossary");
    const created = persistedGlossaryEntry({
      id: "glossary_created",
      term: "Created Runtime Term",
      definition: "Created runtime definition.",
      synonymsJson: '["Created synonym"]',
      category: "",
      parentId: "glossary_parent",
      favorite: true,
      sourceTitle: "Created source",
      sourceUrl: "https://example.invalid/created",
      updatedAt: 3,
    });
    const parent = persistedGlossaryEntry({
      id: "glossary_parent",
      term: "Runtime Parent",
      definition: "Parent definition.",
      synonymsJson: "[]",
    });
    const invoke = vi.fn(async (
      command: string,
      args: { input?: Record<string, unknown> } = {},
    ) => {
      if (command === "glossary_list") return [parent];
      if (command === "glossary_create") {
        return {
          ...created,
          ...args.input,
          id: created.id,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Runtime Parent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));
    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "Created Runtime Term" },
    });
    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Created runtime definition." },
    });
    fireEvent.focus(screen.getByLabelText("Search glossary parent terms"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select glossary parent Runtime Parent",
      }),
    );
    dialogMocks.open.mockResolvedValue("D:/Reference/created-thumb.png");
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    expect(await screen.findByLabelText("Thumbnail"))
      .toHaveValue("D:/Reference/created-thumb.png");
    fireEvent.change(screen.getByLabelText("Source Title"), {
      target: { value: "Created source" },
    });
    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "https://example.invalid/created" },
    });
    fireEvent.change(screen.getByLabelText("Synonyms"), {
      target: { value: "Created synonym" },
    });
    fireEvent.keyDown(screen.getByLabelText("Synonyms"), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(screen.getByRole("switch", { name: "Favorite" }));

    clickSaveEntryAndConfirm();

    expect(await screen.findByText("Data created successfully."))
      .toBeInTheDocument();
    expect(screen.getByText("Created Runtime Term")).toBeInTheDocument();
    expect(
      vi.mocked(invoke).mock.calls.some(([command, args]) => {
        const input = (args as { input?: Record<string, unknown> } | undefined)
          ?.input;
        return command === "glossary_create" &&
          input?.term === "Created Runtime Term" &&
          input?.definition === "Created runtime definition." &&
          input?.synonymsJson === '["Created synonym"]' &&
          input?.category === "" &&
          input?.parentId === "glossary_parent" &&
          input?.thumbnailPath === "D:/Reference/created-thumb.png" &&
          input?.favorite === true;
      }),
    ).toBe(true);
    expect(
      vi.mocked(invoke).mock.calls.some(([command]) =>
        ["video_update", "image_update", "performer_update"].includes(command)
      ),
    ).toBe(false);
  });

  it("updates a persisted Glossary entry through the runtime command", async () => {
    window.history.pushState({}, "", "/glossary");
    const persisted = persistedGlossaryEntry({
      id: "glossary_edit",
      term: "Edit Runtime Term",
      definition: "Original definition.",
    });
    const updated = {
      ...persisted,
      term: "Updated Runtime Term",
      definition: "Updated definition.",
      updatedAt: 4,
    };
    const invoke = vi.fn(async (
      command: string,
      args: { id?: string; patch?: Record<string, unknown> } = {},
    ) => {
      if (command === "glossary_list") return [persisted];
      if (command === "glossary_update") return { ...updated, ...args.patch };
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Edit Runtime Term")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("row", { name: "Edit glossary entry Edit Runtime Term" }));
    fireEvent.change(screen.getByLabelText("Term"), {
      target: { value: "Updated Runtime Term" },
    });
    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Updated definition." },
    });
    clickSaveEntryAndConfirm();

    expect(await screen.findByText("Data updated successfully."))
      .toBeInTheDocument();
    expect(screen.getByText("Updated Runtime Term")).toBeInTheDocument();
    expect(
      vi.mocked(invoke).mock.calls.some(([command, args]) => {
        const updateArgs = args as
          | { id?: string; patch?: Record<string, unknown> }
          | undefined;
        return command === "glossary_update" &&
          updateArgs?.id === "glossary_edit" &&
          updateArgs.patch?.term === "Updated Runtime Term" &&
          updateArgs.patch?.definition === "Updated definition.";
      }),
    ).toBe(true);
  });

  it("persists Glossary favorite changes through update", async () => {
    window.history.pushState({}, "", "/glossary");
    const persisted = persistedGlossaryEntry({
      id: "glossary_favorite",
      term: "Favorite Runtime Term",
      favorite: false,
    });
    const invoke = vi.fn(async (
      command: string,
      args: { patch?: Record<string, unknown> } = {},
    ) => {
      if (command === "glossary_list") return [persisted];
      if (command === "glossary_update") {
        return { ...persisted, ...args.patch, updatedAt: 5 };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Favorite Runtime Term"))
      .toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle favorite Favorite Runtime Term" }),
    );

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.some(([command, args]) => {
          const patch = (args as
            | { patch?: Record<string, unknown> }
            | undefined)?.patch;
          return command === "glossary_update" && patch?.favorite === true;
        }),
      ).toBe(true);
    });
    expect(screen.getByText("Glossary favorite updated.")).toBeInTheDocument();
  });

  it("requires confirmation before deleting a persisted Glossary entry", async () => {
    window.history.pushState({}, "", "/glossary");
    const persisted = persistedGlossaryEntry({
      id: "glossary_delete",
      term: "Delete Runtime Term",
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "glossary_list") return [persisted];
      if (command === "glossary_delete") {
        return { id: persisted.id, deleted: true };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Delete Runtime Term")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("row", { name: "Edit glossary entry Delete Runtime Term" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete glossary entry?" }))
      .toBeInTheDocument();
    confirmDialog("Delete");

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.some(([command]) =>
          command === "glossary_delete"
        ),
      ).toBe(true);
    });
    expect(screen.queryByText("Delete Runtime Term")).not.toBeInTheDocument();
    expect(screen.getByText("Data deleted successfully.")).toBeInTheDocument();
  });

  it.each([
    ["/", "Sakurava - Home"],
    ["/videos", "Sakurava - Videos"],
    ["/videos/sample-id", "Sakurava - Videos"],
    ["/images", "Sakurava - Images"],
    ["/performers", "Sakurava - Performers"],
    ["/categories", "Sakurava - Category Management"],
    ["/glossary", "Sakurava - Glossary Library"],
    ["/settings", "Sakurava - Settings"],
    ["/settings/category-management", "Sakurava - Category Management"],
  ])("sets page title for %s", async (path, expectedTitle) => {
    window.history.pushState({}, "", path);
    render(<App />);

    await waitFor(() => {
      expect(document.title).toBe(expectedTitle);
    });
    expect(document.title).not.toContain("sample-id");
  });

  it.each([
    ["/", "Welcome to Sakurava"],
    ["/videos", "Videos"],
    ["/videos/new", "Add Video"],
    ["/videos/sample-id", "Video Detail"],
    ["/videos/sample-id/edit", "Edit Video"],
    ["/images", "Images"],
    ["/images/new", "Add Image"],
    ["/images/sample-id", "Image Detail"],
    ["/images/sample-id/edit", "Edit Image"],
    ["/performers", "Performers"],
    ["/performers/new", "Add Performer"],
    ["/performers/sample-id", "Performer Detail"],
    ["/performers/sample-id/edit", "Edit Performer"],
    ["/categories", "Category Management"],
    ["/glossary", "Glossary Library"],
    ["/settings", "Settings"],
  ])("renders %s", (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
  });

  it("opens Category Management from the /categories compatibility route", () => {
    window.history.pushState({}, "", "/categories");
    setManagedCategories(["Unused Local"]);

    render(<App />);

    expect(screen.getByRole("heading", { name: "Category Management" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search categories")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent(
      "Title A-Z",
    );
    expect(screen.queryByText("Catalog Browse")).not.toBeInTheDocument();
    expect(screen.queryByText("catalog browse")).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Category" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("loads Category Management usage from the /categories compatibility route", async () => {
    window.history.pushState({}, "", "/categories");
    setManagedCategories(["Drama", "Unused Local"]);
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({ title: "Drama Video", categoriesJson: '["Drama"]' }),
          persistedVideo({ title: "Classic Video", categoriesJson: '["Classic"]' }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({ title: "Drama Image", categoriesJson: '["Drama"]' }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            name: "Drama Performer",
            categoriesJson: '["Drama"]',
          }),
        ];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({ name: "Drama" }),
          managedCategoryFixture({ key: "cat_unused_local", name: "Unused Local" }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: (path: string) => `asset://${path}`,
    };

    render(<App />);

    await screen.findByRole("row", { name: "Edit Drama" });
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    const dramaCard = screen.getByRole("article", { name: "Category Drama" });
    expect(within(dramaCard).queryByText("Managed")).not.toBeInTheDocument();
    expect(within(dramaCard).getAllByText("3").length).toBeGreaterThan(0);
    expect(within(dramaCard).getByText("N/A")).toBeInTheDocument();
    expect(within(dramaCard).getByLabelText("Videos 1")).toHaveAttribute(
      "href",
      "/videos?category=Drama",
    );
    expect(within(dramaCard).getByLabelText("Images 1")).toHaveAttribute(
      "href",
      "/images?category=Drama",
    );
    expect(within(dramaCard).getByLabelText("Performers 1")).toHaveAttribute(
      "href",
      "/performers?category=Drama",
    );
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();

    expect(
      screen.queryByRole("article", {
      name: "Category Classic",
      }),
    ).not.toBeInTheDocument();

    const unusedCard = screen.getByRole("article", {
      name: "Category Unused Local",
    });
    expect(within(unusedCard).queryByText("Unused Managed"))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search categories"), {
      target: { value: "classic" },
    });
    expect(screen.queryByRole("article", { name: "Category Classic" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Drama" }))
      .not.toBeInTheDocument();

    const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual(
      expect.arrayContaining([
        "video_list",
        "image_list",
        "performer_list",
        "managed_category_list",
      ]),
    );
    expect(commands).not.toContain("video_update");
    expect(commands).not.toContain("image_update");
    expect(commands).not.toContain("performer_update");
    expect(commands).not.toContain("managed_category_update");
  });

  it("filters and paginates Category Management cards by usage type", async () => {
    window.history.pushState({}, "", "/categories");
    const managedCategories = [
      managedCategoryFixture({
        key: "cat_parent",
        name: "Parent Category",
        description: "Parent description",
        thumbnailPath: "D:/Sakurava/thumbs/parent.jpg",
      }),
      managedCategoryFixture({
        key: "cat_video",
        name: "Video Category",
        parentKey: "cat_parent",
      }),
      managedCategoryFixture({
        key: "cat_image",
        name: "Image Category",
      }),
      managedCategoryFixture({
        key: "cat_performer",
        name: "Performer Category",
      }),
      ...Array.from({ length: 33 }, (_, index) =>
        managedCategoryFixture({
          key: `cat_extra_${index}`,
          name: `Z Extra Category ${String(index + 1).padStart(2, "0")}`,
        }),
      ),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Video Usage",
            categoriesJson: '["Video Category"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            title: "Image Usage",
            categoriesJson: '["Image Category"]',
          }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            name: "Performer Usage",
            categoriesJson: '["Performer Category"]',
          }),
        ];
      }
      if (command === "credit_list") {
        return [
          {
            creditTypeCategoryId: "cat_extra_0",
            roleImportanceCategoryId: null,
            characterName: "Not a category",
          },
        ];
      }
      if (command === "managed_category_list") {
        return managedCategories;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: (path: string) => `asset://${path}`,
    };

    render(<App />);

    await screen.findAllByText("Parent Category");
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(screen.queryByRole("article", {
      name: "Category Parent Category",
    })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Parent Category" }))
      .toHaveClass("text-base", "font-semibold", "text-slate-700");
    expect(
      screen.getByRole("heading", { name: "Parent Category" }).compareDocumentPosition(
        screen.getByRole("heading", { name: "No Parent Selected" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const sectionGrid = screen.getAllByTestId("category-management-card-section-grid")[0];
    expect(sectionGrid).toHaveClass("xl:grid-cols-4");
    const videoChildCard = screen.getByRole("article", {
      name: "Category Video Category",
    });
    expect(videoChildCard).toHaveAttribute("data-category-card-kind", "child");
    expect(within(videoChildCard).getByText("Child of Parent Category"))
      .toBeInTheDocument();
    expect(within(videoChildCard).queryByRole("button", {
      name: /category Video Category/,
    })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "Collapse category group Parent Category",
    }));
    expect(screen.queryByRole("article", {
      name: "Category Video Category",
    })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "Expand category group Parent Category",
    }));
    expect(screen.getByRole("article", {
      name: "Category Video Category",
    })).toBeInTheDocument();
    expect(screen.getByText("Showing 1-32 of 37")).toBeInTheDocument();
    expect(screen.queryByText("Showing 1-32 of 37 categories")).not.toBeInTheDocument();
    expect(screen.getByText("Page size")).toBeInTheDocument();
    expect(screen.getByText("per page")).toBeInTheDocument();
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Categories per page")).toHaveDisplayValue("32");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 33-37 of 37")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories per page"), {
      target: { value: "64" },
    });
    expect(screen.getByText("Showing 1-37 of 37")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByText("Showing 1-37 of 37")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(screen.getByText("Showing 1-37 of 37")).toBeInTheDocument();

    selectCategoryFilter("Videos Used");
    expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();
    const videoCategoryCardWithParent = screen.getByRole("article", {
      name: "Category Video Category",
    });
    expect(videoCategoryCardWithParent).toBeInTheDocument();
    expect(videoCategoryCardWithParent).toHaveAttribute(
      "data-category-card-kind",
      "child",
    );
    expect(
      within(videoCategoryCardWithParent).getByText("Child of Parent Category"),
    ).toBeInTheDocument();
    expect(within(videoCategoryCardWithParent).getByTitle("Videos"))
      .toHaveClass("bg-sakura-50");
    expect(within(videoCategoryCardWithParent).getByLabelText("Videos 1"))
      .toHaveClass("text-sakura-600");
    expect(within(videoCategoryCardWithParent).getByLabelText("Images 0"))
      .toHaveClass("text-slate-500");
    expect(within(videoCategoryCardWithParent).getByLabelText("Videos 1"))
      .toHaveAttribute("href", "/videos?category=Video%20Category");
    expect(screen.queryByRole("article", { name: "Category Image Category" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Performer Category" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();

    selectCategoryFilter("Images Used");
    expect(screen.getByRole("article", { name: "Category Image Category" }))
      .toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Category Video Category" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Filter: Videos Used filter" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Filter: Images Used filter" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("2 active filters")).toHaveTextContent("2");

    selectCategoryFilter("Performers Used");
    expect(screen.getByRole("article", { name: "Category Performer Category" }))
      .toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Category Image Category" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("3 active filters")).toHaveTextContent("3");
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.queryByText("cat_performer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Filter: Images Used filter" }));
    expect(screen.getByRole("article", { name: "Category Video Category" }))
      .toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Category Performer Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Image Category" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("2 active filters")).toHaveTextContent("2");

    selectCategoryFilter("Videos Used");
    expect(screen.queryByRole("article", { name: "Category Video Category" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toHaveTextContent("1");

    selectCategoryFilter("Videos Used");
    const videoCategoryCard = screen.getByRole("article", {
      name: "Category Video Category",
    });
    expect(within(videoCategoryCard).getByLabelText("Videos 1"))
      .toHaveClass("text-sakura-600");
    expect(within(videoCategoryCard).getByLabelText("Videos 1"))
      .toHaveAttribute("href", "/videos?category=Video%20Category");
    fireEvent.click(screen.getByTestId("category-management-filter-control"));
    expect(screen.queryByRole("option", { name: "Credits Used" }))
      .not.toBeInTheDocument();
  }, 10_000);

  it.each([
    [
      "/videos",
      "Search videos...",
      "30 videos",
      "Cover Placeholder",
      "Sample Video Title",
    ],
    [
      "/images",
      "Search images...",
      "30 images",
      "Image Placeholder",
      "Sample Image Title",
    ],
    [
      "/performers",
      "Search performers...",
      "30 performers",
      "Profile Placeholder",
      "Sample Performer Name",
    ],
  ])("renders collection UI for %s", (path, placeholder, count, fallback, cardTitle) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
    expect(screen.getByText(count)).toBeInTheDocument();
    expect(screen.getAllByLabelText(fallback).length).toBeGreaterThan(0);
    expect(screen.getAllByText(cardTitle)).toHaveLength(30);
    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.getByTestId(`${path.slice(1)}-toolbar-filter-button`).querySelector("svg"))
      .not.toBeNull();
    expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear all filters" }),
    ).not.toBeInTheDocument();
    const sortControl = screen.getByTestId(`${path.slice(1)}.sort-sort-control`);
    expect(sortControl).toHaveTextContent(
      path === "/performers" ? "Name A-Z" : "Title A-Z",
    );
    expect(sortControl).not.toHaveTextContent(/^Sort$/);
    expect(sortControl.querySelector("svg")).not.toBeNull();
    expect(screen.queryByDisplayValue("Add category filter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Add category filter")).toBeInTheDocument();
    expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear all filters" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
    for (const pageSize of ["32", "64", "128", "256"]) {
      expect(screen.getByRole("option", { name: pageSize })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getAllByText(/Sample/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Switch to list view" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Grid view" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "List view" }),
    ).not.toBeInTheDocument();
  });

  it("uses global page-size options on the Category Catalog", () => {
    setManagedCategories(
      Array.from(
        { length: 40 },
        (_, index) => `Catalog Category ${String(index + 1).padStart(2, "0")}`,
      ),
    );

    render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Showing 1-32 of 40 categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Categories per page")).toHaveDisplayValue("32");
    for (const pageSize of ["32", "64", "128", "256"]) {
      expect(
        within(screen.getByLabelText("Categories per page"))
          .getByRole("option", { name: pageSize }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 33-40 of 40 categories")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories per page"), {
      target: { value: "64" },
    });
    expect(screen.getByText("Showing 1-40 of 40 categories")).toBeInTheDocument();
  });

  it("keeps catalog page size in session memory instead of localStorage", () => {
    window.history.pushState({}, "", "/videos");
    window.localStorage.setItem("sakurava.catalog.videos.pageSize.v1", "90");

    const { unmount } = render(<App />);

    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("64");
    expect(window.localStorage.getItem("sakurava.catalog.videos.pageSize.v1"))
      .toBe("90");

    unmount();
    window.history.pushState({}, "", "/images");
    window.localStorage.setItem("sakurava.catalog.images.pageSize.v1", "64");

    render(<App />);

    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
    expect(window.localStorage.getItem("sakurava.catalog.images.pageSize.v1"))
      .toBe("64");
  });

  it("keeps Catalog toolbar memory scoped by entity during the session", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_memory",
            title: "Memory Video",
            categoriesJson: '["Memory Category"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [persistedImage({ id: "image_memory", title: "Memory Image" })];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    const firstRender = render(<App />);
    expect(await screen.findByText("Memory Video")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "memory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Memory Category" },
    });
    selectCatalogSort("videos", "Title A-Z");
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Duration" }));
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });
    firstRender.unmount();

    window.history.pushState({}, "", "/images");
    const imageRender = render(<App />);
    expect(await screen.findByText("Memory Image")).toBeInTheDocument();
    expect(screen.getByLabelText("Images search")).toHaveValue("");
    expect(catalogSortControl("images")).toHaveTextContent("Title A-Z");
    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    imageRender.unmount();

    window.history.pushState({}, "", "/videos");
    const restoredVideoRender = render(<App />);
    expect(await screen.findByText("Memory Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Videos search")).toHaveValue("memory");
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByRole("button", { name: "Filters 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to grid view" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by Duration" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("64");

    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.getByLabelText("Videos search")).toHaveValue("");
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to list view" })).toBeInTheDocument();
    restoredVideoRender.unmount();

    window.history.pushState({}, "", "/videos");
    render(<App />);
    expect(await screen.findByText("Memory Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Videos search")).toHaveValue("");
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
  });

  it("syncs the sticky horizontal scrollbar mirror with table scrolling", async () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 120;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return 320;
      },
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    try {
      render(
        <StickyHorizontalScroll testId="sticky-scroll-test">
          <div style={{ width: 320 }}>Wide table content</div>
        </StickyHorizontalScroll>,
      );

      const body = screen.getByTestId("sticky-scroll-test") as HTMLDivElement;
      const frame = body.closest("[data-sticky-horizontal-scroll='true']");
      expect(frame).toHaveClass("sticky-horizontal-scroll-frame");
      await waitFor(() => expect(frame).toHaveAttribute("data-overflowing", "true"));

      const mirror = frame?.querySelector(
        ".sticky-horizontal-scrollbar",
      ) as HTMLDivElement;
      expect(mirror).toBeInTheDocument();
      expect(mirror.closest(".sticky-horizontal-scrollbar-shell"))
        .toHaveAttribute("data-active", "true");

      act(() => {
        body.scrollLeft = 48;
        fireEvent.scroll(body);
      });
      expect(mirror.scrollLeft).toBe(48);

      act(() => {
        mirror.scrollLeft = 12;
        fireEvent.scroll(mirror);
      });
      expect(body.scrollLeft).toBe(12);
    } finally {
      if (originalClientWidth) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
      }
      if (originalScrollWidth) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidth);
      }
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it.each([
    {
      path: "/videos",
      panelName: "Videos filters",
      filters: ["Availability", "Censorship", "Release Years", "Publisher / Label", "Category", "Quality", "Rating", "Duration"],
      absent: ["Image Count", "Debut Years", "Status", "Filmography Count", "Pictorials Count", "Gender", "Body Type"],
    },
    {
      path: "/images",
      panelName: "Images filters",
      filters: ["Availability", "Censorship", "Release Years", "Publisher / Label", "Category", "Quality", "Rating", "Image Count"],
      absent: ["Duration", "Debut Years", "Status", "Filmography Count", "Pictorials Count", "Gender", "Body Type"],
    },
    {
      path: "/performers",
      panelName: "Performers filters",
      filters: ["Availability", "Age", "Body Height", "Nationality", "Body Type", "Debut Years", "Cup Size", "Rating", "Filmography Count", "Category", "Pictorials Count", "Gender"],
      absent: ["Quality", "Duration", "Image Count", "Release Years"],
    },
  ])(
    "renders Catalog Toolbar V1 filter panel for $path",
    ({ path, panelName, filters, absent }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByPlaceholderText(/Search .*\.{3}/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
      expect(screen.getByTestId(`${path.slice(1)}.sort-sort-control`))
        .toHaveTextContent(path === "/performers" ? "Name A-Z" : "Title A-Z");
      expect(
        screen.getByRole("button", { name: "Switch to list view" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
      const panel = within(screen.getByRole("region", { name: panelName }));

      for (const label of filters) {
        expect(panel.getByText(label)).toBeInTheDocument();
      }
      for (const label of absent) {
        expect(panel.queryByText(label)).not.toBeInTheDocument();
      }
      expect(
        panel.queryByText(
      "Data-dependent filters are unavailable until reliable fields or helpers exist.",
        ),
      ).not.toBeInTheDocument();
    },
  );

  it("does not render Performer taxonomy filters on Category Management", () => {
    window.history.pushState({}, "", "/categories");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Category Management" })).toBeInTheDocument();
    expect(screen.queryByText("Gender")).not.toBeInTheDocument();
    expect(screen.queryByText("Body Type")).not.toBeInTheDocument();
  });

  it.each(["Body Type", "bodytype", "body-type", "body_type"])(
    "sources Performer Catalog Body Type options from taxonomy parent %s",
    async (bodyTypeParentName) => {
      window.history.pushState({}, "", "/performers");
      const invoke = vi.fn(async (command: string) => {
        if (command === "performer_list") {
          return [
            persistedPerformer({
              name: "Taxonomy Performer",
              categoriesJson: '["Woman","Athletic"]',
            }),
          ];
        }
        if (command === "managed_category_list") {
          return performerTaxonomyFixtures(bodyTypeParentName);
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };
      render(<App />);

      expect(await screen.findByText("Taxonomy Performer")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
      const panel = within(screen.getByRole("region", { name: "Performers filters" }));
      await waitFor(() => expect(panel.getByLabelText("Body Type")).toBeEnabled());

      fireEvent.click(panel.getByRole("button", { name: "Open Body Type options" }));
      const listbox = within(screen.getByRole("listbox", { name: "Body Type options" }));
      expect(listbox.getByText("Athletic")).toBeInTheDocument();
      expect(listbox.queryByText(bodyTypeParentName)).not.toBeInTheDocument();
    },
  );

  it("filters Performer Catalog by Gender direct field and Body Type taxonomy labels", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_alpha",
            name: "Alpha Performer",
            gender: "Woman",
            categoriesJson: '["Athletic","Featured"]',
          }),
          persistedPerformer({
            id: "performer_beta",
            name: "Beta Performer",
            gender: "Man",
            categoriesJson: '["Legacy Woman","Slim","Featured"]',
          }),
          persistedPerformer({
            id: "performer_gamma",
            name: "Gamma Performer",
            gender: "woman",
            categoriesJson: '["Slim"]',
          }),
          persistedPerformer({
            id: "performer_delta",
            name: "Delta Performer",
            gender: "",
            categoriesJson: '["Athletic"]',
          }),
        ];
      }
      if (command === "managed_category_list") {
        return [
          ...performerTaxonomyFixtures("Body Type"),
          managedCategoryFixture({
            key: "cat_gender_man",
            name: "Man",
            parentKey: "cat_gender",
            showInVideos: false,
            showInImages: false,
            showInPerformers: true,
          }),
          managedCategoryFixture({
            key: "cat_gender_non_binary",
            name: "Non-binary",
            parentKey: "cat_gender",
            showInVideos: false,
            showInImages: false,
            showInPerformers: true,
          }),
          managedCategoryFixture({
            key: "cat_body_type_slim",
            name: "Slim",
            parentKey: "cat_body_type",
            showInVideos: false,
            showInImages: false,
            showInPerformers: true,
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Alpha Performer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all filters" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));
    await waitFor(() => expect(panel.getByLabelText("Gender")).toBeEnabled());

    fireEvent.click(panel.getByRole("button", { name: "Open Gender options" }));
    const genderOptions = within(screen.getByRole("listbox", { name: "Gender options" }));
    expect(genderOptions.queryByText("Gender")).not.toBeInTheDocument();
    expect(genderOptions.queryByText("Legacy Woman")).not.toBeInTheDocument();
    expect(genderOptions.queryByText("Non-binary")).not.toBeInTheDocument();
    expect(genderOptions.queryByText("All genders")).toBeInTheDocument();
    expect(genderOptions.getAllByRole("option").map((option) => option.textContent))
      .toEqual(["All genders+", "Man+", "Woman+"]);
    fireEvent.click(genderOptions.getByText("Woman"));

    expect(screen.getByText("Alpha Performer")).toBeInTheDocument();
    expect(screen.getByText("Gamma Performer")).toBeInTheDocument();
    expect(screen.queryByText("Beta Performer")).not.toBeInTheDocument();
    expect(screen.queryByText("Delta Performer")).not.toBeInTheDocument();
    expect(screen.getByText("Gender: Woman")).toBeInTheDocument();

    fireEvent.click(panel.getByRole("button", { name: "Open Body Type options" }));
    const bodyTypeOptions = within(screen.getByRole("listbox", { name: "Body Type options" }));
    expect(bodyTypeOptions.queryByText("Body Type")).not.toBeInTheDocument();
    fireEvent.click(bodyTypeOptions.getByText("Athletic"));

    expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
    expect(screen.getByText("Gender: Woman")).toBeInTheDocument();
    expect(screen.getByText("Body Type: Athletic")).toBeInTheDocument();
    expect(screen.getByText("Alpha Performer")).toBeInTheDocument();
    expect(screen.queryByText("Gamma Performer")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta Performer")).not.toBeInTheDocument();
    expect(screen.queryByText("Delta Performer")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Performers search"), {
      target: { value: "alpha" },
    });
    expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
    expect(screen.getByText("Alpha Performer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.queryByText("Gender: Woman")).not.toBeInTheDocument();
    expect(screen.queryByText("Body Type: Athletic")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all filters" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("Alpha Performer")).toBeInTheDocument();
    expect(screen.getByText("Beta Performer")).toBeInTheDocument();
    expect(screen.getByText("Gamma Performer")).toBeInTheDocument();
    expect(screen.getByText("Delta Performer")).toBeInTheDocument();
  });

  it("filters Performer Catalog table view by Gender direct field and keeps it in session memory", async () => {
    window.history.pushState({}, "", "/performers");
    window.localStorage.setItem("sakurava.catalog.performers.gender.v1", "Man");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_table_woman",
            name: "Table Woman Performer",
            gender: "Woman",
          }),
          persistedPerformer({
            id: "performer_table_man",
            name: "Table Man Performer",
            gender: "Man",
          }),
        ];
      }
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    const firstRender = render(<App />);

    expect(await screen.findByText("Table Woman Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    let panel = within(screen.getByRole("region", { name: "Performers filters" }));
    await waitFor(() => expect(panel.getByLabelText("Gender")).toBeEnabled());
    fireEvent.click(panel.getByRole("button", { name: "Open Gender options" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Gender options" })).getByText("Woman"));

    expect(screen.getByRole("button", { name: "Filters 1" })).toBeInTheDocument();
    expect(screen.getByTestId("performers-catalog-table")).toBeInTheDocument();
    expect(screen.getByText("Table Woman Performer")).toBeInTheDocument();
    expect(screen.queryByText("Table Man Performer")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.catalog.performers.gender.v1")).toBe("Man");
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );

    firstRender.unmount();
    window.history.pushState({}, "", "/performers");
    render(<App />);

    expect(await screen.findByText("Table Woman Performer")).toBeInTheDocument();
    expect(screen.queryByText("Table Man Performer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to grid view" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    panel = within(screen.getByRole("region", { name: "Performers filters" }));
    expect(panel.getByLabelText("Gender")).toHaveValue("Woman");
  });

  it("shows clean empty taxonomy filter states when Performer Catalog parents are missing", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [persistedPerformer({ name: "No Taxonomy Performer" })];
      }
      if (command === "managed_category_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("No Taxonomy Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    expect(panel.getByText("No Gender values found")).toBeInTheDocument();
    expect(panel.getByText("No Body Type categories found")).toBeInTheDocument();
    expect(panel.getByLabelText("Gender")).toBeDisabled();
    expect(panel.getByLabelText("Body Type")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Clear all filters" }))
      .not.toBeInTheDocument();
  });

  it.each([
    [
      "/videos/sample-id",
      [
        "Video Detail",
        "Morning Archive",
        "Rewatch",
        "Related Performers",
        "Related Images",
      ],
    ],
    [
      "/images/sample-id",
      [
        "Image Detail",
        "City Light Set",
        "Memorability",
        "Related Performers",
        "Related Videos",
      ],
    ],
    [
      "/performers/sample-id",
      [
        "Performer Detail",
        "Aoi Hanami",
        "Hanami Aoi",
        "Rating Summary",
        "Personal",
        "Physical",
        "Related Videos",
        "Related Images",
        "No related videos saved.",
      ],
    ],
  ])(
    "renders static detail UI for %s",
    (path, expectedTexts) => {
      window.history.pushState({}, "", path);
      render(<App />);

      for (const text of expectedTexts) {
        expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      }
      expect(screen.queryByText("Data-dependent fields only")).not.toBeInTheDocument();
      expect(screen.queryByText("Preview only")).not.toBeInTheDocument();
      expect(screen.queryByText("Available after relation features are added."))
        .not.toBeInTheDocument();
      expect(screen.queryByText("Manual cover path placeholder"))
        .not.toBeInTheDocument();
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["/videos/sample-id", "hexagon", "3.8"],
    ["/images/sample-id", "hexagon", "4.2"],
    ["/performers/sample-id", "hexagon", "3.8"],
  ])(
    "renders spider chart only for static detail rating summary at %s",
    (path, shape, score) => {
      window.history.pushState({}, "", path);
      render(<App />);

      const section = screen.getByText("Rating Summary").closest("section");
      expect(section).not.toBeNull();
      const ratingSection = within(section as HTMLElement);
      const chart = ratingSection.getByTestId("spider-chart");

      expect(chart).toHaveAttribute("data-dimension-count", "6");
      expect(chart).toHaveAttribute("data-shape", shape);
      expect(ratingSection.getByText(score)).toBeInTheDocument();
      expect(ratingSection.queryByText(`${score} / 5`)).not.toBeInTheDocument();
      expect(ratingSection.queryByLabelText("4/5")).not.toBeInTheDocument();
      expect(ratingSection.queryByLabelText("5/5")).not.toBeInTheDocument();
    },
  );

  it("renders Image Detail Gallery directly below Hero and before Metadata", () => {
    window.history.pushState({}, "", "/images/sample-id");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "City Light Set" }).closest("section"),
      screen.getByRole("heading", { name: "Gallery" }).closest("section"),
      screen.getByRole("heading", { name: "Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "Rating Summary" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performers" }).closest("section"),
      screen.getByRole("heading", { name: "Related Videos" }).closest("section"),
      screen.getByRole("heading", { name: "Source Links" }).closest("section"),
      screen.getByRole("heading", { name: "System Info" }).closest("section"),
    ]);
  });

  it("keeps Video Detail section order unchanged", () => {
    window.history.pushState({}, "", "/videos/sample-id");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "Morning Archive" }).closest("section"),
      screen.getByRole("heading", { name: "Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "Rating Summary" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performers" }).closest("section"),
      screen.getByRole("heading", { name: "Source Links" }).closest("section"),
      screen.getByRole("heading", { name: "System Info" }).closest("section"),
    ]);
  });

  it("renders Detail section title icons inside rounded square backgrounds", () => {
    window.history.pushState({}, "", "/videos/sample-id");
    render(<App />);

    for (const title of ["Rating Summary", "Source Links", "System Info", "Related Performers"]) {
      const section = screen
        .getByRole("heading", { name: title })
        .closest("section") as HTMLElement;
      const iconWrapper = within(section).getByTestId("detail-section-icon");

      expect(iconWrapper).toHaveClass("rounded-lg", "bg-sakura-50/80");
      expect(iconWrapper).not.toHaveClass("border", "border-sakura-100");
      expect(iconWrapper.querySelector("svg")).not.toBeNull();
    }
  });

  it("keeps Performer Detail section order unchanged", () => {
    window.history.pushState({}, "", "/performers/sample-id");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "Aoi Hanami" }).closest("section"),
      screen.getByRole("heading", { name: "Rating Summary" }).closest("section"),
      screen.getByRole("heading", { name: "Personal" }).closest("section"),
      screen.getByRole("heading", { name: "Physical" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
      screen.getByRole("heading", { name: "Related Videos" }).closest("section"),
      screen.getByRole("heading", { name: "Source Links" }).closest("section"),
      screen.getByRole("heading", { name: "System Info" }).closest("section"),
    ]);
  });

  it("renders the full detail radar map for partial persisted rating dimensions", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "video_get") {
          return persistedVideo({
            ratingJson:
              '{"rewatch":4,"performance":5,"visual":4,"intensity":3,"story":5}',
          });
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Persisted Video")).toBeInTheDocument();
    const section = screen.getByText("Rating Summary").closest("section");
    expect(section).not.toBeNull();
    const sectionElement = section as HTMLElement;
    const ratingSection = within(sectionElement);
    const chart = ratingSection.getByTestId("spider-chart");

    expect(chart).toHaveAttribute("data-dimension-count", "6");
    expect(chart).toHaveAttribute("data-shape", "hexagon");
    expect(chart).toHaveAttribute("aria-label", "6-dimension radar map");
    const gradient = chart.querySelector("defs radialGradient");
    expect(gradient).not.toBeNull();
    const gradientStops = Array.from(
      gradient?.querySelectorAll("stop") ?? [],
    ).map((stop) => stop.getAttribute("stop-opacity") ?? stop.getAttribute("stopOpacity"));
    expect(gradientStops).toEqual(["0.28", "0.22", "0.06"]);
    expect(chart.getAttribute("viewBox")).toBe("0 0 420 420");
    expect(ratingSection.getByText("4.2")).toBeInTheDocument();
    expect(ratingSection.queryByText("4.2 / 5")).not.toBeInTheDocument();
    expect(ratingSection.getByText("Chemistry")).toBeInTheDocument();
    expect(ratingSection.getByTestId("spider-chart-path")).toHaveAttribute("fill");
    expect(ratingSection.getByTestId("spider-chart-path"))
      .toHaveAttribute("stroke-width", "1");
    expect(ratingSection.getByTestId("spider-chart-path"))
      .toHaveAttribute("stroke", "var(--appearance-accent)");
    expect(chart.querySelectorAll('circle[fill="var(--appearance-accent)"]').length)
      .toBe(6);
    expect(
      gradient?.querySelector('stop[stop-color="var(--appearance-accent)"]'),
    ).not.toBeNull();
    expect(ratingSection.getByTestId("spider-chart-path").getAttribute("d"))
      .toContain("C");
    expect(chart.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(5);
    expect(chart.querySelectorAll("line").length).toBe(6);
    expect(ratingSection.getAllByRole("img").length).toBeGreaterThan(0);
    expect(sectionElement.querySelector("[data-testid='detail-section-icon'] svg.lucide-star"))
      .not.toBeNull();
    expect(sectionElement.querySelector("svg.lucide-info")).toBeNull();
    expect(chart.querySelector('circle[r="25"]')).toBeNull();
  });

  it("keeps radar labels visible when detail ratingJson has no valid rating", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "video_get") {
          return persistedVideo({ ratingJson: '{"rewatch":0,"visual":"5"}' });
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Persisted Video")).toBeInTheDocument();
    const section = screen.getByText("Rating Summary").closest("section");
    expect(section).not.toBeNull();
    const ratingSection = within(section as HTMLElement);

    expect(ratingSection.getByTestId("spider-chart")).toBeInTheDocument();
    expect(ratingSection.getAllByText("N/A").length).toBeGreaterThan(0);
    expect(ratingSection.getByText("Rewatch")).toBeInTheDocument();
    expect(ratingSection.getByText("Chemistry")).toBeInTheDocument();
    expect(ratingSection.queryByText("Not rated")).not.toBeInTheDocument();
  });

  it("renders the clipped Signature radar label on Image Detail", () => {
    window.history.pushState({}, "", "/images/sample-id");
    const { unmount } = render(<App />);

    const ratingSection = screen
      .getByRole("heading", { name: "Rating Summary" })
      .closest("section") as HTMLElement;
    expect(within(ratingSection).getByText("Signature")).toBeInTheDocument();
    expect(within(ratingSection).getByText("Atmosphere")).toBeInTheDocument();

    unmount();
    window.history.pushState({}, "", "/performers/sample-id");
    render(<App />);
    const ratingHeadings = screen.getAllByRole("heading", { name: "Rating Summary" });
    const performerRatingSection = ratingHeadings[ratingHeadings.length - 1]
      .closest("section") as HTMLElement;
    expect(within(performerRatingSection).getByText("Exceptional"))
      .toBeInTheDocument();
  });

  it("does not render file actions in Detail System Info", () => {
    window.history.pushState({}, "", "/videos/sample-id");
    render(<App />);

    const systemInfo = screen
      .getByRole("heading", { name: "System Info" })
      .closest("section") as HTMLElement;

    expect(within(systemInfo).queryByRole("button", { name: /Save as/i }))
      .not.toBeInTheDocument();
    expect(within(systemInfo).queryByRole("button", { name: /Open folder/i }))
      .not.toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/sample-id",
      heading: "Metadata",
      hiddenLabels: ["Cover Path", "Media Path", "Duration"],
      techLabels: ["Duration"],
    },
    {
      path: "/images/sample-id",
      heading: "Metadata",
      hiddenLabels: ["Cover Path", "Folder Path", "Image Count"],
      techLabels: ["Gallery Count"],
    },
    {
      path: "/performers/sample-id",
      heading: "Personal",
      hiddenLabels: ["Cover Path"],
      techLabels: [],
    },
  ])(
    "keeps raw path fields out of normal metadata for $path",
    ({ path, heading, hiddenLabels, techLabels }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      const metadataSection = screen
        .getByRole("heading", { name: heading })
        .closest("section");
      expect(metadataSection).not.toBeNull();
      const metadata = within(metadataSection as HTMLElement);

      for (const label of hiddenLabels) {
        expect(metadata.queryByText(label)).not.toBeInTheDocument();
      }

      if (techLabels.length > 0) {
        const techSection = screen
          .getByRole("heading", { name: "Tech Info" })
          .closest("section");
        expect(techSection).not.toBeNull();
        const tech = within(techSection as HTMLElement);

        for (const label of techLabels) {
          expect(tech.getByText(label)).toBeInTheDocument();
        }
      }

      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
      expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
      expect(screen.queryByText(/galleryImagePathsJson/)).not.toBeInTheDocument();
    },
  );

  it("renders Video Tech Info from safe saved values only", () => {
    window.history.pushState({}, "", "/videos/sample-id");
    render(<App />);

    const techSection = screen
      .getByRole("heading", { name: "Tech Info" })
      .closest("section");
    expect(techSection).not.toBeNull();
    const tech = within(techSection as HTMLElement);

    expect(tech.getByText("Duration")).toBeInTheDocument();
    expect(tech.getByText("124 min")).toBeInTheDocument();
    expect(tech.getByText("Resolution")).toBeInTheDocument();
    expect(tech.getByText("File Size")).toBeInTheDocument();
    expect(tech.getByText("File Type")).toBeInTheDocument();
    expect(tech.getAllByText("N/A")).toHaveLength(3);
    expect(tech.queryByText("Not detected yet")).not.toBeInTheDocument();
    expect(tech.queryByText("Not available")).not.toBeInTheDocument();
    expect(tech.queryByText("Quality")).not.toBeInTheDocument();
  });

  it("renders honest Video Tech Info fallbacks when duration and resolution are not detected", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "video_get") {
          return persistedVideo({
            title: "Undetected Tech Video",
            durationMinutes: 0,
            resolution: "",
            fileSizeBytes: 4096,
            fileType: "MP4",
          });
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(await screen.findByText("Undetected Tech Video")).toBeInTheDocument();
    const techSection = screen
      .getByRole("heading", { name: "Tech Info" })
      .closest("section");
    expect(techSection).not.toBeNull();
    const tech = within(techSection as HTMLElement);

    expect(tech.getAllByText("N/A")).toHaveLength(2);
    expect(tech.queryByText("Not detected yet")).not.toBeInTheDocument();
    expect(tech.queryByText("0 min")).not.toBeInTheDocument();
    expect(tech.queryByText("0 minutes")).not.toBeInTheDocument();
    expect(tech.getByText("4.0 KB")).toBeInTheDocument();
    expect(tech.getByText("MP4")).toBeInTheDocument();
  });

  it("renders saved Video Tech Info values from the Tauri detail record", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "video_get") {
          return persistedVideo({
            title: "Saved Tech Video",
            durationMinutes: 95,
            resolution: "1920 x 1080",
            fileSizeBytes: 4096,
            fileType: "MP4",
          });
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(await screen.findByText("Saved Tech Video")).toBeInTheDocument();
    const techSection = screen
      .getByRole("heading", { name: "Tech Info" })
      .closest("section");
    expect(techSection).not.toBeNull();
    const tech = within(techSection as HTMLElement);

    expect(tech.getByText("95 min")).toBeInTheDocument();
    expect(tech.getByText("1920 x 1080")).toBeInTheDocument();
    expect(tech.getByText("4.0 KB")).toBeInTheDocument();
    expect(tech.getByText("MP4")).toBeInTheDocument();
  });

  it("renders Image Gallery Count from safe saved gallery data", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "image_get") {
          return persistedImage({
            title: "Gallery Count Image",
            imageCount: null,
            galleryImagePathsJson:
              '["C:/Gallery/one.jpg","C:/Gallery/two.jpg","C:/Gallery/three.jpg"]',
          });
        }
        if (command === "performer_list" || command === "video_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Gallery Count Image")).toBeInTheDocument();
    const techSection = screen
      .getByRole("heading", { name: "Tech Info" })
      .closest("section");
    expect(techSection).not.toBeNull();
    const tech = within(techSection as HTMLElement);

    expect(tech.getByText("Image Count")).toBeInTheDocument();
    expect(tech.getByText("3 images")).toBeInTheDocument();
    expect(tech.getAllByText("N/A")).toHaveLength(3);
    const systemInfo = within(
      screen.getByText("System Info").closest("section") as HTMLElement,
    );
    expect(systemInfo.getByText("Gallery status")).toBeInTheDocument();
    expect(systemInfo.getByText("Available")).toBeInTheDocument();
    expect(screen.queryByText("C:/Gallery/one.jpg")).not.toBeInTheDocument();
  });

  it("renders saved Image Tech Info values from the Tauri detail record", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (command === "image_get") {
          return persistedImage({
            title: "Saved Tech Image",
            imageCount: 1,
            galleryImagePathsJson: '["D:/Images/one.jpg"]',
            mainResolution: "1200 x 800",
            totalFileSizeBytes: 2048,
            mainFileType: "JPG",
          });
        }
        if (command === "performer_list" || command === "video_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(await screen.findByText("Saved Tech Image")).toBeInTheDocument();
    const techSection = screen
      .getByRole("heading", { name: "Tech Info" })
      .closest("section");
    expect(techSection).not.toBeNull();
    const tech = within(techSection as HTMLElement);

    expect(tech.getByText("1 image")).toBeInTheDocument();
    expect(tech.getByText("1200 x 800")).toBeInTheDocument();
    expect(tech.getByText("2.0 KB")).toBeInTheDocument();
    expect(tech.getByText("JPG")).toBeInTheDocument();
  });

  it("keeps Performer free of Video/Image-style Tech Info", () => {
    window.history.pushState({}, "", "/performers/sample-id");
    render(<App />);

    expect(
      screen.queryByRole("heading", { name: "Tech Info" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
    expect(screen.queryByText("Resolution")).not.toBeInTheDocument();
    expect(screen.queryByText("File Size")).not.toBeInTheDocument();
    expect(screen.queryByText("File Type")).not.toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/sample-id",
      title: "Morning Archive",
      original: "Asa no Archive",
      code: "VID-024",
      category: "Drama",
      status: "Owned",
    },
    {
      path: "/images/sample-id",
      title: "City Light Set",
      original: "Machi no Hikari",
      code: "IMG-014",
      category: "Portrait",
      status: "Owned",
    },
    {
      path: "/performers/sample-id",
      title: "Aoi Hanami",
      original: "Hanami Aoi",
      code: null,
      category: "Lead",
      status: "Active",
    },
  ])(
    "renders Detail V1 hero identity for $path",
    ({ path, title, original, code, category, status }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(original)).toBeInTheDocument();
      expect(screen.getAllByText(status).length).toBeGreaterThan(0);
      expect(screen.getByText(category)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove from Favorites" }))
        .toBeInTheDocument();
      if (code) {
        expect(screen.getByText(code)).toBeInTheDocument();
      }
      if (path === "/performers/sample-id") {
        const name = screen.getByRole("heading", { name: title });
        const originalName = screen.getByText(original);
        const heroChips = screen.getByLabelText("Performer hero chips");

        expect(
          name.compareDocumentPosition(originalName) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          originalName.compareDocumentPosition(heroChips) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(within(heroChips).getByText(status)).toBeInTheDocument();
        expect(within(heroChips).queryByText("Years Active")).not.toBeInTheDocument();
        expect(within(heroChips).queryByText(category)).not.toBeInTheDocument();

        const categoriesSection = screen.getByText("Categories").closest("div");
        expect(categoriesSection).not.toBeNull();
        expect(within(categoriesSection as HTMLElement).getByText(category))
          .toBeInTheDocument();

        const activeYears = screen.getByText("Years Active");
        expect(activeYears).toBeInTheDocument();
        expect(
          heroChips.compareDocumentPosition(activeYears) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getByText("2015 - Now")).toBeInTheDocument();
        expect(screen.queryByText(/\(19 - 30 y\)/)).not.toBeInTheDocument();
      }
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it("renders the compact Settings control center", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search settings" }))
      .toBeInTheDocument();
    for (const section of [
      "Overview",
      "Appearance",
      "Language",
      "Catalog Preferences",
      "Library & Media",
      "Backup & Recovery",
      "Import / Export",
      "Performance & Cache",
    ]) {
      expect(screen.getAllByRole("heading", { name: section }).length)
        .toBeGreaterThan(0);
    }
    expect(screen.queryByText(/^1\. Overview$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Theme").length).toBeGreaterThan(0);
    expect(screen.getByText("Accent Color")).toBeInTheDocument();
    expect(screen.getByText("Density")).toBeInTheDocument();
    expect(screen.getByLabelText("UI Scale")).toBeEnabled();
    expect(screen.getByRole("button", { name: "System" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset Appearance" }))
      .toBeEnabled();
    const appearanceCard = screen
      .getAllByRole("heading", { name: "Appearance" })[0]
      .closest("section");
    expect(appearanceCard).not.toBeNull();
    expect(
      within(appearanceCard as HTMLElement).queryAllByRole("button", {
        hidden: true,
      }).filter((control) => control.hasAttribute("disabled")),
    ).toHaveLength(0);
    expect(
      screen.getAllByRole("heading", { name: "Appearance" })[0]
        .previousElementSibling,
    ).toHaveClass("rounded-lg", "bg-sakura-50");
    expect(screen.queryByLabelText("Default View")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default Sort")).not.toBeInTheDocument();
    for (const label of [
      "Remember catalog view",
      "Remember catalog sort",
      "Remember catalog filters",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeEnabled();
    }
    expect(
      screen.getByRole("button", { name: "Reset Catalog Preferences" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Import Catalog" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("listbox", { name: "Configured media roots" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("Last Backup").length).toBeGreaterThan(0);
    expect(screen.getByText("Cache Size")).toBeInTheDocument();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reset Overview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Performance & Cache" }))
      .toBeDisabled();
    expect(screen.queryByRole("heading", { name: "System Info" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/Planned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MVP/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnostics")).not.toBeInTheDocument();
  });

  it("restores durable view for each primary catalog without restoring search or page size", () => {
    window.localStorage.setItem(
      "sakurava.catalogPreferences.v1",
      JSON.stringify({
        version: 1,
        toggles: {
          rememberView: true,
          rememberSort: false,
          rememberFilters: false,
        },
        pages: {
          videos: { view: "table", searchQuery: "ignored", pageSize: "256" },
          images: { view: "table", searchQuery: "ignored", pageSize: "256" },
          performers: { view: "table", searchQuery: "ignored", pageSize: "256" },
        },
      }),
    );

    for (const kind of ["videos", "images", "performers"]) {
      window.history.pushState({}, "", `/${kind}`);
      const rendered = render(<App />);
      expect(
        screen.getByRole("button", { name: "Switch to grid view" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
      expect(
        screen.getByLabelText(
          `${kind[0].toUpperCase()}${kind.slice(1)} search`,
        ),
      ).toHaveValue("");
      rendered.unmount();
      clearAllSessionFilterStateForTests();
    }
  });

  it("persists Catalog Preference toggles and resets remembered state only", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem("unrelated.catalog.data", "preserve-me");
    render(<App />);

    fireEvent.click(screen.getByRole("switch", { name: "Remember catalog view" }));
    fireEvent.click(screen.getByRole("switch", { name: "Remember catalog sort" }));
    fireEvent.click(screen.getByRole("switch", { name: "Remember catalog filters" }));

    let stored = JSON.parse(
      window.localStorage.getItem("sakurava.catalogPreferences.v1") ?? "{}",
    );
    expect(stored.toggles).toEqual({
      rememberView: true,
      rememberSort: true,
      rememberFilters: true,
    });

    stored.pages = {
      videos: {
        view: "table",
        sort: "Last Added",
        filters: { activeCategoryFilters: ["Example"] },
      },
    };
    window.localStorage.setItem(
      "sakurava.catalogPreferences.v1",
      JSON.stringify(stored),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reset Catalog Preferences" }),
    );

    expect(
      JSON.parse(
        window.localStorage.getItem("sakurava.catalogPreferences.v1") ?? "{}",
      ),
    ).toEqual({
      version: 1,
      toggles: {
        rememberView: true,
        rememberSort: true,
        rememberFilters: true,
      },
      pages: {},
    });
    expect(window.localStorage.getItem("unrelated.catalog.data")).toBe("preserve-me");
  });

  it("defaults Appearance theme to Light and persists Dark/Light selection", () => {
    window.history.pushState({}, "", "/settings");

    render(<App />);

    const lightButton = screen.getByRole("button", { name: /Light/ });
    const darkButton = screen.getByRole("button", { name: /^Dark$/ });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(lightButton).toHaveAttribute("aria-pressed", "true");
    expect(darkButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(darkButton);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(appearanceThemeStorageKey)).toBe("dark");
    expect(darkButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Light/ }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(appearanceThemeStorageKey)).toBe("light");
  });

  it("loads persisted Dark theme and falls back to Light for invalid saved theme", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(appearanceThemeStorageKey, "dark");
    const { unmount } = render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: /Dark/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    unmount();
    delete document.documentElement.dataset.theme;
    window.localStorage.setItem(appearanceThemeStorageKey, "neon");

    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: /Light/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("persists System theme and follows OS preference changes", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "System" }));

    expect(window.localStorage.getItem(appearanceThemeStorageKey)).toBe("system");
    expect(document.documentElement).toHaveAttribute(
      "data-theme-preference",
      "system",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    act(() => {
      systemThemeDark = true;
      systemThemeListeners.forEach((listener) =>
        listener({ matches: true } as MediaQueryListEvent),
      );
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("defaults App Language to English and falls back for invalid saved language", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(languageStorageKey, "invalid");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("App Language")).toHaveValue("en");
    expect(screen.getByRole("link", { name: "Navigate to Home" }))
      .toHaveAttribute("href", "/");
  });

  it("persists Indonesian App Language and reloads it", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        id: {
          "settings.title": "Pengaturan",
          "settings.language.appLanguage": "Bahasa Aplikasi",
          "app.sidebar.navigateTo": "Buka {label}",
          "nav.home": "Beranda",
        },
      }),
    );
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText("App Language"), {
      target: { value: "id" },
    });

    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
    expect(screen.getByRole("heading", { name: "Pengaturan" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Bahasa Aplikasi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backup & Recovery" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka Beranda" }))
      .toHaveAttribute("href", "/");

    unmount();
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(screen.getByLabelText("Bahasa Aplikasi")).toHaveValue("id");

    fireEvent.change(screen.getByLabelText("Bahasa Aplikasi"), {
      target: { value: "en" },
    });

    expect(window.localStorage.getItem(languageStorageKey)).toBe("en");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("applies the selected custom language inside the separate Image Viewer window", async () => {
    const eventHarness = createTauriEventHarness();
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }
        if (
          command === "plugin:event|unlisten" ||
          command === "plugin:event|emit_to"
        ) {
          return null;
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };
    window.history.pushState({}, "", "/?sakuravaWindow=image-viewer");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(languageStorageKey, "id");
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        id: {
          "viewer.showShortcuts": "Tampilkan pintasan gambar",
          "viewer.shortcuts.action.closeViewer": "Tutup penampil",
          "viewer.moreActions": "Aksi gambar lainnya",
          "viewer.more.saveAs": "Simpan Sebagai",
          "viewer.more.fileInfo": "Info Berkas",
          "viewer.fileInfo.name": "Nama Berkas",
        },
      }),
    );
    window.localStorage.setItem(
      "sakurava.globalImageViewer.payload.v1",
      JSON.stringify({
        images: [{ path: "C:/Gallery/translated.jpg" }],
        initialIndex: 0,
        openRequestId: "image-open-translated",
      }),
    );

    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Tampilkan pintasan gambar" }),
    );
    expect(screen.getByText("Tutup penampil")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aksi gambar lainnya" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Simpan Sebagai")).toBeInTheDocument();
    fireEvent.click(within(menu).getByText("Info Berkas"));
    expect(await screen.findByText("Nama Berkas")).toBeInTheDocument();
  });

  it("translates Performer Form availability labels and never renders malformed Unknown copy", () => {
    window.history.pushState({}, "", "/performers/new");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(languageStorageKey, "id");
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        id: {
          "enum.status.active": "Aktif",
          "enum.status.retired": "Pensiun",
          "enum.common.unknown": "Tidak diketahui",
        },
      }),
    );

    render(<App />);

    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("Pensiun")).toBeInTheDocument();
    expect(screen.getByText("Tidak diketahui")).toBeInTheDocument();
    expect(screen.queryByText(/Unknow|Unkown/)).not.toBeInTheDocument();
  });

  it("translates Category Management and Glossary filter controls, chips, and empty helpers", () => {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(languageStorageKey, "id");
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        id: {
          "common.filter": "Saring",
          "filter.childrenOnly": "Anak Saja",
          "filter.performersUsed": "Dipakai Performer",
          "categories.toolbar.filter": "Saring",
          "categories.toolbar.clearAllFilters": "Hapus semua filter",
          "categories.empty": "Kategori kosong",
          "categories.noMatches": "Tidak ada kategori cocok",
          "glossary.toolbar.clearAllFilters": "Hapus semua filter",
          "glossary.empty": "Glosarium kosong",
          "glossary.emptyHint": "Ubah pencarian atau tambahkan entri.",
        },
      }),
    );

    window.history.pushState({}, "", "/settings/category-management");
    const categoryView = render(<App />);
    fireEvent.click(
      screen.getByTestId("category-management-filter-control"),
    );
    expect(screen.getByRole("option", { name: "Anak Saja" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dipakai Performer" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Anak Saja" }));
    expect(screen.getByText("Saring: Anak Saja")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus semua filter" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search categories"), {
      target: { value: "no-category-can-match-this" },
    });
    expect(screen.getByText(/Tidak ada kategori cocok|Kategori kosong/))
      .toBeInTheDocument();

    categoryView.unmount();
    window.history.pushState({}, "", "/glossary");
    render(<App />);
    fireEvent.click(screen.getByTestId("glossary-category-filter-control"));
    fireEvent.click(screen.getByRole("option", { name: "Anak Saja" }));
    expect(screen.getByText("Saring: Anak Saja")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus semua filter" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search terms"), {
      target: { value: "no-glossary-entry-can-match-this" },
    });
    expect(screen.getByText("Glosarium kosong")).toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos",
      region: "Videos filters",
      option: "Availability: Dimiliki",
      expected: "Ketersediaan: Dimiliki",
    },
    {
      path: "/images",
      region: "Images filters",
      option: "Image Count: Banyak",
      expected: "Jumlah Gambar: Banyak",
    },
    {
      path: "/performers",
      region: "Performers filters",
      option: "Availability: Aktif",
      expected: "Ketersediaan: Aktif",
    },
  ])("translates active catalog filter chips for $path", ({
    path,
    region,
    option,
    expected,
  }) => {
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "id", label: "Indonesian", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(languageStorageKey, "id");
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({
        id: {
          "catalog.filterChip.availability": "Ketersediaan",
          "catalog.filterChip.imageCount": "Jumlah Gambar",
          "enum.availability.owned": "Dimiliki",
          "enum.count.many": "Banyak",
          "enum.status.active": "Aktif",
        },
      }),
    );
    window.history.pushState({}, "", path);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: region }))
        .getByRole("button", { name: option }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("does not translate user catalog data", () => {
    window.localStorage.setItem(languageStorageKey, "id");
    setManagedCategories(["Settings"]);
    window.history.pushState({}, "", "/categories");

    render(<App />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows real installed languages and exposes only functional Language controls", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "ja", label: "Japanese", baseLanguage: "en" }]),
    );
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (
          command === "video_list" ||
          command === "image_list" ||
          command === "performer_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);

    const languageCard = screen
      .getAllByRole("heading", { name: "Language" })[0]
      .closest("section") as HTMLElement;
    expect(languageCard).toBeInTheDocument();
    expect(within(languageCard).getByText("English, Japanese"))
      .toBeInTheDocument();
    expect(within(languageCard).getByRole("button", { name: "Manage..." }))
      .toBeEnabled();
    expect(within(languageCard).getByRole("button", { name: "Import Language CSV" }))
      .toBeEnabled();
    expect(
      within(languageCard).getByRole("button", {
        name: "Export Language CSV",
      }),
    ).toBeEnabled();
    expect(within(languageCard).queryByRole("button", { name: "Reset Language" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(languageCard).getByRole("button", { name: "Manage..." }));

    expect(within(languageCard).getByText("Default · Source · Protected"))
      .toBeInTheDocument();
    expect(
      within(languageCard).getByRole("button", {
        name: "Remove custom language Japanese",
      }),
    ).toBeEnabled();
  });

  it("removes an active custom language and falls back safely to English", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(languageStorageKey, "ja");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify([{ code: "ja", label: "Japanese", baseLanguage: "en" }]),
    );
    window.localStorage.setItem(
      languageOverridesStorageKey,
      JSON.stringify({ ja: { "settings.title": "設定" } }),
    );
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (
          command === "video_list" ||
          command === "image_list" ||
          command === "performer_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Manage..." }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove custom language Japanese",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Language" }));

    expect(screen.getByLabelText("App Language")).toHaveValue("en");
    expect(window.localStorage.getItem(languageStorageKey)).toBe("en");
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBeNull();
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBeNull();
    expect(screen.getByText(/Removed language "ja"/)).toBeInTheDocument();
  });

  it("imports a valid custom Language CSV without touching catalog data", async () => {
    window.history.pushState({}, "", "/settings");
    setManagedCategories(["Private User Category"]);
    const sourcePath = "D:/Languages/japanese.csv";
    const csvContent = [
      "language_code,key,text,context",
      "ja,nav.home,ホーム,Sidebar",
    ].join("\n");
    dialogMocks.open.mockResolvedValue(sourcePath);
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (
          command === "video_list" ||
          command === "image_list" ||
          command === "performer_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        if (command === "import_csv_read") {
          return {
            sourcePath,
            csvContent,
            bytesRead: csvContent.length,
            success: true,
          };
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Language CSV" }));
    expect(await screen.findByText("Add Japanese")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Language" }));

    expect(screen.getByLabelText("App Language")).toHaveTextContent("Japanese");
    expect(
      JSON.parse(
        window.localStorage.getItem(languageOverridesStorageKey) ?? "{}",
      ).ja["nav.home"],
    ).toBe("ホーム");
    expect(
      JSON.parse(
        window.localStorage.getItem("sakurava.managedCategories.v1") ?? "[]",
      ),
    ).toEqual(["Private User Category"]);
  });

  it("blocks a new Language CSV when 25 custom languages are installed", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      customLanguagesStorageKey,
      JSON.stringify(
        Array.from({ length: maxCustomLanguages }, (_, index) => ({
          code: `x${index.toString(36).padStart(2, "0")}`,
          label: `Custom ${index + 1}`,
          baseLanguage: "en",
        })),
      ),
    );
    const sourcePath = "D:/Languages/overflow.csv";
    const csvContent = [
      "language_code,key,text,context",
      "zz,nav.home,Overflow,Sidebar",
    ].join("\n");
    dialogMocks.open.mockResolvedValue(sourcePath);
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (
          command === "video_list" ||
          command === "image_list" ||
          command === "performer_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        if (command === "import_csv_read") {
          return {
            sourcePath,
            csvContent,
            bytesRead: csvContent.length,
            success: true,
          };
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Language CSV" }));

    expect(
      await screen.findByText(/Up to 25 custom languages can be installed/),
    ).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(customLanguagesStorageKey) ?? "[]",
      ),
    ).toHaveLength(maxCustomLanguages);
  });

  it("rejects an invalid Language CSV without corrupting installed languages", async () => {
    window.history.pushState({}, "", "/settings");
    const originalLanguages = JSON.stringify([
      { code: "ja", label: "Japanese", baseLanguage: "en" },
    ]);
    window.localStorage.setItem(customLanguagesStorageKey, originalLanguages);
    const sourcePath = "D:/Languages/invalid.csv";
    const csvContent = "Wrong,Headers\nja,Japanese";
    dialogMocks.open.mockResolvedValue(sourcePath);
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(async (command: string) => {
        if (
          command === "video_list" ||
          command === "image_list" ||
          command === "performer_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        if (command === "import_csv_read") {
          return {
            sourcePath,
            csvContent,
            bytesRead: csvContent.length,
            success: true,
          };
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke,
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Language CSV" }));

    expect(await screen.findByText(/Invalid CSV headers/)).toBeInTheDocument();
    expect(window.localStorage.getItem(customLanguagesStorageKey)).toBe(
      originalLanguages,
    );
    expect(window.localStorage.getItem(languageOverridesStorageKey)).toBeNull();
  });

  it("exports a Language starter CSV containing UI keys but no user data", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Languages/starter.csv";
    dialogMocks.save.mockResolvedValue(destinationPath);
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (
        command === "video_list" ||
        command === "image_list" ||
        command === "performer_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }
      if (command === "export_csv_write") {
        expect(args.destinationPath).toBe(destinationPath);
        expect(args.csvContent).toContain(",nav.home,Home,Nav > Home");
        for (const key of [
          "home.savedVideos",
          "enum.availability.owned",
          "sort.titleAz",
          "pagination.showing",
          "detail.ratingSummary",
          "rating.rewatch",
          "form.addSourceLink",
          "count.selected",
          "categoryManagement.subtitle",
          "glossary.saveEntry",
          "viewer.more.saveAs",
          "categories.table.header.name",
          "categories.table.header.description",
          "glossary.form.field.category",
          "glossary.form.field.thumbnail",
          "common.status.available",
        ]) {
          expect(args.csvContent).toContain(`,${key},`);
        }
        expect(args.csvContent).not.toContain("Private User Title");
        return { destinationPath, bytesWritten: args.csvContent.length, success: true };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Export Language CSV" }),
    );

    expect(await screen.findByText(`Language CSV exported to ${destinationPath}`))
      .toBeInTheDocument();
  });

  it("shows desktop runtime database status when Tauri is available", () => {
    window.history.pushState({}, "", "/settings");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    render(<App />);

    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
  });

  it("persists and applies Appearance accent presets", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Blue accent" }));

    expect(window.localStorage.getItem(appearanceAccentStorageKey)).toBe(
      '{"type":"blue"}',
    );
    expect(document.documentElement).toHaveAttribute("data-accent", "blue");
    expect(document.documentElement.style.getPropertyValue("--appearance-accent"))
      .toBe("#3b82f6");
    expect(screen.getByRole("button", { name: "Blue accent" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("routes the shared Sakura utility palette through Appearance tokens", () => {
    const colors = tailwindConfig.theme?.extend?.colors?.sakura;

    expect(colors).toMatchObject({
      50: "var(--appearance-accent-50)",
      100: "var(--appearance-accent-100)",
      200: "var(--appearance-accent-200)",
      300: "var(--appearance-accent-300)",
      400: "var(--appearance-accent-400)",
      500: "var(--appearance-accent-500)",
      600: "var(--appearance-accent-600)",
      700: "var(--appearance-accent-700)",
      800: "var(--appearance-accent-800)",
    });
  });

  it("validates, persists, and applies a custom Appearance accent", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    fireEvent.change(screen.getByLabelText("Custom accent color picker"), {
      target: { value: "#2f7f6f" },
    });

    expect(window.localStorage.getItem(appearanceAccentStorageKey)).toBe(
      '{"type":"custom","color":"#2f7f6f"}',
    );
    expect(document.documentElement).toHaveAttribute("data-accent", "custom");
    expect(document.documentElement.style.getPropertyValue("--appearance-accent"))
      .toBe("#2f7f6f");
  });

  it("falls back safely when a stored custom Appearance accent is invalid", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      appearanceAccentStorageKey,
      '{"type":"custom","color":"#ffffff"}',
    );
    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-accent", "sakura");
    expect(document.documentElement.style.getPropertyValue("--appearance-accent"))
      .toBe("#f16f9b");
    expect(screen.getByRole("button", { name: "Sakura Pink accent" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("persists and applies Appearance density", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(document.documentElement).toHaveAttribute(
      "data-density",
      "comfortable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));

    expect(window.localStorage.getItem(appearanceDensityStorageKey)).toBe(
      "compact",
    );
    expect(document.documentElement).toHaveAttribute("data-density", "compact");
    expect(screen.getByRole("button", { name: "Compact" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("loads safe density and UI Scale fallbacks and persists UI Scale", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(appearanceDensityStorageKey, "spacious");
    window.localStorage.setItem(appearanceUiScaleStorageKey, "125");
    render(<App />);

    expect(document.documentElement).toHaveAttribute(
      "data-density",
      "comfortable",
    );
    expect(document.documentElement).toHaveAttribute("data-ui-scale", "100");
    expect(screen.getByLabelText("UI Scale")).toHaveValue("100");

    fireEvent.change(screen.getByLabelText("UI Scale"), {
      target: { value: "110" },
    });

    expect(window.localStorage.getItem(appearanceUiScaleStorageKey)).toBe("110");
    expect(document.documentElement).toHaveAttribute("data-ui-scale", "110");
  });

  it("resets only Appearance preferences", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(languageStorageKey, "id");
    window.localStorage.setItem("unrelated.settings.value", "preserved");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "Purple accent" }));
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    fireEvent.change(screen.getByLabelText("UI Scale"), {
      target: { value: "110" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset Appearance" }));

    expect(window.localStorage.getItem(appearanceThemeStorageKey)).toBe("light");
    expect(window.localStorage.getItem(appearanceAccentStorageKey)).toBe(
      '{"type":"sakura"}',
    );
    expect(window.localStorage.getItem(appearanceDensityStorageKey)).toBe(
      "comfortable",
    );
    expect(window.localStorage.getItem(appearanceUiScaleStorageKey)).toBe("100");
    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
    expect(window.localStorage.getItem("unrelated.settings.value")).toBe(
      "preserved",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-accent", "sakura");
    expect(document.documentElement).toHaveAttribute(
      "data-density",
      "comfortable",
    );
    expect(document.documentElement).toHaveAttribute("data-ui-scale", "100");
  });

  it("renders the approved Idle, Import, and Export workflow hierarchy", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "managed_category_list", "glossary_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(screen.getByRole("button", { name: "Import Catalog" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Catalog" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Download Template" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Now" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Backup History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview Backup" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("import-export-panel")).queryByRole("table"))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Select sections to export")).not.toBeInTheDocument();
    expect(screen.queryByText("Preview only. No data has been changed.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));

    expect(screen.getByText("Select sections to export")).toBeInTheDocument();
    for (const section of ["Videos", "Images", "Performers", "Categories", "Glossary"]) {
      const checkbox = screen.getByRole("checkbox", { name: section });
      expect(checkbox).toBeEnabled();
      expect(checkbox.closest("label")).toHaveAttribute("data-sakurava-checkbox", "true");
    }
    const glossaryCheckbox = screen.getByRole("checkbox", { name: "Glossary" });
    expect(glossaryCheckbox).not.toBeChecked();
    fireEvent.click(glossaryCheckbox.closest("label")!);
    expect(glossaryCheckbox).toBeChecked();
    fireEvent.click(glossaryCheckbox.closest("label")!);
    const templateCheckbox = screen.getByRole("checkbox", { name: "Export as template" });
    expect(templateCheckbox).not.toBeChecked();
    expect(templateCheckbox.closest("label")).toHaveAttribute("data-sakurava-checkbox", "true");
    fireEvent.click(templateCheckbox.closest("label")!);
    expect(screen.getByText("Template")).toBeInTheDocument();
    fireEvent.click(templateCheckbox.closest("label")!);
    expect(screen.getByRole("radio", { name: /XLSX/ })).toBeChecked();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("Compatibility")).toBeInTheDocument();
    expect(screen.getByText("3 sections selected")).toBeInTheDocument();
    const csvRadio = screen.getByRole("radio", { name: /CSV/ });
    fireEvent.click(csvRadio.closest("label")!);
    expect(csvRadio).toBeChecked();
    expect(screen.getByText("Format: CSV")).toBeInTheDocument();
    for (const section of ["Videos", "Images", "Performers"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: section }));
    }
    expect(screen.getByRole("button", { name: "Export Selected" })).toBeDisabled();
    expect(screen.queryByLabelText("Import catalog preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Select sections to export")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Catalog" }))
      .toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));
    expect(screen.getByText("Select sections to export")).toBeInTheDocument();
    for (const section of ["Videos", "Images", "Performers"]) {
      expect(screen.getByRole("checkbox", { name: section })).not.toBeChecked();
    }
    dialogMocks.open.mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    expect(screen.queryByText("Select sections to export")).not.toBeInTheDocument();
    await waitFor(() => expect(dialogMocks.open).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Import Catalog" }))
      .toHaveAttribute("aria-pressed", "false"));
  });

  it("previews Video CSV import without mutating records", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-videos.csv";
    const existingVideo = persistedVideo({
      id: "video-import-1",
      title: "Original Video",
      categoriesJson: '["Favorite"]',
    });
    const deleteVideo = persistedVideo({
      id: "video-import-delete",
      title: "Delete Video",
    });
    const csvContent = [
      "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label,Censorship,Categories,Rating - Visual,Rating - Story,Rating - Performance,Rating - Chemistry,Rating - Intensity,Rating - Rewatch,Media Path,Cover Path,Related Performers,Related Images,Notes",
      `Auto,${sakuravaRef("VID", "video-import-1")},,Changed Video,,,,,Favorite; Unknown,,,,,,,,,,,`,
      "Create,,,New Video,,,,,Favorite,,,,,,,,,,,",
      `Delete,${sakuravaRef("VID", "video-import-delete")},,Delete Video,,,,,,,,,,,,,,,,`,
      "Skip,,,Ignored Video,,,,,,,,,,,,,,,",
    ].join("\r\n");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list") {
        return [existingVideo, deleteVideo];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [managedCategoryFixture({ name: "Favorite" })];
      }
      if (command === "glossary_list") {
        return [];
      }
      if (command === "credit_list") return [];
      if (command === "import_catalog_file_read") {
        expect(args.sourcePath).toBe(sourcePath);
        return {
          sourcePath,
          displayName: "sakurava-videos.csv",
          format: "csv",
          bytes: Array.from(new TextEncoder().encode(csvContent)),
          bytesRead: csvContent.length,
          success: true,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));

    const previewRegion = await screen.findByLabelText("Import catalog preview");
    expect(previewRegion).toBeInTheDocument();
    expect(screen.getByText("sakurava-videos.csv")).toBeInTheDocument();
    expect(previewRegion).toHaveTextContent("CSV");
    expect(screen.queryByText("Preview only. No data has been changed.")).not.toBeInTheDocument();
    const previewTable = within(previewRegion).getByRole("table");
    for (const column of ["Row", "Section", "Record", "Action", "Details", "Status"]) {
      expect(within(previewTable).getByRole("columnheader", { name: column }))
        .toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: /Create/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Update/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Skip/ })).toBeInTheDocument();
    const rowSearch = screen.getByRole("searchbox", { name: "Search rows" });
    fireEvent.change(rowSearch, { target: { value: "New Video" } });
    expect(within(previewTable).getByText("New Video")).toBeInTheDocument();
    expect(within(previewTable).queryByText(/Changed Video/)).not.toBeInTheDocument();
    fireEvent.change(rowSearch, { target: { value: "" } });
    expect(screen.getByText("New record will be created")).toBeInTheDocument();
    expect(screen.getByText("Record will be deleted")).toBeInTheDocument();
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.getByText("Category “Unknown” is not available")).toBeInTheDocument();
    const importPageSize = within(previewRegion).getByLabelText("Page size");
    expect(within(importPageSize).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["32", "64", "128", "256"]);
    expect(screen.getByRole("button", { name: "Apply Import" }))
      .toBeDisabled();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "video_create",
      expect.anything(),
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "video_delete",
      expect.anything(),
      undefined,
    );
  });

  it("shows XLSX file metadata and ignores guidance sheets in Preview", async () => {
    window.history.pushState({}, "", "/settings");
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.description = `${EXPORT_CONTRACT_VERSION}; dataTypes=videos`;
    workbook.addWorksheet("Instructions").addRow(["Guidance only"]);
    workbook.addWorksheet("Examples").addRow(["Never import"]);
    const videos = workbook.addWorksheet("Videos");
    videos.addRow(buildVideosCsv([]).split(","));
    videos.addRow(["Create", "", "V-001", "XLSX Preview", "", new Date(2026, 6, 14)]);
    const bytes = Array.from(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const sourcePath = "D:/Imports/sakurava-catalog.xlsx";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "managed_category_list", "glossary_list", "credit_list"].includes(command)) return [];
      if (command === "import_catalog_file_read") {
        return { sourcePath, displayName: "sakurava-catalog.xlsx", format: "xlsx", bytes, bytesRead: bytes.length, success: true };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));

    const preview = await screen.findByLabelText("Import catalog preview");
    expect(preview).toHaveTextContent("sakurava-catalog.xlsx");
    expect(preview).toHaveTextContent("XLSX");
    expect(preview).toHaveTextContent("1 rows");
    expect(within(preview).getByText("XLSX Preview")).toBeInTheDocument();
    expect(within(preview).queryByText("Guidance only")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Never import")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change File" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Apply Import" })).toBeEnabled();
  });

  it("previews Glossary CSV with Section, Details, and no-change semantics", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/skv-glo-20261507-100000.csv";
    const existing = persistedGlossaryEntry({ id: "glossary-existing", term: "Existing Term" });
    const createValues: Record<string, string> = {
      Action: "Auto",
      Term: "Created Term",
      Definition: "Created definition",
      Favorite: "false",
    };
    const createRow = buildGlossaryCsv([]).split(",")
      .map((header) => createValues[header] ?? "")
      .join(",");
    const csvContent = [
      buildGlossaryCsv([existing]),
      createRow,
    ].join("\r\n");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "managed_category_list"].includes(command)) return [];
      if (command === "glossary_list") return [existing];
      if (command === "credit_list") return [];
      if (command === "import_catalog_file_read") return {
        sourcePath,
        displayName: "skv-glo-20261507-100000.csv",
        format: "csv",
        bytes: Array.from(new TextEncoder().encode(csvContent)),
        bytesRead: csvContent.length,
        success: true,
      };
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    const preview = await screen.findByLabelText("Import catalog preview");
    expect(within(preview).getAllByText("Glossary").length).toBeGreaterThan(0);
    expect(within(preview).getByText("No changes")).toBeInTheDocument();
    expect(within(preview).getByText("No Changes")).toBeInTheDocument();
    expect(within(preview).getByText("New record will be created")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));
    expect(screen.getByText("Select sections to export")).toBeInTheDocument();
    expect(screen.queryByLabelText("Import catalog preview")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    const reopenedPreview = await screen.findByLabelText("Import catalog preview");
    expect(dialogMocks.open).toHaveBeenCalledTimes(2);
    fireEvent.click(within(reopenedPreview).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Import catalog preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Catalog" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(invoke).not.toHaveBeenCalledWith("glossary_create", expect.anything(), undefined);
  });

  it("applies reviewed Glossary Create, Update, Delete, Skip, and no-change rows", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/skv-glo-20261507-110000.csv";
    const updateTarget = persistedGlossaryEntry({ id: "glossary-update", term: "Update Term", definition: "Old" });
    const deleteTarget = persistedGlossaryEntry({ id: "glossary-delete", term: "Delete Term" });
    const sameTarget = persistedGlossaryEntry({ id: "glossary-same", term: "Same Term" });
    const headers = buildGlossaryCsv([]).split(",");
    const makeRow = (values: Record<string, string>) => headers
      .map((header) => values[header] ?? "")
      .join(",");
    const csvContent = [
      headers.join(","),
      makeRow({ Action: "Auto", Term: "Created Term", Definition: "Created definition", Favorite: "false" }),
      buildGlossaryCsv([{ ...updateTarget, definition: "Changed" }]).split("\r\n")[1],
      buildGlossaryCsv([deleteTarget]).split("\r\n")[1].replace(/^Auto,/, "Delete,"),
      makeRow({ Action: "Skip", Term: "Ignored", Definition: "Ignored", Favorite: "false" }),
      buildGlossaryCsv([sameTarget]).split("\r\n")[1],
    ].join("\r\n");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list", "managed_category_list"].includes(command)) return [];
      if (command === "glossary_list") return [updateTarget, deleteTarget, sameTarget];
      if (command === "credit_list") return [];
      if (command === "import_catalog_file_read") return {
        sourcePath,
        displayName: "skv-glo-20261507-110000.csv",
        format: "csv",
        bytes: Array.from(new TextEncoder().encode(csvContent)),
        bytesRead: csvContent.length,
        success: true,
      };
      if (command === "import_catalog_apply") {
        expect(args.plan.operations.map((operation: any) => operation.action))
          .toEqual(["create", "update", "delete"]);
        expect(args.plan.operations.every((operation: any) => operation.section === "glossary"))
          .toBe(true);
        return {
          transactionStatus: "committed", backupPackageName: "sakurava-backup-import-safety",
          createdCount: 1, updatedCount: 1, clearedFieldCount: 0,
          deletedCount: 1, skippedCount: 2, failureStage: null,
          message: "Catalog import applied successfully.", rollbackCompleted: false,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    expect(await screen.findByLabelText("Import catalog preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Import" }));
    const dialog = screen.getByRole("dialog", { name: "Apply this import?" });
    expect(within(dialog).getByText("1 records will be deleted. Original media files will not be changed."))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply Import" }));

    expect(await screen.findByText("3 catalog changes applied together.")).toBeInTheDocument();
    expect(invoke.mock.calls.filter(([command]) => command === "import_catalog_apply")).toHaveLength(1);
    expect(invoke).not.toHaveBeenCalledWith("glossary_create", expect.anything(), undefined);
  });

  it("disables Apply Import when a local date is impossible", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/invalid-date.csv";
    const csvContent = [
      buildVideosCsv([]),
      "Create,,,Impossible Date,,2/30/2026,,,,,,,,,,,,,,",
    ].join("\r\n");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "managed_category_list", "glossary_list", "credit_list"].includes(command)) return [];
      if (command === "import_catalog_file_read") return {
        sourcePath, displayName: "invalid-date.csv", format: "csv",
        bytes: Array.from(new TextEncoder().encode(csvContent)), bytesRead: csvContent.length, success: true,
      };
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    expect(await screen.findByText("Date is not valid for this computer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Import" })).toBeDisabled();
    expect(screen.queryByText(/must use YYYY-MM-DD/)).not.toBeInTheDocument();
  });

  it("applies valid CSV rows only after explicit confirmation and shows report", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-videos-apply.csv";
    const csvContent = [
      "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label,Censorship,Categories,Rating - Visual,Rating - Story,Rating - Performance,Rating - Chemistry,Rating - Intensity,Rating - Rewatch,Media Path,Cover Path,Related Performers,Related Images,Notes",
      "Create,,,New Applied Video,,,,,Favorite,,,,,,4,D:/media/new.mp4,,,,Created from CSV",
    ].join("\r\n");
    let resolveApply!: (value: Record<string, unknown>) => void;
    const applyPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveApply = resolve;
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list") {
        return [];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [managedCategoryFixture({ name: "Favorite" })];
      }
      if (command === "glossary_list") {
        return [];
      }
      if (command === "credit_list") {
        return [];
      }
      if (command === "import_catalog_file_read") {
        return {
          sourcePath,
          displayName: "sakurava-videos-apply.csv",
          format: "csv",
          bytes: Array.from(new TextEncoder().encode(csvContent)),
          bytesRead: csvContent.length,
          success: true,
        };
      }
      if (command === "import_catalog_apply") {
        expect(args.plan.operations[0].proposedValues).toEqual(
          expect.objectContaining({
            title: "New Applied Video",
            categoriesJson: '["Favorite"]',
            mediaPath: "D:/media/new.mp4",
            ratingJson: '{"rewatch":4}',
            notes: "Created from CSV",
          }),
        );
        return applyPromise;
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    expect(screen.queryByRole("button", { name: "Apply Import" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    expect(await screen.findByLabelText("Import catalog preview"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Import" }));

    const confirmDialog = screen.getByRole("dialog", { name: "Apply this import?" });
    expect(confirmDialog).toBeInTheDocument();
    expect(within(confirmDialog).getByText(/reviewed changes will be applied to your catalog/i))
      .toBeInTheDocument();
    expect(within(confirmDialog).getByText(/Original media files will not be changed/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "import_catalog_apply",
      expect.anything(),
      undefined,
    );

    const confirmApplyButton = within(confirmDialog).getByRole("button", { name: "Apply Import" });
    fireEvent.click(confirmApplyButton);
    fireEvent.click(confirmApplyButton);

    await waitFor(() => {
      expect(invoke.mock.calls.filter(([command]) => command === "import_catalog_apply"))
        .toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: "Import Catalog" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Catalog" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change File" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Cancel" })
      .every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    await act(async () => {
      resolveApply({
        transactionStatus: "committed", backupPackageName: "sakurava-backup-import-safety",
        createdCount: 1, updatedCount: 0, clearedFieldCount: 0,
        deletedCount: 0, skippedCount: 0, failureStage: null,
        message: "Catalog import applied successfully.", rollbackCompleted: false,
      });
      await applyPromise;
    });

    expect(await screen.findByText("1 catalog changes applied together."))
      .toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "import_catalog_apply",
      expect.anything(),
      undefined,
    );
    expect(invoke.mock.calls.filter(([command]) => command === "import_catalog_apply"))
      .toHaveLength(1);
    expect(invoke).not.toHaveBeenCalledWith(
      "video_delete",
      expect.anything(),
      undefined,
    );
  });

  it("keeps Category CSV apply consistent between Categories Catalog and Manage Category", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-categories-apply.csv";
    let categories = [
      managedCategoryFixture({ key: "cat_old", name: "Old Category" }),
    ];
    const csvContent = [
      "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Visibility,Notes",
      `Delete,${sakuravaRef("CAT", "cat_old")},,Old Category,,,,`,
      "Create,,,New Category,Imported,,,",
    ].join("\r\n");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      if (command === "managed_category_list") {
        return categories;
      }
      if (command === "glossary_list") {
        return [];
      }
      if (command === "credit_list") {
        return [];
      }
      if (command === "import_catalog_file_read") {
        return {
          sourcePath,
          displayName: "sakurava-categories-apply.csv",
          format: "csv",
          bytes: Array.from(new TextEncoder().encode(csvContent)),
          bytesRead: csvContent.length,
          success: true,
        };
      }
      if (command === "import_catalog_apply") {
        categories = [managedCategoryFixture({ key: "cat_new", name: "New Category", description: "Imported" })];
        return {
          transactionStatus: "committed", backupPackageName: "sakurava-backup-import-safety",
          createdCount: 1, updatedCount: 0, clearedFieldCount: 0,
          deletedCount: 1, skippedCount: 0, failureStage: null,
          message: "Catalog import applied successfully.", rollbackCompleted: false,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Catalog" }));
    expect(await screen.findByLabelText("Import catalog preview"))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Import" }));
    const categoryImportDialog = screen.getByRole("dialog", { name: "Apply this import?" });
    expect(within(categoryImportDialog).getByText("1 records will be deleted. Original media files will not be changed."))
      .toBeInTheDocument();
    fireEvent.click(within(categoryImportDialog).getByRole("button", { name: "Apply Import" }));
    expect(await screen.findByText("2 catalog changes applied together."))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Navigate to Categories" }));
    expect(await screen.findByRole("heading", { name: "Category Management" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("New Category").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old Category")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Navigate to Categories" }));
    expect(await screen.findByRole("heading", { name: "Category Management" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("New Category").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old Category")).not.toBeInTheDocument();
  });

  it("exports Videos CSV as a read-only data operation", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Exports/sakurava-videos.csv";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video-export-1",
            code: "V-EXPORT-001",
            title: 'Video, "Export"',
            releaseDate: "5/20/2026",
            categoriesJson: '["Drama","Favorite"]',
            ratingJson: '{"story":5}',
            mediaPath: "D:/Videos/export.mp4",
            relatedPerformersJson:
              '[{"performerId":"performer-1","nameSnapshot":"Performer One"}]',
            notes: "Line one\nLine two",
          }),
        ];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "export_file_write") {
        expect(args.destinationPath).toBe(destinationPath);
        const csvContent = new TextDecoder().decode(new Uint8Array(args.bytes));
        expect(args.expectedExtension).toBe("csv");
        expect(csvContent).toContain(
          "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label",
        );
        expect(csvContent).toContain("V-EXPORT-001");
        expect(csvContent).toContain("5/20/2026");
        expect(csvContent).toContain("Auto,VID-");
        expect(csvContent).not.toContain("sakuravaUpdateKey");
        expect(csvContent).not.toContain("video-export-1");
        expect(csvContent).not.toContain("ratingJson");
        expect(csvContent).not.toContain("categoriesJson");
        expect(csvContent).toContain('"Video, ""Export"""');
        expect(csvContent).toContain("Drama; Favorite");
        expect(csvContent).toContain(",,5,,,,");
        expect(csvContent).toMatch(/PER-[0-9A-Z]{7} \| Performer One/);
        expect(csvContent).toContain("D:/Videos/export.mp4");
        expect(csvContent).not.toContain("Duration");
        expect(csvContent).not.toContain("Availability");
        expect(csvContent).not.toContain("mediaBinary");
        return {
          destinationPath: args.destinationPath,
          displayName: "sakurava-videos.csv",
          bytesWritten: args.bytes.length,
          success: true,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.save.mockResolvedValue(destinationPath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Images" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Performers" }));
    fireEvent.click(screen.getByRole("radio", { name: /CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export Selected" }));

    await screen.findByText(
      "sakurava-videos.csv. Videos: 1.",
      { exact: false },
    );
    expect(dialogMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(
          /^skv-vid-\d{8}-\d{6}\.csv$/,
        ),
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      undefined,
    );
  });

  it("exports Categories CSV as a read-only data operation", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Exports/sakurava-categories.csv";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_parent",
            name: "Genre",
            description: "Parent",
          }),
          managedCategoryFixture({
            key: "cat_child",
            name: "Drama",
            parentKey: "cat_parent",
            thumbnailPath: "D:/Thumbs/drama.jpg",
          }),
        ];
      }
      if (command === "export_file_write") {
        expect(args.destinationPath).toBe(destinationPath);
        const csvContent = new TextDecoder().decode(new Uint8Array(args.bytes));
        expect(csvContent).toContain(
          "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Show in Videos,Show in Images,Show in Performers,Visibility,Notes",
        );
        expect(csvContent).toContain("Auto,CAT-");
        expect(csvContent).toContain(",Genre,Drama,");
        expect(csvContent).not.toContain("cat_parent");
        expect(csvContent).not.toContain("cat_child");
        return {
          destinationPath: args.destinationPath,
          displayName: "sakurava-categories.csv",
          bytesWritten: args.bytes.length,
          success: true,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.save.mockResolvedValue(destinationPath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Videos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Images" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Performers" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Categories" }));
    fireEvent.click(screen.getByRole("radio", { name: /CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export Selected" }));

    await screen.findByText(
      "sakurava-categories.csv. Managed Categories: 2.",
      { exact: false },
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "managed_category_update",
      expect.anything(),
      undefined,
    );
  });

  it("exports Glossary CSV through the shared catalog export flow", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Exports/sakurava-glossary.csv";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "glossary_list") {
        return [persistedGlossaryEntry({ term: "Citation", definition: "A source reference.", synonymsJson: '["Source"]' })];
      }
      if (command === "export_file_write") {
        expect(args.destinationPath).toBe(destinationPath);
        const csvContent = new TextDecoder().decode(new Uint8Array(args.bytes));
        expect(csvContent).toContain("Action,Sakurava Ref,Term,Definition,Synonyms");
        expect(csvContent).toContain("Auto,GLO-");
        expect(csvContent).toContain("Citation,A source reference.,Source");
        return { destinationPath, displayName: "sakurava-glossary.csv", bytesWritten: args.bytes.length, success: true };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    dialogMocks.save.mockResolvedValue(destinationPath);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Export Catalog" }));
    for (const section of ["Videos", "Images", "Performers"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: section }));
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Glossary" }));
    fireEvent.click(screen.getByRole("radio", { name: /CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export Selected" }));

    await screen.findByText("sakurava-glossary.csv. Glossary: 1.", { exact: false });
    expect(dialogMocks.save).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: expect.stringMatching(/^skv-glo-\d{8}-\d{6}\.csv$/),
    }));
  });

  it("renders Category Management table columns and pagination controls", () => {
    window.history.pushState({}, "", "/settings/category-management");
    setManagedCategories(
      Array.from(
        { length: 37 },
        (_, index) => `Category ${String(index + 1).padStart(2, "0")}`,
      ),
    );

    render(<App />);

    const toolbar = screen.getByLabelText("Category Management toolbar");
    const toolbarRow = screen.getByTestId("category-management-toolbar-row");
    const pagination = screen.getByLabelText("Category Management pagination");
    const table = screen.getByRole("table");
    const tableScroll = screen.getByTestId("category-management-table-scroll");
    expect(screen.getByTestId("category-management-route-page")).toHaveClass("space-y-6");
    expect(screen.getByTestId("category-management-route-page").className)
      .not.toContain("max-w-[1180px]");
    expect(screen.getByTestId("category-management-page")).toHaveClass("space-y-6");
    expect(screen.getByRole("heading", { name: "Category Management" }))
      .toHaveClass("text-4xl", "font-semibold", "tracking-normal");
    expect(
      toolbar.compareDocumentPosition(pagination)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pagination.compareDocumentPosition(table)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toolbarRow).toHaveClass(
      "flex",
      "w-full",
      "sm:flex-row",
    );
    for (const control of [
      screen.getByLabelText("Search categories"),
      screen.getByTestId("category-management-filter-control"),
      screen.getByRole("button", { name: "Sort" }),
      screen.getByRole("button", { name: "Card view" }),
    ]) {
      expect(control.closest("[data-testid='category-management-toolbar-row']"))
        .toBe(toolbarRow);
    }
    expect(
      within(screen.getByTestId("category-management-filter-control")).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
    for (const column of ["NAME", "PARENT", "DESCRIPTION", "USAGE", "TOTAL USAGE"]) {
      expect(within(table).getByRole("columnheader", { name: column }))
        .toBeInTheDocument();
    }
    expect(within(table).getByText("Thumbnail")).toHaveClass("sr-only");
    expect(
      within(table).getAllByLabelText("Category thumbnail placeholder").length,
    ).toBeGreaterThan(0);
    expect(within(table).queryByRole("columnheader", { name: "Action" }))
      .not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /^Edit / }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent("Title A-Z");
    expect(screen.getByRole("button", { name: "Sort" })).not.toHaveTextContent(/^Sort$/);
    expect(screen.getByRole("button", { name: "Sort" })).toHaveClass("sm:w-44");
    expect(screen.getByRole("button", { name: "Card view" })).toHaveClass("sm:w-auto");
    expect(screen.getByTestId("category-management-sort-control").querySelector("svg"))
      .not.toBeNull();
    expect(screen.getByTestId("category-management-filter-control").querySelector("svg"))
      .not.toBeNull();
    expect(tableScroll).toHaveClass("sticky-horizontal-scroll-body", "overflow-x-auto");
    expect(tableScroll.closest("[data-sticky-horizontal-scroll='true']"))
      .toHaveClass("sticky-horizontal-scroll-frame");
    expect(tableScroll.className).not.toContain("px-");
    expect(tableScroll.className).not.toContain("mx-");
    expect(table.className).not.toContain("sakura");
    expect(screen.queryByText("Sorting")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Active category filters")).not.toBeInTheDocument();
    expect(screen.getByLabelText("0 active filters")).toHaveTextContent("0");
    expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
    expect(screen.queryByText("No filter selected")).not.toBeInTheDocument();

    expect(screen.getByText("Showing 1-32 of 37")).toBeInTheDocument();
    expect(screen.queryByText("Showing 1-32 of 37 categories")).not.toBeInTheDocument();
    expect(screen.getByText("Page size")).toBeInTheDocument();
    expect(screen.getByText("per page")).toBeInTheDocument();
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Categories per page")).toHaveLength(1);
    expect(screen.getByLabelText("Categories per page")).toHaveDisplayValue("32");
    expect(screen.getByLabelText("Categories per page control")).toHaveClass(
      "h-9",
      "rounded-lg",
      "border-slate-200",
      "px-3",
    );
    fireEvent.click(screen.getByLabelText("Categories per page control"));
    expect(
      screen.getByRole("listbox", {
        name: "Categories per page options",
      }).parentElement,
    ).toHaveAttribute("data-placement", "down");
    fireEvent.keyDown(document, { key: "Escape" });
    for (const option of ["32", "64", "128", "256"]) {
      expect(screen.getByRole("option", { name: option })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Showing 33-37 of 37")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Categories per page"), {
      target: { value: "64" },
    });

    expect(screen.getByText("Showing 1-37 of 37")).toBeInTheDocument();
  });

  it("truncates long Category Management table values without widening columns", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_parent_long",
            name: "Managed Category With An Extremely Long Name That Should Truncate",
            description:
              "A long category description that should wrap and clamp instead of forcing the table wider than intended.",
          }),
          managedCategoryFixture({
            key: "cat_child_long",
            name: "Child With A Very Long Category Name For Truncation",
            parentKey: "cat_parent_long",
            description:
              "A child description that also needs to stay inside the row and not shift the table layout around.",
          }),
        ];
      }
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const table = await screen.findByRole("table");
    expect(
      within(table).getAllByText(
        "Managed Category With An Extremely Long Name That Should Truncate",
      )[0],
    ).toHaveClass("truncate");
    expect(
      within(table).getByText(
        "A long category description that should wrap and clamp instead of forcing the table wider than intended.",
      ),
    ).toHaveClass("line-clamp-2");
    expect(screen.getByTestId("category-parent-chip")).toHaveClass("overflow-hidden");
    expect(within(table).getByLabelText("1 child")).toHaveClass("overflow-hidden");
  });

  it("uses a custom Category Management Sort picker and preserves sort behavior", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_bravo",
            name: "Bravo Category",
            createdAt: "2026-05-13T00:00:00.000Z",
            updatedAt: "2026-05-13T00:00:00.000Z",
          }),
          managedCategoryFixture({
            key: "cat_alpha",
            name: "Alpha Category",
            createdAt: "2026-05-12T00:00:00.000Z",
            updatedAt: "2026-05-12T00:00:00.000Z",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    await screen.findByText("Alpha Category");
    const table = screen.getByRole("table");
    let bodyRows = within(table).getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("Alpha Category")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText("Bravo Category")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    const sortListbox = screen.getByRole("listbox", { name: "Sort options" });
    for (const optionName of [
      "Title A-Z",
      "Title Z-A",
      "Last Added",
      "Last Modified",
    ]) {
      const option = within(sortListbox).getByRole("option", { name: optionName });
      expect(option).toBeInTheDocument();
      expect(option.querySelector(".lucide-plus")).toBeNull();
      expect(option.querySelector(".lucide-check")).toBeNull();
    }

    fireEvent.click(within(sortListbox).getByRole("option", { name: "Last Added" }));
    expect(screen.queryByRole("listbox", { name: "Sort options" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent("Last Added");
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("Bravo Category")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText("Alpha Category")).toBeInTheDocument();

    selectCategorySort("Title A-Z");
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByText("Alpha Category")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText("Bravo Category")).toBeInTheDocument();
  });

  it("toggles Category Management entry form and card/table views", () => {
    window.history.pushState({}, "", "/settings/category-management");
    setManagedCategories(["Category A", "Category B"]);

    render(<App />);

    expect(screen.getByRole("button", { name: "Add Category" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add Category" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));

    expect(screen.getByRole("heading", { name: "Add Category" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Category Management" }))
      .toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getAllByText("*")).toHaveLength(2);
    expect(screen.getByText("Parent Category")).toBeInTheDocument();
    expect(screen.getByText("Used In")).toBeInTheDocument();
    const usedInControls = screen.getByLabelText("Used In controls");
    expect(usedInControls).toHaveClass(
      "grid",
      "w-full",
      "grid-cols-2",
      "lg:grid-cols-4",
    );
    for (const label of ["Videos", "Images", "Performers", "Credits"]) {
      const toggle = within(usedInControls).getByRole("button", {
        name: `Show in ${label}`,
      });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveClass("bg-slate-50", "text-slate-500");
    }
    fireEvent.click(
      within(usedInControls).getByRole("button", { name: "Show in Images" }),
    );
    fireEvent.click(
      within(usedInControls).getByRole("button", { name: "Show in Credits" }),
    );
    expect(
      within(usedInControls).getByRole("button", { name: "Show in Images" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Thumbnail").length).toBeGreaterThan(0);
    expect(screen.getByText("Definition")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Category" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard changes?" }))
      .toBeInTheDocument();
    confirmDialog("Discard");
    expect(screen.queryByRole("heading", { name: "Add Category" }))
      .not.toBeInTheDocument();

    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    const categoryCard = screen.getByRole("article", { name: "Category Category A" });
    expect(categoryCard).toBeInTheDocument();
    const cardPlaceholder = within(categoryCard).getByLabelText(
      "Category thumbnail placeholder",
    );
    expect(cardPlaceholder).toBeInTheDocument();
    expect(categoryCard).toHaveAttribute("data-category-card-kind", "root");
    expect(categoryCard).toHaveClass("bg-slate-50");
    expect(cardPlaceholder.parentElement).toHaveClass("aspect-square");
    expect(cardPlaceholder.parentElement).toHaveClass(
      "category-accent-placeholder",
    );
    expect(cardPlaceholder.parentElement?.className).not.toContain("ring-");
    expect(cardPlaceholder.parentElement?.className).not.toContain("border");
    expect(within(categoryCard).getByText("No Parent Selected")).toBeInTheDocument();
    expect(within(categoryCard).getByText("N/A")).toBeInTheDocument();
    expect(within(categoryCard).getByTitle("Videos")).toHaveClass("bg-white");
    expect(within(categoryCard).getByLabelText("Videos 0")).toBeInTheDocument();
    expect(within(categoryCard).getByLabelText("Images 0")).toBeInTheDocument();
    expect(within(categoryCard).getByLabelText("Performers 0")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("creates, edits, cancels, and validates Category Management form safely", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    let categories = [
      managedCategoryFixture({
        key: "cat_parent",
        name: "Parent Category",
      }),
      managedCategoryFixture({
        key: "cat_child",
        name: "Child Category",
        parentKey: "cat_parent",
        description: "Child definition",
        thumbnailPath: "D:/Thumbs/child.jpg",
        showInImages: false,
      }),
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return categories;
      }
      if (command === "managed_category_create") {
        const created = managedCategoryFixture({
          key: "cat_new",
          name: args.input.name,
          parentKey: args.input.parentKey ?? null,
          description: args.input.description ?? "",
          thumbnailPath: args.input.thumbnailPath ?? "",
        });
        categories = [...categories, created];
        return created;
      }
      if (command === "managed_category_update") {
        categories = categories.map((category) =>
          category.key === args.key
            ? {
                ...category,
                ...args.patch,
                parentKey:
                  args.patch.parentKey === undefined
                    ? category.parentKey
                    : args.patch.parentKey,
              }
            : category,
        );
        return categories.find((category) => category.key === args.key);
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: (path: string) => `asset://${path}`,
    };

    render(<App />);

    expect(await screen.findAllByText("Parent Category")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));
    expect(screen.getByRole("heading", { name: "Add Category" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Category name")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Search parent categories")).toHaveDisplayValue(
      "No Parent Selected",
    );

    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "  parent category  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));
    expect(await screen.findByText("A category with this name already exists."))
      .toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "managed_category_create",
      expect.anything(),
      undefined,
    );

    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "  New Category  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show in Images" }));
    fireEvent.click(screen.getByRole("button", { name: "Show in Credits" }));
    clickSaveEntryAndConfirm();
    expect(await screen.findByText("Data created successfully."))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Category" }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText("Category name"))
      .toHaveDisplayValue("");
    expect(invoke).toHaveBeenCalledWith(
      "managed_category_create",
      {
        input: expect.objectContaining({
          name: "New Category",
          parentKey: null,
          description: "",
          thumbnailPath: "",
          showInVideos: false,
          showInImages: true,
          showInPerformers: false,
          showInCredits: true,
        }),
      },
      undefined,
    );

    fireEvent.click(screen.getByRole("row", { name: "Edit Child Category" }));
    expect(screen.getByRole("heading", { name: "Edit Category" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Category name")).toHaveDisplayValue(
      "Child Category",
    );
    expect(screen.getByLabelText("Search parent categories")).toHaveDisplayValue(
      "Parent Category",
    );
    expect(screen.getByPlaceholderText("Local path or reference"))
      .toHaveDisplayValue("D:/Thumbs/child.jpg");
    expect(screen.getByPlaceholderText("Plain text definition"))
      .toHaveDisplayValue("Child definition");
    expect(screen.getByRole("button", { name: "Show in Videos" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show in Images" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Show in Performers" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show in Credits" }))
      .toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "Unsaved Child" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("row", { name: "Edit Child Category" }));
    expect(screen.getByPlaceholderText("Category name")).toHaveDisplayValue(
      "Child Category",
    );

    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "  Updated Child  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Plain text definition"), {
      target: { value: "  Updated definition  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Show in Performers" }));
    clickSaveEntryAndConfirm();
    expect(await screen.findByText("Data updated successfully."))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Category" }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText("Category name"))
      .toHaveDisplayValue("");
    expect(invoke).toHaveBeenCalledWith(
      "managed_category_update",
      {
        key: "cat_child",
        patch: expect.objectContaining({
          name: "Updated Child",
          parentKey: "cat_parent",
          description: "Updated definition",
          thumbnailPath: "D:/Thumbs/child.jpg",
          showInVideos: true,
          showInImages: false,
          showInPerformers: false,
          showInCredits: false,
        }),
      },
      undefined,
    );
  });

  it("blocks unsafe Category Management delete and confirms unused leaf deletion", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    let categories = [
      managedCategoryFixture({
        key: "cat_parent",
        name: "Parent Category",
      }),
      managedCategoryFixture({
        key: "cat_used",
        name: "Used Category",
      }),
      managedCategoryFixture({
        key: "cat_unused",
        name: "Unused Category",
      }),
      managedCategoryFixture({
        key: "cat_child",
        name: "Child Category",
        parentKey: "cat_parent",
      }),
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Used Video",
            categoriesJson: '["Used Category"]',
          }),
        ];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return categories;
      }
      if (command === "managed_category_delete") {
        categories = categories.filter((category) => category.key !== args.key);
        return { key: args.key, deleted: true };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    await screen.findByRole("button", { name: "Collapse Parent Category" });
    fireEvent.click(screen.getByRole("row", { name: "Edit Parent Category" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(
      screen.getByText("Delete is blocked while this category has child categories."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("row", { name: "Edit Used Category" }));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(
      screen.getByText("Delete is blocked while records use this category."),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "managed_category_delete",
      expect.anything(),
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("row", { name: "Edit Unused Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete category?" }))
      .toBeInTheDocument();
    confirmDialog("Delete");

    expect(await screen.findByText("Data deleted successfully."))
      .toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "managed_category_delete",
      { key: "cat_unused" },
      undefined,
    );
    expect(screen.queryByRole("row", { name: "Edit Unused Category" }))
      .not.toBeInTheDocument();
  });

  it("renders Category Management table hierarchy and prevents self-parent selection", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    const managedCategories = [
      managedCategoryFixture({
        key: "cat_parent",
        name: "Parent Category",
        description: "Parent definition",
      }),
      managedCategoryFixture({
        key: "cat_child",
        name: "Child Category",
        parentKey: "cat_parent",
        description: "Child definition",
        thumbnailPath: "D:/Thumbs/child.jpg",
      }),
      managedCategoryFixture({
        key: "cat_solo",
        name: "Solo Category",
      }),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Parent Video",
            categoriesJson: '["Parent Category"]',
          }),
          persistedVideo({
            title: "Child Video",
            categoriesJson: '["Child Category"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            title: "Child Image",
            categoriesJson: '["Child Category"]',
          }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            name: "Child Performer",
            categoriesJson: '["Child Category"]',
          }),
        ];
      }
      if (command === "managed_category_list") {
        return managedCategories;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: (path: string) => `asset://${path}`,
    };

    render(<App />);

    await screen.findByRole("button", { name: "Collapse Parent Category" });
    const table = screen.getByRole("table");
    let bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);
    expect(within(bodyRows[0]).getByText("Parent Category")).toBeInTheDocument();
    expect(bodyRows[0]).toHaveAttribute("data-category-row-kind", "parent");
    expect(bodyRows[0]).toHaveClass("bg-slate-50", "hover:bg-sakura-50/60");
    expect(bodyRows[0].className).not.toContain("border-l");
    expect(within(bodyRows[0]).getByLabelText("1 child")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("Category thumbnail placeholder"))
      .toHaveClass("category-table-thumbnail-box", "aspect-square", "size-11", "rounded-lg");
    expect(within(bodyRows[1]).getByText("Child Category")).toBeInTheDocument();
    expect(bodyRows[1]).toHaveAttribute("data-category-row-kind", "child");
    expect(bodyRows[1]).toHaveAttribute(
      "data-category-child-indent",
      "from-thumbnail",
    );
    expect(bodyRows[1]).toHaveClass("bg-white", "hover:bg-sakura-50/50");
    expect(bodyRows[1].className).not.toContain("border-l");
    expect(within(bodyRows[1]).queryByText("Parent Category > Child Category"))
      .not.toBeInTheDocument();
    const childThumbnail = within(bodyRows[1]).getByTestId("category-table-thumbnail");
    expect(childThumbnail)
      .toHaveClass("category-table-thumbnail-box", "aspect-square", "size-11", "rounded-lg");
    expect(childThumbnail.querySelector("img")).toHaveClass("h-full", "w-full", "object-cover");
    expect(within(bodyRows[1]).queryByText("-")).not.toBeInTheDocument();
    expect(within(bodyRows[1]).queryByText("−")).not.toBeInTheDocument();
    const parentThumbnailCell = within(bodyRows[0])
      .getByLabelText("Category thumbnail placeholder")
      .closest("td");
    const childThumbnailCell = within(bodyRows[1])
      .getByTestId("category-table-thumbnail")
      .closest("td");
    const childNameCell = within(bodyRows[1])
      .getByText("Child Category")
      .closest("td");
    const parentChip = within(bodyRows[1]).getByTestId("category-parent-chip");
    const childParentCell = parentChip.closest("td");
    const childUsageCell = within(bodyRows[1])
      .getByLabelText("Videos 1")
      .closest("td");
    const childTotalUsageCell = within(bodyRows[1])
      .getByText("3")
      .closest("td");
    expect(parentThumbnailCell).not.toHaveClass("pl-6");
    expect(childThumbnailCell).toHaveClass("pl-6");
    expect(childNameCell).toHaveClass("pl-6");
    expect(childParentCell).toHaveClass("pl-6");
    expect(childUsageCell).toHaveClass("pl-6");
    expect(childTotalUsageCell).toHaveClass("pl-6");
    expect(parentChip).toHaveClass("inline-flex", "w-fit", "bg-sakura-50");
    expect(parentChip).not.toHaveClass("block", "w-full", "flex-1");
    expect(within(bodyRows[0]).getByLabelText("Videos 2")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("Images 1")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("Performers 1")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByText("4")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByLabelText("Videos 1")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByLabelText("Images 1")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByLabelText("Performers 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort by NAME" }));
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("Parent Category");
    expect(bodyRows[1]).toHaveTextContent("Child Category");
    expect(
      screen.getByRole("button", { name: "Sort by NAME" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by NAME" }));
    expect(
      screen.getByRole("button", { name: "Sort by NAME" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");

    fireEvent.click(
      within(bodyRows[0]).getByRole("button", {
        name: "Collapse Parent Category",
      }),
    );
    expect(screen.queryByRole("heading", { name: "Edit Category" }))
      .not.toBeInTheDocument();
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    fireEvent.click(
      within(bodyRows[0]).getByRole("button", {
        name: "Expand Parent Category",
      }),
    );
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);
    fireEvent.click(bodyRows[1]);
    const parentPicker = screen.getByTestId("parent-category-picker-field");
    const parentSearch = within(parentPicker).getByLabelText(
      "Search parent categories",
    );
    expect(parentSearch).toHaveDisplayValue("Parent Category");
    fireEvent.focus(parentSearch);
    expect(
      screen.queryByRole("button", { name: "Select No Parent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Select parent category Parent Category",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select parent category Solo Category" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Select parent category Child Category",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("cat_parent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      within(bodyRows[0]).getByRole("button", {
        name: "Collapse Parent Category",
      }),
    );
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[0]).getByText("Parent Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("1 child")).toBeInTheDocument();
    expect(screen.queryByText("Parent Category > Child Category"))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("row", { name: "Edit Parent Category" }));
    expect(screen.getByLabelText("Search parent categories")).toBeDisabled();
  });

  it("keeps Category Management filters and table status text scoped", async () => {
    window.history.pushState({}, "", "/settings/category-management");
    const managedCategories = [
      managedCategoryFixture({
        key: "cat_parent",
        name: "Parent Category",
      }),
      managedCategoryFixture({
        key: "cat_child",
        name: "Child Category",
        parentKey: "cat_parent",
      }),
      managedCategoryFixture({
        key: "cat_solo",
        name: "Solo Category",
      }),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Parent Video",
            categoriesJson: '["Parent Category"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            title: "Child Image",
            categoriesJson: '["Child Category"]',
          }),
        ];
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return managedCategories;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    const categoryRender = render(<App />);

    await screen.findAllByText("Parent Category");
    const table = screen.getByRole("table");
    expect(screen.queryByText(/Record.only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs\s+Review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Missing\s+thumbnail/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Has\s+children/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Active category filters")).not.toBeInTheDocument();
    expect(screen.getByLabelText("0 active filters")).toHaveTextContent("0");

    selectCategoryFilter("Parents Only");
    const categoryFilterListbox = screen.getByRole("listbox", {
      name: "Category filter options",
    });
    expect(within(categoryFilterListbox).queryByRole("searchbox")).not.toBeInTheDocument();
    const parentFilterOption = within(categoryFilterListbox).getByRole("option", {
      name: "Parents Only",
    });
    expect(parentFilterOption).toHaveAttribute("aria-selected", "true");
    expect(parentFilterOption.querySelector(".lucide-check")).not.toBeNull();

    let bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText("Parent Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("1 child")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("Videos 1")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByLabelText("Images 1")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("Active category filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Filter: Parents Only filter" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Remove Filter: Parents Only filter" }));
    expect(screen.queryByLabelText("Active category filters")).not.toBeInTheDocument();
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(3);

    selectCategoryFilter("Children Only");

    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText("Child Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).queryByText("Parent Category > Child Category"))
      .not.toBeInTheDocument();
    expect(within(bodyRows[0]).queryByText("Solo Category"))
      .not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("category-management-filter-control")).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Filter: Children Only filter" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toHaveTextContent("1");
    fireEvent.change(screen.getByLabelText("Search categories"), {
      target: { value: "Child" },
    });
    selectCategorySort("Last Added");
    categoryRender.unmount();

    window.history.pushState({}, "", "/settings/category-management");
    const restoredCategoryRender = render(<App />);
    await screen.findByText("Child Category");
    expect(screen.getByLabelText("Search categories")).toHaveValue("Child");
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent(
      "Last Added",
    );
    expect(screen.getByRole("button", { name: "Remove Filter: Children Only filter" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.queryByLabelText("Active category filters")).not.toBeInTheDocument();
    expect(screen.getByLabelText("0 active filters")).toHaveTextContent("0");
    expect(screen.getByLabelText("Search categories")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent(
      "Title A-Z",
    );
    restoredCategoryRender.unmount();

    window.history.pushState({}, "", "/settings/category-management");
    render(<App />);
    await screen.findAllByText("Parent Category");
    expect(screen.getByLabelText("Search categories")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Sort" })).toHaveTextContent(
      "Title A-Z",
    );
    expect(screen.queryByLabelText("Active category filters")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("category-management-filter-control")).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("category-management-filter-control"));
    expect(
      within(screen.getByRole("listbox", { name: "Category filter options" })).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
  });

  it("adds a configured media root from the Settings folder picker", async () => {
    window.history.pushState({}, "", "/settings");
    const selectedRoot = "D:/Sakurava Media";
    const canonicalRoot = "\\\\?\\D:\\Sakurava Media";
    const displayRoot = "D:\\Sakurava Media";
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "media_asset_allow_root") {
        expect(args.rootPath).toBe(selectedRoot);
        return {
          rootPath: canonicalRoot,
          success: true,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue(selectedRoot);

    render(<App />);

    const addMediaRootButton = screen.getByRole("button", {
      name: "Add Media Root",
    });
    expect(addMediaRootButton).toBeEnabled();
    fireEvent.click(addMediaRootButton);

    await waitFor(() =>
      expect(screen.getByText(displayRoot)).toBeInTheDocument(),
    );
    expect(screen.queryByText(canonicalRoot)).not.toBeInTheDocument();
    expect(dialogMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Select Folder",
        multiple: false,
        directory: true,
      }),
    );
    expect(window.localStorage.getItem("sakurava.mediaAssetRoots.v1")).toBe(
      JSON.stringify([canonicalRoot]),
    );
    expect(screen.getByText("1 folder configured")).toBeInTheDocument();
  });

  it("does not duplicate and can remove a configured media root", async () => {
    window.history.pushState({}, "", "/settings");
    const canonicalRoot = "\\\\?\\D:\\FOTO PRODUK";
    const displayRoot = "D:\\FOTO PRODUK";
    window.localStorage.setItem(
      "sakurava.mediaAssetRoots.v1",
      JSON.stringify([canonicalRoot]),
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "media_asset_allow_root") {
        return {
          rootPath: canonicalRoot,
          success: true,
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue("D:/FOTO PRODUK");

    render(<App />);

    expect(screen.getByText(displayRoot)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Media Root" }));

    await waitFor(() =>
      expect(screen.getByText(`${displayRoot} is already configured.`)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(displayRoot)).toHaveLength(1);
    expect(window.localStorage.getItem("sakurava.mediaAssetRoots.v1")).toBe(
      JSON.stringify([canonicalRoot]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Media Root" }));

    expect(screen.queryByText(displayRoot)).not.toBeInTheDocument();
    expect(screen.getByText("No folders configured")).toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.mediaAssetRoots.v1")).toBe(
      JSON.stringify([]),
    );
    expect(
      screen.getByText(
        "Configured media root removed. It will no longer be restored after restart.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Media Root" }),
    ).toBeDisabled();
  });

  it("selects one media root and removes the selected non-first root safely", () => {
    window.history.pushState({}, "", "/settings");
    const roots = [
      "D:\\Media One",
      "D:\\Media Two",
      "D:\\Media Three",
    ];
    window.localStorage.setItem(
      "sakurava.mediaAssetRoots.v1",
      JSON.stringify(roots),
    );
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "media_asset_allow_root") {
        return { rootPath: args.rootPath, success: true };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const listbox = screen.getByRole("listbox", {
      name: "Configured media roots",
    });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[2]).toHaveAttribute("aria-selected", "false");

    fireEvent.click(options[1]);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Media Root" }),
    );

    expect(screen.queryByText("D:\\Media Two")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "D:\\Media Three" }))
      .toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem("sakurava.mediaAssetRoots.v1")).toBe(
      JSON.stringify(["D:\\Media One", "D:\\Media Three"]),
    );
    expect(
      screen.getByText(
        "Removing a configured root does not delete media files. Its current app-session access may remain until restart.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset Library & Media" }))
      .not.toBeInTheDocument();
    expect(
      (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls.every(
        ([command]) =>
          !/(delete|move|rename|copy)/i.test(String(command)),
      ),
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Media Root" }),
    );
    expect(screen.getByRole("option", { name: "D:\\Media One" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("handles invalid media-root localStorage without enabling Remove", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.mediaAssetRoots.v1",
      JSON.stringify({ root: "D:\\Invalid Shape" }),
    );
    render(<App />);

    expect(screen.getByText("No folders configured")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Media Root" }),
    ).toBeDisabled();
  });

  it("creates a manual package without opening a destination save dialog", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "sakurava-backup-20260706-120000-manual";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) {
        return [];
      }
      if (command === "backup_package_create") {
        return {
          packageName,
          packagePath: `C:/App/backups/${packageName}`,
          manifest: {
            format: "sakurava-backup-directory",
            version: 1,
            createdAt: "2026-07-06T12:00:00Z",
            backupType: "manual",
            note: "",
            includes: { database: true, originalMedia: false, appManagedAssets: false },
            database: { file: "sakurava.sqlite" },
          },
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));

    await screen.findByText("Backup created");
    expect(dialogMocks.save).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_create",
      { backupType: "manual", note: null },
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith("database_backup", expect.anything(), undefined);
  });

  it("registers structural translation keys for the package backup and restore flow", () => {
    const keys = getAllTranslationKeys();
    for (const key of [
      "settings.backup.openFolder",
      "settings.backup.note.label",
      "settings.backup.preview.title",
      "settings.backup.restoreConfirm.title",
      "settings.backup.result.title",
      "settings.backup.automatic.frequency",
      "settings.backup.history.actions",
    ]) {
      expect(keys).toContain(key);
      expect(getKeyDescription(key)).toMatch(/^Settings > Backup/);
    }
  });

  it("passes a trimmed optional note, clears it after success, and refreshes the package list", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "sakurava-backup-20260706-120000-manual";
    let listCalls = 0;
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        listCalls += 1;
        return [];
      }
      if (command === "backup_package_create") {
        return {
          packageName,
          packagePath: `C:/App/backups/${packageName}`,
          manifest: {
            format: "sakurava-backup-directory",
            version: 1,
            createdAt: "2026-07-06T12:00:00Z",
            backupType: "manual",
            note: "Before cleanup",
            includes: { database: true, originalMedia: false, appManagedAssets: false },
            database: { file: "sakurava.sqlite" },
          },
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    expect(screen.getByRole("textbox", { name: "Optional note" })).toHaveAttribute(
      "placeholder",
      "Add an optional note for this backup...",
    );
    expect(screen.getByText("0/255")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Optional note" }), {
      target: { value: "  Before cleanup  " },
    });
    expect(screen.getByText("18/255")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));

    await screen.findByText("Backup created");
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_create",
      { backupType: "manual", note: "Before cleanup" },
      undefined,
    );
    expect(screen.getByRole("textbox", { name: "Optional note" })).toHaveValue("");
    expect(listCalls).toBeGreaterThanOrEqual(2);
  });

  it("prevents duplicate backup submits while pending", async () => {
    window.history.pushState({}, "", "/settings");
    let resolveBackup: (result: any) => void = () => {};
    const backupPromise = new Promise<any>((resolve) => {
      resolveBackup = resolve;
    });
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) return [];
      if (command === "backup_package_create") return backupPromise;
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Backing up...",
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_create"),
    ).toHaveLength(1);

    resolveBackup({
      packageName: "pending-manual",
      packagePath: "C:/App/backups/pending-manual",
      manifest: {
        format: "sakurava-backup-directory",
        version: 1,
        createdAt: "2026-07-06T12:00:00Z",
        backupType: "manual",
        note: "",
        includes: { database: true, originalMedia: false, appManagedAssets: false },
        database: { file: "sakurava.sqlite" },
      },
    });
    await screen.findByText("Backup created");
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_create"),
    ).toHaveLength(1);
  });

  it("shows an error when package backup fails", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) return [];
      if (command === "backup_package_create") {
        throw new Error("Unable to back up SQLite database");
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));

    expect(await screen.findByText("Backup could not be created")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Now" })).toBeEnabled();
  });

  it("shows a friendly message for same-second backup collisions", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) return [];
      if (command === "backup_package_create") {
        throw new Error("A backup package already exists for this second and type");
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));

    expect(await screen.findByText(
      "A backup was just created. Please wait a moment before creating another one.",
    )).toBeInTheDocument();
    expect(screen.queryByText(/already exists for this second/i)).not.toBeInTheDocument();
  });

  it("opens the scoped backup folder without passing a frontend path", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) return [];
      if (command === "backup_folder_open") {
        return { folderPath: "C:/App/backups", opened: true };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Folder" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "backup_folder_open",
        {},
        undefined,
      ),
    );
    expect(dialogMocks.open).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith(
      "database_restore",
      expect.anything(),
      undefined,
    );
  });

  it("renders the approved backup summary, automated controls, history columns, and safe restore flow", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "sakurava-backup-20260706-120000-manual";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        return [
          testBackupPackage(packageName, "manual", "Before migration"),
          testBackupPackage("sakurava-backup-20260706-110000-safety", "safety"),
        ];
      }
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(screen.getByRole("heading", { name: "Backup & Recovery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Now" })).toBeEnabled();
    const statusCard = screen.getByText("Backup Status").closest("div")?.parentElement?.parentElement;
    expect(statusCard).not.toBeNull();
    expect(within(statusCard as HTMLElement).getByRole("button", { name: "Backup Now" })).toBeEnabled();
    expect(within(statusCard as HTMLElement).getByRole("button", { name: "Restore from Backup..." })).toBeEnabled();
    expect(screen.getByText("Sakurava backup folder")).toBeInTheDocument();
    expect(await screen.findByText(/Last backup:/)).toBeInTheDocument();
    expect(screen.queryByText(`C:/App/backups/${packageName}`)).not.toBeInTheDocument();
    expect(screen.queryByText("Original media files are not included.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Rotation/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Backup Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Restore Summary" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Automated Backup" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Frequency" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Daily" })).toBeInTheDocument();

    const history = screen.getByRole("region", { name: "Backup History" });
    for (const heading of ["Date & Time", "Size", "Type", "Status", "Actions"]) {
      expect(within(history).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(history).getByRole("button", { name: `View backup ${packageName}` })).toBeEnabled();
    expect(within(history).getByRole("button", { name: `More backup actions ${packageName}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Preview Backup" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("sakurava-backup-20260706-110000-safety"),
    ).not.toBeInTheDocument();

    await clickHistoryRestore(packageName);
    const importedPreview = await screen.findByRole("region", { name: "Backup Preview" });
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_preview",
      { packageName },
      undefined,
    );
    expect(
      screen.getByText(/Current catalog and app data will be replaced/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/safety backup will be created first/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Original media files will not be changed/i)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "backup_package_restore",
      expect.anything(),
      undefined,
    );
  });

  it("selects a history row into a focused preview and invalidates it when selection changes", async () => {
    window.history.pushState({}, "", "/settings");
    const first = "preview-first-manual";
    const second = "preview-second-automatic";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(first), testBackupPackage(second, "automatic")];
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: `View backup ${first}` }));
    const firstPreview = await screen.findByRole("region", { name: "Backup Preview" });
    expect(firstPreview).toHaveTextContent(first);
    expect(firstPreview).toHaveTextContent("Manual");
    expect(within(firstPreview).getByRole("button", { name: "Download" })).toBeEnabled();
    expect(within(firstPreview).getByRole("button", { name: "Delete Backup" })).toBeEnabled();
    expect(within(firstPreview).getByRole("button", { name: "Restore Backup" })).toBeEnabled();
    expect(screen.queryByRole("dialog", { name: "Restore this backup?" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `View backup ${second}` }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Backup Preview" })).toHaveTextContent(second));
    expect(screen.getByRole("region", { name: "Backup Preview" })).not.toHaveTextContent(first);
  });

  it("renders Backup History actions in a floating menu that closes safely", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "floating-menu-manual";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    render(<App />);

    const history = await screen.findByRole("region", { name: "Backup History" });
    fireEvent.click(screen.getByRole("button", { name: `More backup actions ${packageName}` }));
    const menu = await screen.findByRole("menu", { name: "Actions" });
    expect(history).not.toContainElement(menu);
    expect(within(menu).getByRole("menuitem", { name: "Restore" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Actions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `More backup actions ${packageName}` }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("shows a dismissible toast when a manual backup succeeds", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "toast-created-manual";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [];
      if (command === "backup_package_create") return testBackupPackage(packageName);
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = { invoke: invoke as unknown as TestTauriInvoke };
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Now" }));
    expect(await screen.findByText("Backup created")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(screen.queryByText("Backup created")).not.toBeInTheDocument();
  });

  it("renders Restore from Backup and handles a cancelled backend picker without error", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) {
        return [];
      }
      if (command === "backup_package_import_selected") {
        return { cancelled: true, imported: false, packageName: null };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Restore from Backup..." }),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "backup_package_import_selected",
        {},
        undefined,
      ),
    );
    expect(
      screen.queryByText(/Backup could not be imported/),
    ).not.toBeInTheDocument();
    expect(
      invoke.mock.calls.some(([command]) => command === "backup_package_preview"),
    ).toBe(false);
    expect(
      invoke.mock.calls.some(([command]) => command === "backup_package_restore"),
    ).toBe(false);
    expect(dialogMocks.open).not.toHaveBeenCalled();
  });

  it("shows friendly selected-package validation errors without exposing runtime details", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list", "backup_package_list"].includes(command)) {
        return [];
      }
      if (command === "backup_package_import_selected") {
        throw {
          code: "invalid_selected_package",
          message: "D:/External/private/broken-package is missing manifest.json",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Restore from Backup..." }),
    );

    expect(
      await screen.findByText(
        "This backup could not be used. Please choose a valid Sakurava backup package.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/D:\/External\/private/)).not.toBeInTheDocument();
  });

  it("imports a selected package, refreshes history, previews it, and requires confirmation", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "selected-import-manual";
    let imported = false;
    let listCalls = 0;
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        listCalls += 1;
        return imported ? [testBackupPackage(packageName)] : [];
      }
      if (command === "backup_package_import_selected") {
        imported = true;
        return { cancelled: false, imported: true, packageName };
      }
      if (command === "backup_package_preview") {
        expect(args.packageName).toBe(packageName);
        return testBackupPreview(packageName);
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Restore from Backup..." }),
    );

    const importedPreview = await screen.findByRole("region", { name: "Backup Preview" });
    expect(listCalls).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(packageName).length).toBeGreaterThan(0);
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_preview",
      { packageName },
      undefined,
    );
    expect(
      invoke.mock.calls.some(([command]) => command === "backup_package_restore"),
    ).toBe(false);
    expect(screen.queryByText(/D:\/External/)).not.toBeInTheDocument();

    fireEvent.click(within(importedPreview).getByRole("button", { name: "Restore Backup" }));
    const restoreDialog = await screen.findByRole("dialog", { name: "Restore this backup?" });
    fireEvent.click(within(restoreDialog).getByRole("button", { name: "Cancel" }));
    expect(
      invoke.mock.calls.some(([command]) => command === "backup_package_restore"),
    ).toBe(false);
  });

  it("confirms restore of an imported package using packageName only", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "selected-import-confirm-manual";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_import_selected") {
        return { cancelled: false, imported: true, packageName };
      }
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (command === "backup_package_restore") {
        return {
          restoredPackageName: packageName,
          safetyPackageName: "selected-import-safety",
          restoredAt: "2026-07-06T13:00:00Z",
          databaseRestored: true,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          warnings: [],
          errors: [],
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Restore from Backup..." }),
    );
    const preview = await screen.findByRole("region", { name: "Backup Preview" });
    fireEvent.click(within(preview).getByRole("button", { name: "Restore Backup" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Restore this backup?" })).getByRole("button", { name: "Restore Backup" }),
    );

    expect(await screen.findByText(packageName)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_restore",
      { packageName },
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "backup_package_restore",
      expect.objectContaining({ sourcePath: expect.anything() }),
      undefined,
    );
  });

  it("persists functional automatic backup toggle and frequency controls", async () => {
    window.history.pushState({}, "", "/settings");
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.lastSuccessfulAutomaticBackupAt =
      new Date().toISOString();
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (
        ["video_list", "image_list", "performer_list", "backup_package_list"].includes(
          command,
        )
      ) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    const toggle = screen.getByRole("switch", { name: "Automated Backup" });
    const frequency = screen.getByRole("combobox", { name: "Frequency" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(frequency).toBeDisabled();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(frequency).toBeEnabled();
    fireEvent.change(frequency, { target: { value: "weekly" } });

    expect(loadBackupRecoverySettings().automaticBackup).toMatchObject({
      enabled: true,
      frequency: "weekly",
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "backup_package_create",
      ),
    ).toHaveLength(0);
    expect(screen.queryByText(/Rotation/)).not.toBeInTheDocument();
  });

  it("creates at most one due app-start automatic backup in StrictMode and records success", async () => {
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.enabled = true;
    stored.automaticBackup.frequency = "daily";
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const automaticPackage = testBackupPackage(
      "sakurava-backup-20260706-130000-automatic",
      "automatic",
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "backup_package_create") return automaticPackage;
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        invoke.mock.calls.filter(
          ([command]) => command === "backup_package_create",
        ),
      ).toHaveLength(1),
    );
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_create",
      { backupType: "automatic", note: null },
      undefined,
    );
    await waitFor(() => {
      expect(
        loadBackupRecoverySettings().automaticBackup
          .lastAutomaticBackupPackageName,
      ).toBe(automaticPackage.packageName);
    });
    expect(
      loadBackupRecoverySettings().automaticBackup
        .lastSuccessfulAutomaticBackupAt,
    ).toBeTruthy();
    expect(
      invoke.mock.calls.some(
        ([command]) => command === "backup_package_rotate_automatic",
      ),
    ).toBe(false);
  });

  it("does not run app-start automatic backup while disabled or not due", async () => {
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.enabled = true;
    stored.automaticBackup.lastSuccessfulAutomaticBackupAt =
      new Date().toISOString();
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "backup_package_create",
      ),
    ).toHaveLength(0);
  });

  it("runs one automatic backup when the in-app interval reaches the due time", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-06T12:00:00.000Z");
    vi.setSystemTime(now);
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.enabled = true;
    stored.automaticBackup.lastSuccessfulAutomaticBackupAt = new Date(
      now.getTime() - 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
    ).toISOString();
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const automaticPackage = testBackupPackage(
      "sakurava-backup-20260706-121500-automatic",
      "automatic",
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "backup_package_create") return automaticPackage;
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "backup_package_create",
      ),
    ).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "backup_package_create",
      ),
    ).toHaveLength(1);
  });

  it("keeps the last automatic success unchanged after a failed due backup", async () => {
    const previousSuccess = "2026-01-01T00:00:00.000Z";
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.enabled = true;
    stored.automaticBackup.lastSuccessfulAutomaticBackupAt = previousSuccess;
    stored.automaticBackup.lastAutomaticBackupPackageName = "previous-auto";
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "backup_package_create") {
        throw new Error("backup operation busy");
      }
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "backup_package_create",
        { backupType: "automatic", note: null },
        undefined,
      ),
    );
    expect(
      loadBackupRecoverySettings().automaticBackup
        .lastSuccessfulAutomaticBackupAt,
    ).toBe(previousSuccess);
    expect(
      loadBackupRecoverySettings().automaticBackup
        .lastAutomaticBackupPackageName,
    ).toBe("previous-auto");
  });

  it("refreshes Backup History with an Auto row after automatic backup succeeds", async () => {
    window.history.pushState({}, "", "/settings");
    const stored = defaultBackupRecoverySettings();
    stored.automaticBackup.enabled = true;
    window.localStorage.setItem(
      BACKUP_RECOVERY_STORAGE_KEY,
      JSON.stringify(stored),
    );
    const automaticPackage = testBackupPackage(
      "sakurava-backup-20260706-140000-automatic",
      "automatic",
    );
    let created = false;
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "backup_package_create") {
        created = true;
        return automaticPackage;
      }
      if (command === "backup_package_list") {
        return created ? [automaticPackage] : [];
      }
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    const history = screen.getByRole("region", { name: "Backup History" });
    expect(await within(history).findByText("Automatic")).toBeInTheDocument();
    expect(
      within(history).getByRole("button", { name: `View backup ${automaticPackage.packageName}` }),
    ).toBeInTheDocument();
  });

  it("cancels restore confirmation without calling the restore command", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "restore-cancel-manual";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    await clickHistoryRestore(packageName);
    await screen.findByText("Restore this backup?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Restore this backup?")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "backup_package_restore",
      expect.anything(),
      undefined,
    );
  });

  it("restores only the previewed package after confirmation and refreshes the list", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "restore-success-manual";
    const safetyPackageName = "restore-safety";
    let listCalls = 0;
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        listCalls += 1;
        return [testBackupPackage(packageName)];
      }
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (command === "backup_package_restore") {
        return {
          restoredPackageName: args.packageName,
          safetyPackageName,
          restoredAt: "2026-07-06T12:10:00Z",
          databaseRestored: true,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          warnings: [],
          errors: [],
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryRestore(packageName);
    await screen.findByText("Restore this backup?");
    await confirmPackageRestore();

    const summary = await screen.findByRole("region", { name: "Restore Summary" });
    expect(summary).toHaveTextContent(packageName);
    expect(summary).toHaveTextContent(safetyPackageName);
    expect(summary).toHaveTextContent("Your data was restored successfully.");
    expect(screen.queryByRole("region", { name: "Backup Preview" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Rollback:/)).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_restore",
      { packageName },
      undefined,
    );
    expect(listCalls).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(summary).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "Restore Summary" })).not.toBeInTheDocument();
  });

  it("paginates backup history while keeping package actions bounded to visible rows", async () => {
    window.history.pushState({}, "", "/settings");
    const packages = Array.from({ length: 35 }, (_, index) =>
      testBackupPackage(
        `history-package-${String(index + 1).padStart(2, "0")}`,
        index % 2 === 0 ? "manual" : "automatic",
      ),
    );
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return packages;
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    expect(await screen.findByText("Showing 1-32 of 35")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View backup history-package-01" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "View backup history-package-35" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Showing 33-35 of 35")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View backup history-package-35" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "View backup history-package-01" })).not.toBeInTheDocument();
    expect(
      invoke.mock.calls.some(([command]) =>
        ["backup_package_download", "backup_package_delete"].includes(command),
      ),
    ).toBe(false);
  });

  it("downloads a listed backup to the trusted folder-picker destination", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "download-package-manual";
    dialogMocks.open.mockResolvedValue("D:/Backup Exports");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_export") {
        return {
          packageName,
          exported: true,
          exportedPath: `D:/Backup Exports/${packageName}`,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryAction(packageName, "Download");

    expect(await screen.findByText("Backup downloaded")).toBeInTheDocument();
    expect(dialogMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Download Backup Package To",
        directory: true,
        multiple: false,
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_export",
      { packageName, destinationRoot: "D:/Backup Exports" },
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "backup_package_export",
      expect.objectContaining({ destinationRoot: `C:/App/backups/${packageName}` }),
      undefined,
    );
  });

  it("shows a friendly error when backup download fails", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "download-failure-manual";
    dialogMocks.open.mockResolvedValue("D:/Backup Exports");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_export") throw new Error("internal copy failure");
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryAction(packageName, "Download");

    expect(
      await screen.findByText("Backup could not be downloaded"),
    ).toBeInTheDocument();
    expect(screen.queryByText("internal copy failure")).not.toBeInTheDocument();
  });

  it("requires delete confirmation, supports cancel, and refreshes after success", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "delete-package-manual";
    let deleted = false;
    let listCalls = 0;
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        listCalls += 1;
        return deleted ? [] : [testBackupPackage(packageName, "manual", "Before cleanup")];
      }
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (command === "backup_package_delete") {
        deleted = true;
        return { packageName, deleted: true };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: `View backup ${packageName}` }));
    const selectedPreview = await screen.findByRole("region", { name: "Backup Preview" });
    fireEvent.click(within(selectedPreview).getByRole("button", { name: "Delete Backup" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete this backup?",
    });
    expect(dialog).toHaveTextContent(
      "This backup will be permanently removed. Your current catalog will not be changed.",
    );
    expect(dialog).toHaveTextContent("Before cleanup");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_delete"),
    ).toHaveLength(0);

    await clickHistoryAction(packageName, "Delete");
    const confirmDeleteDialog = await screen.findByRole("dialog", { name: "Delete this backup?" });
    fireEvent.click(within(confirmDeleteDialog).getByRole("button", { name: "Delete Backup" }));

    expect(await screen.findByText("Backup deleted")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_delete",
      { packageName },
      undefined,
    );
    expect(listCalls).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(packageName)).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Backup Preview" })).not.toBeInTheDocument();
  });

  it("shows a friendly error and keeps the package after delete failure", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "delete-failure-automatic";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") {
        return [testBackupPackage(packageName, "automatic")];
      }
      if (command === "backup_package_delete") throw new Error("internal delete failure");
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryAction(packageName, "Delete");
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete Backup" }),
    );

    expect(
      await screen.findByText("Backup could not be deleted"),
    ).toBeInTheDocument();
    expect(screen.queryByText("internal delete failure")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `View backup ${packageName}` })).toBeInTheDocument();
  });

  it("prevents duplicate restore submits while pending", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "pending-restore-manual";
    let resolveRestore: (result: any) => void = () => {};
    const restorePromise = new Promise<any>((resolve) => {
      resolveRestore = resolve;
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (command === "backup_package_restore") return restorePromise;
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryRestore(packageName);
    await confirmPackageRestore();

    expect(await screen.findByText("Restoring backup package...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Now" })).toBeDisabled();
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_restore"),
    ).toHaveLength(1);

    resolveRestore({
      restoredPackageName: packageName,
      safetyPackageName: "pending-restore-safety",
      restoredAt: "2026-07-06T12:00:00Z",
      databaseRestored: true,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      warnings: [],
      errors: [],
    });
    await screen.findByText(packageName);
  });

  it("shows a typed runtime error when package restore fails", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "broken-restore-manual";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_preview") return testBackupPreview(args.packageName);
      if (command === "backup_package_restore") {
        throw {
          code: "restore_apply_failed",
          message: "Restore failed and the active database was rolled back.",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    render(<App />);

    await clickHistoryRestore(packageName);
    await confirmPackageRestore();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backup package restore failed.",
    );
    expect(invoke).toHaveBeenCalledWith(
      "backup_package_restore",
      { packageName },
      undefined,
    );
  });

  it("keeps restore disabled after preview failure and never calls restore", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "invalid-preview-manual";
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_preview") {
        throw {
          code: "database_integrity_failed",
          message: "Backup database failed SQLite integrity check.",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    await clickHistoryRestore(packageName);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backup package preview failed.",
    );
    expect(screen.queryByText("Restore this backup?")).not.toBeInTheDocument();
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_restore"),
    ).toHaveLength(0);
  });

  it("hides Preview action and blocks duplicate restore/backup submits while validation is pending", async () => {
    window.history.pushState({}, "", "/settings");
    const packageName = "pending-preview-manual";
    let resolvePreview: (value: any) => void = () => {};
    const previewPromise = new Promise<any>((resolve) => {
      resolvePreview = resolve;
    });
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) return [];
      if (command === "backup_package_list") return [testBackupPackage(packageName)];
      if (command === "backup_package_preview") return previewPromise;
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(screen.queryByRole("button", { name: "Preview Backup" })).not.toBeInTheDocument();
    await clickHistoryRestore(packageName);
    expect(await screen.findByText("Validating backup...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Now" })).toBeDisabled();
    const restoreRow = screen.getByRole("button", { name: `View backup ${packageName}` }).closest("tr");
    expect(restoreRow).not.toBeNull();
    const moreButton = within(restoreRow as HTMLElement).getByRole("button", {
      name: `More backup actions ${packageName}`,
    });
    expect(moreButton).toBeDisabled();
    fireEvent.click(moreButton);
    expect(
      invoke.mock.calls.filter(([command]) => command === "backup_package_preview"),
    ).toHaveLength(1);

    resolvePreview(testBackupPreview(packageName));
    expect(await screen.findByText("Restore this backup?")).toBeInTheDocument();
  });

  it("requires confirmation before clearing app-generated cache", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Cache" }));

    expect(await screen.findByText("Confirm cache cleanup")).toBeInTheDocument();
    expect(
      screen.getByText("Only scoped app-generated cache folders will be cleared."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Source media files will not be deleted."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "SQLite records, categories, ratings, related links, and catalog data will not be changed.",
      ),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "clear_app_cache",
      expect.anything(),
      undefined,
    );
  });

  it("cancels cache cleanup confirmation without calling the runtime command", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Cache" }));
    await screen.findByText("Confirm cache cleanup");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Confirm cache cleanup")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "clear_app_cache",
      expect.anything(),
      undefined,
    );
  });

  it("clears app-generated cache after confirmation without running future operations", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      if (command === "backup_package_list") {
        return [];
      }
      if (command === "clear_app_cache") {
        return {
          success: true,
          message:
            "Cleared app-generated cache. Removed 2 file(s). Source media and catalog records were not changed.",
          filesRemoved: 2,
          bytesRemoved: 42,
          clearedPaths: [
            "C:/Users/Example/AppData/Roaming/app.sakurava.desktop/generated-cache",
          ],
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Cache" }));
    await screen.findByText("Confirm cache cleanup");
    fireEvent.click(screen.getByRole("button", { name: "Clear app cache" }));

    expect(
      await screen.findByText(
        "Cleared app-generated cache. Removed 2 file(s). Source media and catalog records were not changed.",
      ),
    ).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("clear_app_cache", {}, undefined);
    expect(invoke).not.toHaveBeenCalledWith(
      "video_delete",
      expect.anything(),
      undefined,
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "database_restore",
      expect.anything(),
      undefined,
    );
    expect(screen.getByRole("button", { name: "Import Catalog" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Catalog" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Export Selected" }))
      .not.toBeInTheDocument();
  });

  it("shows an error when cache cleanup fails safely", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      if (command === "backup_package_list") {
        return [];
      }
      if (command === "clear_app_cache") {
        throw new Error(
          "Cache cleanup failed. Source media and catalog records were not changed.",
        );
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Clear Cache" }));
    await screen.findByText("Confirm cache cleanup");
    fireEvent.click(screen.getByRole("button", { name: "Clear app cache" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cache cleanup failed. Source media and catalog records were not changed.",
    );
    expect(screen.getByRole("button", { name: "Clear Cache" })).toBeEnabled();
  });

  it("keeps create routes separate from detail route stubs", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Add Video" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Video Create Form")).toBeInTheDocument();
    expect(screen.queryByText("VideoDetailPage")).not.toBeInTheDocument();
  });

  it.each([
    [
      "/videos/new",
      "Video Create Form",
      "No related performers selected.",
      "Rewatch",
    ],
    [
      "/videos/sample-id/edit",
      "Video Edit Form",
      "No related images selected.",
      "Rewatch",
    ],
    [
      "/images/new",
      "Image Create Form",
      "No related videos selected.",
      "Memorability",
    ],
    [
      "/images/sample-id/edit",
      "Image Edit Form",
      "No related performers selected.",
      "Memorability",
    ],
    [
      "/performers/new",
      "Performer Create Form",
      "No related videos selected.",
      "Attraction",
    ],
    [
      "/performers/sample-id/edit",
      "Performer Edit Form",
      "No related videos selected.",
      "Attraction",
    ],
  ])(
    "renders static form safeguards for %s",
    (path, formLabel, emptyRelatedText, ratingLabel) => {
      window.history.pushState({}, "", path);
      render(<App />);

    expect(screen.getByText(formLabel)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Browse" }).length)
      .toBeGreaterThan(0);
      expect(screen.getAllByText(emptyRelatedText).length).toBeGreaterThan(0);
      expect(screen.getByLabelText(ratingLabel)).toBeInTheDocument();
      expect(screen.queryByText(/Use Detect after/)).not.toBeInTheDocument();
      expect(screen.queryByText("Primary Cover")).not.toBeInTheDocument();
      expect(screen.queryByText("Thumbnails (Optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
  },
  );

  it("uses field-specific placeholders on create forms", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByLabelText(/^Title/)).toHaveAttribute(
      "placeholder",
      "Video title",
    );
    expect(screen.getByLabelText("Code")).toHaveAttribute("placeholder", "VID-001");
    expect(screen.getByLabelText("Media Path")).toHaveAttribute(
      "placeholder",
      "D:/Videos/title/video.mp4",
    );
    expect(screen.queryByText("Saved as typed or selected local media path."))
      .not.toBeInTheDocument();
  });

  it("uses one content box with unnumbered section headings", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    const firstSection = screen
      .getByRole("heading", { name: "Basic Identity" })
      .closest("section") as HTMLElement;
    const contentBox = firstSection.parentElement as HTMLElement;
    const titleRow = screen.getByLabelText(/^Title/).closest("label") as HTMLElement;
    const categoriesRow = screen
      .getByTestId("category-picker-field")
      .closest("div")?.parentElement?.parentElement as HTMLElement;

    expect(contentBox).toHaveClass("bg-white", "divide-y");
    expect(firstSection).not.toHaveClass("rounded-xl", "border");
    expect(titleRow).toHaveClass(
      "lg:grid-cols-[180px_minmax(0,1fr)]",
      "lg:items-center",
    );
    expect(categoriesRow).not.toHaveClass(
      "lg:grid-cols-[180px_minmax(0,1fr)]",
    );
    expect(screen.queryByRole("heading", { name: "1. Basic Identity" }))
      .not.toBeInTheDocument();
  });

  it("renders functional Source Links row controls", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByText("No source links added.")).toBeInTheDocument();
    expect(screen.queryByText("Deferred: source links are not saved yet."))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));

    expect(screen.getByLabelText("Source Link Title 1")).toHaveAttribute(
      "placeholder",
      "Title 1",
    );
    expect(screen.getByLabelText("Source Link URL 1")).toHaveAttribute(
      "placeholder",
      "https://example.com/source",
    );
    expect(screen.getByRole("button", { name: "Remove Source Link 1" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));

    expect(screen.getByLabelText("Source Link Title 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Source Link URL 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Source Link 2" }))
      .toBeInTheDocument();
  });

  it("removes one Source Link row without clearing the others", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "First source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/first" },
    });
    fireEvent.change(screen.getByLabelText("Source Link Title 2"), {
      target: { value: "Second source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 2"), {
      target: { value: "https://example.invalid/second" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Source Link 1" }));

    expect(screen.getByLabelText("Source Link Title 1"))
      .toHaveValue("Second source");
    expect(screen.getByLabelText("Source Link URL 1"))
      .toHaveValue("https://example.invalid/second");
    expect(screen.queryByDisplayValue("First source")).not.toBeInTheDocument();
  });

  it("renders Availability and Performer Status with matching rectangular chip sets", () => {
    window.history.pushState({}, "", "/videos/new");
    const { unmount } = render(<App />);

    const availabilitySection = screen
      .getByText("Availability")
      .closest("div") as HTMLElement;
    for (const label of ["Owned", "Not Owned", "Missing"]) {
      const chip = within(availabilitySection)
        .getAllByText(label)
        .find((element) => element.tagName === "SPAN") as HTMLElement;
      expect(chip).toHaveClass("rounded-md");
      expect(chip).not.toHaveClass("rounded-full");
    }

    unmount();
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    const statusSection = screen.getByText("Availability").closest("div") as HTMLElement;
    for (const label of ["Active", "Retired", "Unknown"]) {
      const chip = within(statusSection)
        .getAllByText(label)
        .find((element) => element.tagName === "SPAN") as HTMLElement;
      expect(chip).toHaveClass("rounded-md");
      expect(chip).not.toHaveClass("rounded-full");
    }
    expect(screen.getByLabelText("Availability")).toHaveValue("Unknown");
  });

  it.each([
    "/videos/new",
    "/images/new",
    "/performers/new",
  ])("uses Managed Categories as form picker choices on %s", async (path) => {
    window.history.pushState({}, "", path);
    setManagedCategories(["Managed Category", "managed category", "  Trimmed Category  "]);

    render(<App />);

    expect(screen.queryByPlaceholderText("Add category...")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Category" })).toHaveAttribute(
      "href",
      "/settings/category-management",
    );

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search categories" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Add Managed Category" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Trimmed Category" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add managed category" }))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "trim" },
    });
    expect(screen.queryByRole("button", { name: "Add Managed Category" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Trimmed Category" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "managed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Managed Category" }));

    expect(screen.getByText("Managed Category")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Managed Category" }),
    ).not.toBeInTheDocument();
  });

  it("orders Video form media and Tech Info sections safely", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "Basic Identity" }).closest("section"),
      screen.getByRole("heading", { name: "Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "File" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Categories" }).closest("section"),
      screen.getByRole("heading", { name: "Rating" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performers" }).closest("section"),
      screen.getByRole("heading", { name: "Related Images" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
    ]);

    const metadata = within(
      screen.getByRole("heading", { name: "Metadata" }).closest("section") as HTMLElement,
    );
    const techInfo = within(
      screen.getByRole("heading", { name: "Tech Info" }).closest("section") as HTMLElement,
    );

    expect(metadata.queryByLabelText("Duration")).not.toBeInTheDocument();
    expect(techInfo.getByLabelText("Duration")).toBeInTheDocument();
    expect(techInfo.getByLabelText("Duration")).toHaveAttribute(
      "placeholder",
      "n/a",
    );
    expect(techInfo.getByText("Resolution")).toBeInTheDocument();
    expect(techInfo.getByLabelText("Resolution")).toHaveAttribute(
      "placeholder",
      "n/a",
    );
    expect(techInfo.getByText("File Size")).toBeInTheDocument();
    expect(techInfo.getByText("File Type")).toBeInTheDocument();
    expect(techInfo.getAllByDisplayValue("")).toHaveLength(4);
    expect(techInfo.getByRole("button", { name: "Detect" })).toBeInTheDocument();
    expect(techInfo.queryByText("Quality")).not.toBeInTheDocument();
  });

  it("orders Image form gallery and Tech Info sections safely", () => {
    window.history.pushState({}, "", "/images/new");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "Basic Identity" }).closest("section"),
      screen.getByRole("heading", { name: "Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "File" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Categories" }).closest("section"),
      screen.getByRole("heading", { name: "Rating" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performers" }).closest("section"),
      screen.getByRole("heading", { name: "Related Videos" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
    ]);

    const metadata = within(
      screen.getByRole("heading", { name: "Metadata" }).closest("section") as HTMLElement,
    );
    const techInfo = within(
      screen.getByRole("heading", { name: "Tech Info" }).closest("section") as HTMLElement,
    );

    expect(screen.queryByLabelText("Gallery Folder Path")).not.toBeInTheDocument();
    const filesSection = within(
      screen.getByRole("heading", { name: "File" }).closest("section") as HTMLElement,
    );
    expect(filesSection.getByText("Gallery Path")).toBeInTheDocument();
    expect(filesSection.queryByText("Gallery Images")).not.toBeInTheDocument();
    expect(filesSection.queryByText("Galley Path")).not.toBeInTheDocument();
    expect(filesSection.getByRole("button", { name: "Add Folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
    expect(filesSection.queryByRole("button", { name: "+ Add Images" }))
      .not.toBeInTheDocument();
    expect(screen.getByTestId("gallery-image-path-list")).toHaveClass("overflow-y-auto");
    expect(metadata.queryByLabelText("Image Count")).not.toBeInTheDocument();
    expect(techInfo.getByLabelText("Image Count")).toBeInTheDocument();
    expect(techInfo.getByText("Main Resolution")).toBeInTheDocument();
    expect(techInfo.getByText("Total File Size")).toBeInTheDocument();
    expect(techInfo.getByText("Main File Type")).toBeInTheDocument();
    expect(techInfo.getAllByDisplayValue("")).toHaveLength(4);
    expect(techInfo.getByRole("button", { name: "Detect" })).toBeInTheDocument();
  });

  it("keeps Form pages on the AppShell scroll owner", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    const main = screen.getByRole("main");
    const form = screen.getByText("Video Create Form").closest("form");

    expect(main).toHaveClass("overflow-y-auto");
    expect(form).not.toHaveClass("overflow-y-auto");
  });

  it("shows an empty managed category picker state without free-text fallback", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.queryByPlaceholderText("Add category...")).not.toBeInTheDocument();
    expect(screen.getByText("No categories selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No Managed Categories available.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage Category" }),
    ).toHaveAttribute("href", "/settings/category-management");
  });

  it("shows an empty related performer picker state without free-text creation", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Related Performers" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related performers")).toBeInTheDocument();
    expect(screen.getByText("No related performers selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search related performers"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No performer records available. Create performer records first."))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Performers" })).toHaveAttribute(
      "href",
      "/performers",
    );
    expect(screen.queryByPlaceholderText("Add related performer..."))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create performer/i }))
      .not.toBeInTheDocument();
  });

  it("shows an empty related Images picker state without free-text creation", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Related Images" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related images")).toBeInTheDocument();
    expect(screen.getByText("No related images selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search related images"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No image records available. Create image records first."))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Images" })).toHaveAttribute(
      "href",
      "/images",
    );
    expect(screen.queryByPlaceholderText("Add related image..."))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create image/i }))
      .not.toBeInTheDocument();
  });

  it("shows an empty related Videos picker state without free-text creation", () => {
    window.history.pushState({}, "", "/images/new");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Related Videos" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related videos")).toBeInTheDocument();
    expect(screen.getByText("No related videos selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search related videos"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No video records available. Create video records first."))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Videos" })).toHaveAttribute(
      "href",
      "/videos",
    );
    expect(screen.queryByPlaceholderText("Add related video..."))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create video/i }))
      .not.toBeInTheDocument();
  });

  it("matches the Category Picker structure for related picker fields", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    [
      "Selected Performers",
      "Selected Videos",
      "Selected Images",
      "Search Performers",
      "Search Videos",
      "Search Images",
      "Available Performers",
      "Available Videos",
      "Available Images",
    ].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Search performer name, alias, tag..."))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search image title, album, tag..."))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Performers" }))
      .toHaveAttribute("href", "/performers");
    expect(screen.getByRole("link", { name: "Open Images" }))
      .toHaveAttribute("href", "/images");
  });

  it("selects existing Performers on video forms and saves relatedPerformersJson", async () => {
    window.history.pushState({}, "", "/videos/new");
    const created = persistedVideo({
      title: "Related Video",
      relatedPerformersJson:
        '[{"performerId":"performer_aoi","nameSnapshot":"Aoi Sakura"}]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "performer_list") {
          return [
            persistedPerformer({
              id: "performer_aoi",
              name: "Aoi Sakura",
              originalName: "Hanami Aoi",
              nationality: "Japan",
              debutDate: "2008-01-01",
              status: "Active",
              ratingJson: '{"overall":4,"visual":5}',
              aliasesJson:
                '["Sakura Aoi","Aoi","Cherry","Bloom","Aoi S.","Sakura","Hanami","AS","Aoi-chan","Sakura Bloom"]',
            }),
            persistedPerformer({
              id: "performer_yuki",
              name: "Yuki Tanaka",
              originalName: "",
            }),
          ];
        }
        if (command === "video_create") {
          expect(args.input.title).toBe("Related Video");
          expect(args.input.relatedPerformersJson).toBe(
            '[{"performerId":"performer_aoi","nameSnapshot":"Aoi Sakura"}]',
          );
          return created;
        }
        if (command === "video_get") {
          return created;
        }
        if (command === "credit_create") {
          expect(args.input).toEqual(
            expect.objectContaining({
              workType: "video",
              workId: created.id,
              performerId: "performer_aoi",
              characterName: "Lead Role",
              creditTypeCategoryId: "Custom Main",
              billingOrder: 1,
            }),
          );
          return { id: "credit_aoi", ...args.input };
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };
    const originalRelatedListScrollTo = HTMLElement.prototype.scrollTo;
    const relatedListScrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: relatedListScrollTo,
    });
    render(<App />);

    const relatedPerformerSearch = await screen.findByLabelText("Search related performers");
    expect(relatedPerformerSearch).toHaveClass("select-text");
    expect(screen.queryByTestId("related-performer-result-row"))
      .not.toBeInTheDocument();
    fireEvent.focus(relatedPerformerSearch);
    expect(
      await screen.findByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).toBeInTheDocument();
    expect(screen.queryByText((_, element) => element?.tagName === "MARK"))
      .not.toBeInTheDocument();
    fireEvent.change(relatedPerformerSearch, {
      target: { value: "aoi" },
    });
    expect(within(screen.getByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).getByText("Aoi").tagName.toLowerCase()).toBe("mark");
    fireEvent.change(relatedPerformerSearch, {
      target: { value: "japan" },
    });
    expect(
      screen.queryByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).not.toBeInTheDocument();
    fireEvent.change(relatedPerformerSearch, {
      target: { value: "2008" },
    });
    expect(
      screen.queryByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).not.toBeInTheDocument();
    fireEvent.change(relatedPerformerSearch, {
      target: { value: "cherry" },
    });
    const performerResult = await screen.findByRole("button", {
      name: "Add related performer Aoi Sakura",
    });
    expect(performerResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(performerResult).getByText("Aoi Sakura").closest(".truncate"))
      .toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(performerResult).toHaveTextContent("Japan · 2008-Now · ★ 4.5");
    expect(within(performerResult).getByText("★ 4.5")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    fireEvent.click(
      performerResult,
    );
    expect(screen.getByLabelText("Search related performers")).toHaveValue("");
    expect(screen.queryByTestId("related-performer-result-row"))
      .not.toBeInTheDocument();
    const selectedList = screen.getByTestId("related-performer-credit-list");
    await waitFor(() => expect(relatedListScrollTo).toHaveBeenCalled());
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: originalRelatedListScrollTo,
    });
    expect(within(selectedList).getAllByText("Aoi Sakura")).toHaveLength(1);
    expect(screen.getByLabelText("Related performer 1 role name")).toBeInTheDocument();
    expect(screen.getByLabelText("Related performer 1 order")).toHaveValue(1);
    expect(screen.getByLabelText("Related performer 1 credit type"))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Credit" }))
      .not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Related performer 1 order"), {
      target: { value: "7" },
    });
    fireEvent.blur(screen.getByLabelText("Related performer 1 order"));
    expect(screen.getByLabelText("Related performer 1 order")).toHaveValue(1);
    fireEvent.change(screen.getByLabelText("Related performer 1 role name"), {
      target: { value: "Lead Role" },
    });
    fireEvent.change(screen.getByLabelText("Related performer 1 credit type"), {
      target: { value: "Custom Main" },
    });
    expect(screen.queryByText("performer_aoi")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("Search related performers"));
    expect(
      screen.getByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Related Video" },
    });
    fillVideoRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Related Video")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  }, 15_000);

  it.each([
    {
      path: "/videos/video_credit/edit",
      workType: "video",
      getCommand: "video_get",
      record: persistedVideo({ id: "video_credit", title: "Credit Video" }),
    },
    {
      path: "/images/image_credit/edit",
      workType: "image",
      getCommand: "image_get",
      record: persistedImage({ id: "image_credit", title: "Credit Image" }),
    },
  ])(
    "loads existing $workType credits into compact Related Performers",
    async ({ path, workType, getCommand, record }) => {
      window.history.pushState({}, "", path);
      const performer = persistedPerformer({
        id: "performer_credit",
        name: "Credit Performer",
        aliasesJson: '["Identity Alias"]',
      });
      const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
        if (command === getCommand) {
          return record;
        }
        if (command === "credit_list_by_work") {
          expect(args).toEqual({ workType, workId: record.id });
          return [
            {
              id: `credit_${workType}`,
              workType,
              workId: record.id,
              performerId: performer.id,
              characterName: "Loaded Role",
              characterOriginalName: "Original Role",
              creditedAs: "Custom Billing",
              creditedAsMode: "custom",
              creditTypeCategoryId: "cat_voice",
              roleImportanceCategoryId: "cat_main",
              characterMode: "text",
              characterId: null,
              billingOrder: 3,
              note: "Loaded note",
              legacySourceKey: null,
              createdAt: "1",
              updatedAt: "1",
            },
          ];
        }
        if (command === "performer_list") {
          return [performer];
        }
        if (command === "managed_category_list") {
          return [
            managedCategoryFixture({
              key: "cat_voice",
              name: "Voice",
              showInCredits: true,
            }),
            managedCategoryFixture({
              key: "cat_main",
              name: "Main",
              showInCredits: true,
            }),
          ];
        }
        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };
      window.localStorage.setItem(
        "sakurava.performerSuggestionCache.v1",
        JSON.stringify({ creditType: ["User Main"] }),
      );
      window.localStorage.setItem(
        "sakurava.performerSuggestionsCacheVersion",
        "batch-38-9-4-direct-field-history-v1",
      );

      render(<App />);

      expect(await screen.findByRole("heading", { name: "Related Performers" }))
        .toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByLabelText("Related performer 1 role name"))
          .toHaveValue("Loaded Role"),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Related performer 1 credit type"))
          .toHaveValue("cat_voice"),
      );
      expect(screen.getByLabelText("Related performer 1 credit type"))
        .not.toHaveAttribute("list");
      fireEvent.focus(screen.getByLabelText("Related performer 1 credit type"));
      const creditTypeSuggestions = screen.getByRole("listbox", {
        name: "Credit Type suggestions",
      });
      expect(within(creditTypeSuggestions).getByRole("button", {
        name: "User Main",
      })).toBeInTheDocument();
      expect(within(creditTypeSuggestions).queryByRole("button", {
        name: "Main",
      })).not.toBeInTheDocument();
      expect(screen.getByRole("button", {
        name: "Remove Related performer 1 credit type suggestion User Main",
      })).toBeInTheDocument();
      expect(screen.getByLabelText("Related performer 1 order"))
        .toHaveAttribute("type", "number");
      const list = screen.getByTestId("related-performer-credit-list");
      expect(within(list).getByText("Credit Performer")).toBeInTheDocument();
      expect(within(list).getByRole("button", { name: "Remove Credit Performer" }))
        .toBeInTheDocument();
      expect(screen.queryByText("Character Mode")).not.toBeInTheDocument();
      expect(screen.queryByText("Credited As Mode")).not.toBeInTheDocument();
      expect(screen.queryByText("Character Original Name")).not.toBeInTheDocument();
      expect(screen.queryByText("Role Importance")).not.toBeInTheDocument();
      expect(screen.queryByText("Billing Order")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Role$/)).not.toBeInTheDocument();
      expect(screen.getByText("Role Name")).toBeInTheDocument();
      expect(screen.queryByLabelText(/Move Credit Performer/))
        .not.toBeInTheDocument();
      expect(screen.queryByText("Loaded note")).not.toBeInTheDocument();
      expect(screen.queryByText("Identity Alias")).not.toBeInTheDocument();
    },
  );

  it("does not persist form picker queries after navigating away and back", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_cherry",
            name: "Cherry Sakura",
            aliasesJson: '["Cherry"]',
          }),
        ];
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({ key: "cat_video", name: "Video Only" }),
          managedCategoryFixture({ key: "cat_image", name: "Image Only" }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    window.history.pushState({}, "", "/videos/new");
    const videoRender = render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "Video" },
    });
    fireEvent.change(await screen.findByLabelText("Search related performers"), {
      target: { value: "Cherry" },
    });
    videoRender.unmount();

    window.history.pushState({}, "", "/images/new");
    const imageRender = render(<App />);
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toHaveValue("");
    expect(await screen.findByLabelText("Search related performers")).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "Image" },
    });
    imageRender.unmount();

    window.history.pushState({}, "", "/videos/new");
    render(<App />);
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toHaveValue("");
    expect(screen.queryByTestId("category-result-row")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Search related performers"))
      .toHaveValue("");
    expect(screen.queryByTestId("related-performer-result-row"))
      .not.toBeInTheDocument();
  });

  it("selects existing Images on video forms and saves relatedImagesJson", async () => {
    window.history.pushState({}, "", "/videos/new");
    const created = persistedVideo({
      title: "Video With Images",
      relatedImagesJson:
        '[{"recordId":"image_hanami","titleSnapshot":"Hanami Gallery"}]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "performer_list" || command === "video_list") {
          return [];
        }
        if (command === "image_list") {
          return [
            persistedImage({
              id: "image_hanami",
              title: "Hanami Gallery",
              originalTitle: "Spring Set",
            }),
            persistedImage({
              id: "image_night",
              title: "Night Gallery",
              originalTitle: "",
            }),
          ];
        }
        if (command === "video_create") {
          expect(args.input.title).toBe("Video With Images");
          expect(args.input.relatedImagesJson).toBe(
            '[{"recordId":"image_hanami","titleSnapshot":"Hanami Gallery"}]',
          );
          return created;
        }
        if (command === "video_get") {
          return created;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const relatedImageSearch = await screen.findByLabelText("Search related images");
    expect(relatedImageSearch).toHaveClass("select-text");
    expect(screen.queryByTestId("related-image-result-row")).not.toBeInTheDocument();
    fireEvent.focus(relatedImageSearch);
    expect(
      await screen.findByRole("button", { name: "Add related image Hanami Gallery" }),
    ).toBeInTheDocument();
    fireEvent.change(relatedImageSearch, {
      target: { value: "hana" },
    });
    expect(within(screen.getByRole("button", {
      name: "Add related image Hanami Gallery",
    })).getByText("Hana").tagName.toLowerCase()).toBe("mark");
    fireEvent.change(relatedImageSearch, {
      target: { value: "img-001" },
    });
    const imageResult = await screen.findByRole("button", {
      name: "Add related image Hanami Gallery",
    });
    expect(imageResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(imageResult).getByText("Hanami Gallery").closest(".truncate"))
      .toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(imageResult).getByText("IMG-001 · 2026")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(within(imageResult).getByText("IMG-001 · 2026"))
      .not.toHaveClass("truncate");
    expect(imageResult).toHaveTextContent("IMG-001 · 2026 · ★ 3.5");
    expect(within(imageResult).getByText("★ 3.5")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(imageResult).not.toHaveTextContent("IMG-...");
    expect(imageResult).not.toHaveTextContent("202...");
    expect(imageResult).not.toHaveTextContent("★ 3...");
    expect(within(imageResult).queryByText(/Rating 3\.5/)).not.toBeInTheDocument();
    fireEvent.click(
      imageResult,
    );
    expect(screen.getByLabelText("Search related images")).toHaveValue("img-001");
    expect(screen.queryByTestId("related-image-result-row")).not.toBeInTheDocument();
    expect(screen.getByText("IMG-001")).toBeInTheDocument();
    expect(screen.queryByText("image_hanami")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Video With Images" },
    });
    fillVideoRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Video With Images")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("selects existing Videos on image forms and saves relatedVideosJson", async () => {
    window.history.pushState({}, "", "/images/new");
    const created = persistedImage({
      title: "Image With Videos",
      relatedVideosJson:
        '[{"recordId":"video_spring","titleSnapshot":"Spring Feature"}]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "performer_list" || command === "image_list") {
          return [];
        }
        if (command === "video_list") {
          return [
            persistedVideo({
              id: "video_spring",
              title: "Spring Feature",
              originalTitle: "Feature Original",
            }),
          ];
        }
        if (command === "image_create") {
          expect(args.input.title).toBe("Image With Videos");
          expect(args.input.relatedVideosJson).toBe(
            '[{"recordId":"video_spring","titleSnapshot":"Spring Feature"}]',
          );
          return created;
        }
        if (command === "image_get") {
          return created;
        }
        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const relatedVideoSearch = await screen.findByLabelText("Search related videos");
    expect(relatedVideoSearch).toHaveClass("select-text");
    expect(screen.queryByTestId("related-video-result-row")).not.toBeInTheDocument();
    fireEvent.focus(relatedVideoSearch);
    expect(
      await screen.findByRole("button", { name: "Add related video Spring Feature" }),
    ).toBeInTheDocument();
    fireEvent.change(relatedVideoSearch, {
      target: { value: "spring" },
    });
    expect(within(screen.getByRole("button", {
      name: "Add related video Spring Feature",
    })).getByText("Spring").tagName.toLowerCase()).toBe("mark");
    fireEvent.change(relatedVideoSearch, {
      target: { value: "vid-001" },
    });
    const videoResult = await screen.findByRole("button", {
      name: "Add related video Spring Feature",
    });
    expect(videoResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(videoResult).getByText("Spring Feature").closest(".truncate"))
      .toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(videoResult).getByText("VID-001 · 2026")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(within(videoResult).getByText("VID-001 · 2026"))
      .not.toHaveClass("truncate");
    expect(videoResult).toHaveTextContent("VID-001 · 2026 · ★ 3.5");
    expect(within(videoResult).getByText("★ 3.5")).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(videoResult).not.toHaveTextContent("VID-...");
    expect(videoResult).not.toHaveTextContent("202...");
    expect(videoResult).not.toHaveTextContent("★ 3...");
    expect(within(videoResult).queryByText(/Rating 3\.5/)).not.toBeInTheDocument();
    fireEvent.click(
      videoResult,
    );
    expect(screen.getByLabelText("Search related videos")).toHaveValue("vid-001");
    expect(screen.queryByTestId("related-video-result-row")).not.toBeInTheDocument();
    expect(screen.getByText("VID-001")).toBeInTheDocument();
    expect(screen.queryByText("video_spring")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Image With Videos" },
    });
    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Image With Videos")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps unresolved related Images visible until removed from the current record", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const existing = persistedVideo({
      title: "Legacy Image Relation Video",
      relatedImagesJson:
        '[{"recordId":"missing_image","titleSnapshot":"Former Gallery"}]',
    });
    const updated = persistedVideo({
      ...existing,
      relatedImagesJson: "[]",
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "video_get") {
          return existing;
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }
        if (command === "video_update") {
          expect(args.patch.relatedImagesJson).toBe("[]");
          return updated;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Former Gallery")).toBeInTheDocument();
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
    expect(screen.queryByText("missing_image")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove related image Former Gallery",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Former Gallery")).not.toBeInTheDocument(),
    );
    fillVideoRatingFields();
    clickSaveAndConfirm();

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.some(([command, args]) => {
          const updateArgs = args as {
            id?: string;
            patch?: { relatedImagesJson?: string };
          };
          return (
            command === "video_update" &&
            updateArgs.id === "video_test_001" &&
            updateArgs.patch?.relatedImagesJson === "[]"
          );
        }),
      ).toBe(true);
    });
  });

  it("selects existing Performers on image forms and saves relatedPerformersJson", async () => {
    window.history.pushState({}, "", "/images/new");
    const created = persistedImage({
      title: "Related Image",
      relatedPerformersJson:
        '[{"performerId":"performer_yuki","nameSnapshot":"Yuki Tanaka"}]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "performer_list") {
          return [
            persistedPerformer({
              id: "performer_yuki",
              name: "Yuki Tanaka",
              originalName: "Tanaka Yuki",
            }),
          ];
        }
        if (command === "image_create") {
          expect(args.input.title).toBe("Related Image");
          expect(args.input.relatedPerformersJson).toBe(
            '[{"performerId":"performer_yuki","nameSnapshot":"Yuki Tanaka"}]',
          );
          return created;
        }
        if (command === "image_get") {
          return created;
        }
        if (command === "credit_create") {
          expect(args.input).toEqual(
            expect.objectContaining({
              workType: "image",
              workId: created.id,
              performerId: "performer_yuki",
            }),
          );
          return { id: "credit_yuki", ...args.input };
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Search related performers"), {
      target: { value: "yuki" },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related performer Yuki Tanaka",
      }),
    );
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Related Image" },
    });
    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Related Image")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("renders Performer form Related Videos and Related Images pickers without back-link saves", async () => {
    window.history.pushState({}, "", "/performers/new");
    const created = persistedPerformer({ name: "Related Performer" });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "video_list") {
          return [
            persistedVideo({
              id: "video_spring",
              title: "Spring Feature",
              code: "VID-123",
            }),
          ];
        }
        if (command === "image_list") {
          return [
            persistedImage({
              id: "image_hanami",
              title: "Hanami Gallery",
              code: "IMG-123",
            }),
          ];
        }
        if (command === "performer_create") {
          expect(args.input.name).toBe("Related Performer");
          expect(args.input.relatedVideosJson).toBe(
            '[{"recordId":"video_spring","titleSnapshot":"Spring Feature"}]',
          );
          expect(args.input.relatedImagesJson).toBe("[]");
          expect(args.input.filmographyCount).toBe(1);
          expect(args.input.pictorialsCount).toBe(0);
          return created;
        }
        if (command === "performer_get") {
          return created;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Search related videos"), {
      target: { value: "vid-123" },
    });
    expect(screen.getByText("Spring Feature")).toBeInTheDocument();
    expect(screen.getByText(/VID-123/)).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related video Spring Feature",
      }),
    );
    expect(screen.getByText("VID-123")).toBeInTheDocument();
    expect(screen.queryByText("video_spring")).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Search related images"), {
      target: { value: "img-123" },
    });
    expect(screen.getByText("Hanami Gallery")).toBeInTheDocument();
    expect(screen.getByText(/IMG-123/)).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related image Hanami Gallery",
      }),
    );
    expect(screen.getByText("IMG-123")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove related image IMG-123",
      }),
    );
    fireEvent.focus(screen.getByLabelText("Search related images"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Add related image Hanami Gallery",
        }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Related Performer" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Related Performer")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps unresolved related Performers visible until removed from the current record", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const existing = persistedVideo({
      title: "Legacy Relation Video",
      relatedPerformersJson:
        '[{"performerId":"missing_performer","nameSnapshot":"Former Performer"}]',
    });
    const updated = persistedVideo({
      ...existing,
      relatedPerformersJson: "[]",
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "video_get") {
          return existing;
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }
        if (command === "video_update") {
          expect(args.patch.relatedPerformersJson).toBe("[]");
          return updated;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Former Performer")).toBeInTheDocument();
    expect(screen.queryByText("missing_performer")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Former Performer",
      }),
    );
    fillVideoRatingFields();
    clickSaveAndConfirm();

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.some(([command, args]) => {
          const updateArgs = args as {
            id?: string;
            patch?: { relatedPerformersJson?: string };
          };
          return (
            command === "video_update" &&
            updateArgs.id === "video_test_001" &&
            updateArgs.patch?.relatedPerformersJson === "[]"
          );
        }),
      ).toBe(true);
    });
  });

  it("keeps many related performers compact, reorderable, and removable", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const existing = persistedVideo({
      title: "Many Related Performers",
      relatedPerformersJson: JSON.stringify(
        Array.from({ length: 5 }, (_, index) => ({
          performerId: `performer_${index + 1}`,
          nameSnapshot: `Performer ${index + 1}`,
        })),
      ),
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return existing;
      }
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const performerSection = (await screen.findByRole("heading", {
      name: "Related Performers",
    })).closest("section") as HTMLElement;
    const relatedPerformers = within(performerSection);

    expect(relatedPerformers.getByText("Performer 1")).toBeInTheDocument();
    expect(relatedPerformers.getByText("Performer 5")).toBeInTheDocument();
    expect(relatedPerformers.getByTestId("related-performer-credit-list"))
      .toHaveClass("overflow-y-auto");
    expect(relatedPerformers.queryByLabelText(/Move Performer/))
      .not.toBeInTheDocument();
    fireEvent.change(
      relatedPerformers.getByLabelText("Related performer 5 order"),
      { target: { value: "2" } },
    );
    fireEvent.blur(
      relatedPerformers.getByLabelText("Related performer 5 order"),
    );
    expect(relatedPerformers.getByLabelText("Related performer 2 order"))
      .toHaveValue(2);
    fireEvent.click(
      relatedPerformers.getByRole("button", {
        name: "Remove Performer 5",
      }),
    );
    expect(relatedPerformers.queryByText("Performer 5")).not.toBeInTheDocument();
    expect(relatedPerformers.getAllByTestId("credit-editor-row")).toHaveLength(4);
  });

  it("expands, collapses, removes, and clears related catalog chips", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    const existing = persistedPerformer({
      name: "Many Related Catalogs",
      relatedVideosJson: relatedCatalogJson("video", 5),
      relatedImagesJson: "[]",
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_get") {
        return existing;
      }
      if (
        command === "video_list" ||
        command === "image_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const videosSection = (await screen.findByRole("heading", {
      name: "Related Videos",
    })).closest("section") as HTMLElement;
    const relatedVideos = within(videosSection);

    expect(relatedVideos.getByText("video 1")).toBeInTheDocument();
    expect(relatedVideos.queryByText("video 5")).not.toBeInTheDocument();
    fireEvent.click(relatedVideos.getByRole("button", { name: "+2 more" }));
    expect(relatedVideos.getByText("video 5")).toBeInTheDocument();
    fireEvent.click(relatedVideos.getByRole("button", { name: "Show less" }));
    expect(relatedVideos.queryByText("video 5")).not.toBeInTheDocument();
    fireEvent.click(relatedVideos.getByRole("button", { name: "+2 more" }));
    fireEvent.click(
      relatedVideos.getByRole("button", {
        name: "Remove related video video 5",
      }),
    );
    expect(relatedVideos.queryByText("video 5")).not.toBeInTheDocument();
    expect(relatedVideos.getByText("4 videos selected")).toBeInTheDocument();
    fireEvent.click(relatedVideos.getByRole("button", { name: "Clear all" }));
    expect(relatedVideos.getByText("No related videos selected.")).toBeInTheDocument();
  });

  it("keeps legacy record-only categories visible and removable on edit forms", () => {
    window.history.pushState({}, "", "/videos/sample-id/edit");
    render(<App />);

    expect(screen.getByText("Category A")).toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
    expect(screen.queryByText(/Record.only/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Category A" }));

    expect(screen.queryByText("Category A")).not.toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/new",
      buttonName: "Browse",
      inputLabel: "Cover Path",
      selectedPath: "D:/Sakurava/Covers/video-cover.jpg",
      expectedDialog: {
        title: "Select Image File",
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
          },
        ],
      },
    },
    {
      path: "/videos/new",
      buttonName: "Browse",
      buttonIndex: 1,
      inputLabel: "Media Path",
      selectedPath: "D:/Sakurava/Videos/sample-video.mp4",
      expectedDialog: {
        title: "Select Media File",
        directory: false,
        filters: [
          {
            name: "Media",
            extensions: ["mp4", "mkv", "avi", "mov", "wmv", "webm", "m4v"],
          },
        ],
      },
    },
    {
      path: "/images/new",
      buttonName: "Browse",
      inputLabel: "Cover Path",
      selectedPath: "D:/Sakurava/Images/image-cover.png",
      expectedDialog: {
        title: "Select Image File",
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
          },
        ],
      },
    },
    {
      path: "/performers/new",
      buttonName: "Browse",
      inputLabel: "Cover Path",
      selectedPath: "D:/Sakurava/Performers/performer-cover.webp",
      expectedDialog: {
        title: "Select Image File",
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
          },
        ],
      },
    },
  ])(
    "fills $inputLabel from native picker on $path",
    async ({ path, buttonName, buttonIndex = 0, inputLabel, selectedPath, expectedDialog }) => {
      window.history.pushState({}, "", path);
      window.__TAURI_INTERNALS__ = {
        invoke: vi.fn(),
      };
      dialogMocks.open.mockResolvedValue(selectedPath);

      render(<App />);

      const browseButton = screen.getAllByRole("button", { name: buttonName })[
        buttonIndex
      ];
      expect(browseButton).toBeEnabled();
      fireEvent.click(browseButton);

      await waitFor(() =>
        expect(screen.getByLabelText(inputLabel)).toHaveValue(selectedPath),
      );
      expect(dialogMocks.open).toHaveBeenCalledWith(
        expect.objectContaining({
          multiple: false,
          ...expectedDialog,
        }),
      );
    },
  );

  it.each([
    {
      path: "/videos",
      searchLabel: "Videos search",
      searchValue: "sample",
      dataFilterLabel: "Duration",
      dataFilterValue: "Short",
      dataChip: "Duration: Short",
    },
    {
      path: "/images",
      searchLabel: "Images search",
      searchValue: "sample",
      dataFilterLabel: "Image Count",
      dataFilterValue: "Many",
      dataChip: "Image Count: Many",
    },
    {
      path: "/performers",
      searchLabel: "Performers search",
      searchValue: "sample",
      dataFilterLabel: "Availability",
      dataFilterValue: "Active",
      dataChip: "Availability: Active",
    },
  ])(
    "renders active toolbar chips for $path",
    ({ path, searchLabel, searchValue, dataFilterLabel, dataFilterValue, dataChip }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
      const panel = within(screen.getByRole("region", { name: `${path === "/videos" ? "Videos" : path === "/images" ? "Images" : "Performers"} filters` }));
      fireEvent.change(screen.getByLabelText(searchLabel), {
        target: { value: searchValue },
      });
      fireEvent.change(panel.getByLabelText("Category"), {
        target: { value: "Category A" },
      });
      fireEvent.click(panel.getByRole("button", { name: `${dataFilterLabel}: ${dataFilterValue}` }));
      fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));

      expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
      expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
      expect(screen.queryByText(`Search: ${searchValue}`)).not.toBeInTheDocument();
      expect(screen.getByText("Category: Category A")).toBeInTheDocument();
      expect(screen.getByText(dataChip)).toBeInTheDocument();
    },
  );

  it.each([
    {
      path: "/videos",
      buttonName: "Filters 0",
      regionName: "Videos filters",
      sectionLabels: ["Availability", "Censorship", "Release Years", "Publisher / Label", "Category", "Quality", "Rating", "Duration"],
      controls: ["Release Years", "Publisher / Label", "Category"],
    },
    {
      path: "/images",
      buttonName: "Filters 0",
      regionName: "Images filters",
      sectionLabels: ["Availability", "Censorship", "Release Years", "Publisher / Label", "Category", "Quality", "Rating", "Image Count"],
      controls: ["Release Years", "Publisher / Label", "Category"],
    },
    {
      path: "/performers",
      buttonName: "Filters 0",
      regionName: "Performers filters",
      sectionLabels: ["Availability", "Cup Size", "Gender", "Body Height", "Age", "Body Type", "Nationality", "Debut Years", "Rating", "Filmography Count", "Category", "Pictorials Count"],
      controls: ["Nationality", "Debut Years", "Cup Size", "Category"],
    },
  ])(
    "opens the advanced filter panel for $path",
    ({ path, buttonName, regionName, sectionLabels, controls }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      const panel = within(screen.getByRole("region", { name: regionName }));
      for (const sectionLabel of sectionLabels) {
        expect(panel.getByText(sectionLabel)).toBeInTheDocument();
      }
      for (const control of controls) {
        expect(panel.getByLabelText(control)).toBeInTheDocument();
      }
      expect(panel.queryByRole("button", { name: "Reset all filters" })).not.toBeInTheDocument();
      if (path === "/performers") {
        expect(panel.queryByText("Deferred")).not.toBeInTheDocument();
        expect(panel.getByText("No Gender values found")).toBeInTheDocument();
        expect(panel.getByText("No Body Type categories found")).toBeInTheDocument();
        expect(panel.getByLabelText("Gender")).toBeDisabled();
        expect(panel.getByLabelText("Body Type")).toBeDisabled();
      } else {
        expect(panel.queryByText("Deferred")).not.toBeInTheDocument();
      }
      expect(panel.queryByText("Production")).not.toBeInTheDocument();
      expect(panel.queryByText("Format")).not.toBeInTheDocument();
      expect(panel.queryByText("Actions")).not.toBeInTheDocument();
    },
  );

  it("keeps catalog picker search in the main field without rendering a second popup search box", () => {
    window.history.pushState({}, "", "/performers");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    const categoryField = panel.getByLabelText("Category");
    fireEvent.focus(categoryField);
    fireEvent.change(categoryField, { target: { value: "Cat" } });

    expect(panel.getByLabelText("Category")).toHaveValue("Cat");
    expect(panel.queryByPlaceholderText("Search categories...")).not.toBeInTheDocument();

    const debutYearsField = panel.getByLabelText("Debut Years");
    fireEvent.focus(debutYearsField);

    expect(panel.getByPlaceholderText("Search debut years...")).toBe(debutYearsField);
    expect(panel.getAllByPlaceholderText("Search debut years...")).toHaveLength(1);
  });

  it("highlights catalog filter dropdown query matches without changing visible text", () => {
    window.history.pushState({}, "", "/videos");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Videos filters" }));

    const categoryField = panel.getByLabelText("Category");
    fireEvent.focus(categoryField);
    fireEvent.change(categoryField, { target: { value: "cat" } });

    const categoryOptions = panel.getByRole("listbox", { name: "Category options" });
    const categoryOption = within(categoryOptions).getByRole("option", { name: "Category A+" });
    expect(categoryOption).toHaveTextContent("Category A");
    expect(within(categoryOption).getByTestId("catalog-query-highlight"))
      .toHaveClass("bg-sakura-100", "text-sakura-800");

    fireEvent.change(categoryField, { target: { value: "" } });
    expect(
      within(categoryOptions).getByRole("option", { name: "Category A+" }),
    ).toHaveTextContent("Category A");
    expect(within(categoryOptions).queryByTestId("catalog-query-highlight"))
      .not.toBeInTheDocument();
  });

  it("uses a custom Sort picker and closes other open filter dropdowns", () => {
    window.history.pushState({}, "", "/performers");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    const categoryField = panel.getByLabelText("Category");
    fireEvent.focus(categoryField);
    expect(panel.getByRole("listbox", { name: "Category options" })).toBeInTheDocument();

    const sortField = catalogSortControl("performers");
    fireEvent.click(sortField);

    expect(screen.queryByRole("listbox", { name: "Category options" })).not.toBeInTheDocument();
    const sortOptions = screen.getByRole("listbox", { name: "Sort options" });
    expect(sortOptions).toBeInTheDocument();
    expect(within(sortOptions).queryByRole("option", { name: "Rating" }))
      .not.toBeInTheDocument();
    fireEvent.click(within(sortOptions).getByRole("option", { name: "Name Z-A" }));

    expect(sortField).toHaveTextContent("Name Z-A");
    expect(screen.queryByRole("listbox", { name: "Sort options" })).not.toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos",
      kind: "videos" as const,
      expected: ["Title A-Z", "Title Z-A", "Last Added", "Last Updated"],
      removed: ["Release Year", "Rating", "Duration", "Image Count", "Status", "Filmography", "Pictorials"],
      defaultSort: "Title A-Z",
    },
    {
      path: "/images",
      kind: "images" as const,
      expected: ["Title A-Z", "Title Z-A", "Last Added", "Last Updated"],
      removed: ["Release Year", "Rating", "Duration", "Image Count", "Status", "Filmography", "Pictorials"],
      defaultSort: "Title A-Z",
    },
    {
      path: "/performers",
      kind: "performers" as const,
      expected: ["Name A-Z", "Name Z-A", "Last Added", "Last Updated"],
      removed: ["Release Year", "Rating", "Duration", "Image Count", "Status", "Filmography", "Pictorials"],
      defaultSort: "Name A-Z",
    },
  ])("renders simplified catalog toolbar sort options for $path", ({ path, kind, expected, removed, defaultSort }) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(catalogSortControl(kind)).toHaveTextContent(defaultSort);
    fireEvent.click(catalogSortControl(kind));

    const sortOptions = screen.getByRole("listbox", { name: "Sort options" });
    expect(within(sortOptions).getAllByRole("option").map((option) => option.textContent))
      .toEqual(expected);
    for (const removedOption of removed) {
      expect(within(sortOptions).queryByRole("option", { name: removedOption }))
        .not.toBeInTheDocument();
    }
  });

  it("keeps only one catalog filter dropdown open and closes it on Escape or another control", () => {
    window.history.pushState({}, "", "/performers");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    const debutYearsField = panel.getByLabelText("Debut Years");
    fireEvent.focus(debutYearsField);
    expect(panel.getByRole("listbox", { name: "Debut Years options" })).toBeInTheDocument();

    const categoryField = panel.getByLabelText("Category");
    fireEvent.focus(categoryField);
    expect(screen.queryByRole("listbox", { name: "Debut Years options" })).not.toBeInTheDocument();
    expect(panel.getByRole("listbox", { name: "Category options" })).toBeInTheDocument();

    fireEvent.click(panel.getByRole("button", { name: "Availability: Active" }));
    expect(screen.queryByRole("listbox", { name: "Category options" })).not.toBeInTheDocument();

    fireEvent.focus(panel.getByLabelText("Cup Size"));
    expect(panel.getByRole("listbox", { name: "Cup Size options" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Cup Size options" })).not.toBeInTheDocument();

    fireEvent.click(catalogSortControl("performers"));
    const catalogSortOptions = screen.getByRole("listbox", { name: "Sort options" });
    fireEvent.scroll(catalogSortOptions);
    expect(catalogSortOptions).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("listbox", { name: "Sort options" })).not.toBeInTheDocument();
  });

  it("keeps manual path typing available when browse is enabled", () => {
    window.history.pushState({}, "", "/videos/new");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    render(<App />);

    const coverPathInput = screen.getByLabelText("Cover Path");
    fireEvent.change(coverPathInput, {
      target: { value: "D:/Typed/cover.jpg" },
    });

    expect(coverPathInput).toHaveValue("D:/Typed/cover.jpg");
  });

  it("keeps mini thumbnail fields off Video and Image forms", () => {
    window.history.pushState({}, "", "/videos/new");
    const { unmount } = render(<App />);

    expect(screen.queryByLabelText("Thumbnail 1")).not.toBeInTheDocument();
    unmount();

    window.history.pushState({}, "", "/images/new");
    render(<App />);

    expect(screen.queryByLabelText("Thumbnail 1")).not.toBeInTheDocument();
  });

  it("does not open native picker from browser preview", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    const browseButton = screen.getAllByRole("button", { name: "Browse" })[0];
    expect(browseButton).toBeDisabled();
    fireEvent.click(browseButton);

    expect(dialogMocks.open).not.toHaveBeenCalled();
  });

  it("renders completed Performer form fields as editable saved data", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    expect(screen.getByLabelText("Availability")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Availability")).toHaveValue("Unknown");
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.getByText("Mini Thumbnail Paths")).toBeInTheDocument();
    expect(screen.getByText("No Mini Thumbnail Path row added.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Browse" })).toHaveLength(1);
    expect(screen.getByLabelText("Filmography")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Pictorials")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Debut Date")).not.toBeDisabled();
    expect(screen.getByLabelText("Retired Date")).not.toBeDisabled();
    expect(screen.getByLabelText("Birth Date")).not.toBeDisabled();
    expect(screen.getByLabelText("Birthplace")).not.toBeDisabled();
    expect(screen.getByLabelText("Nationality")).not.toBeDisabled();
    expect(screen.getByLabelText("Blood Type")).not.toBeDisabled();
    expect(screen.getByLabelText("Height")).not.toBeDisabled();
    expect(screen.getByLabelText("Weight")).not.toBeDisabled();
    const measurements = screen.getByLabelText("Measurements");
    expect(measurements).toBeInTheDocument();
    expect(screen.getByLabelText("Measurements unit")).toHaveTextContent("cm");
    expect(measurements).toHaveValue("");
    expect(measurements).not.toHaveAttribute("placeholder");
    expect(measurements).not.toHaveValue("90 / 59 / 89");
    expect(screen.queryByLabelText("Measurements segment 1")).not.toBeInTheDocument();
    fireEvent.change(measurements, {
      target: { value: "906090" },
    });
    expect(measurements).toHaveValue("90 / 60 / 90");
    expect(screen.queryByLabelText("Bust")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Waist")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hip")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Measurement")).not.toBeInTheDocument();
    expect(screen.queryByText("Use Bust / Waist / Hip in cm")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cup Size")).not.toBeDisabled();
    expect(screen.queryByLabelText("Years Active (planned)")).not.toBeInTheDocument();
    expect(screen.queryByText(/not saved in MVP/i)).not.toBeInTheDocument();
  });

  it("derives non-editable Performer Availability from debut and retired dates", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    const status = screen.getByLabelText("Availability");
    expect(status).toHaveAttribute("readonly");
    expect(status).toHaveValue("Unknown");
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Debut Date"), {
      target: { value: "2020-01-02" },
    });
    expect(status).toHaveValue("Active");

    fireEvent.change(screen.getByLabelText("Retired Date"), {
      target: { value: "2024-03-04" },
    });
    expect(status).toHaveValue("Retired");

    fireEvent.change(screen.getByLabelText("Debut Date"), {
      target: { value: "" },
    });
    expect(status).toHaveValue("Retired");
  });

  it("normalizes continuous and pasted Measurements values into one masked input", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    const measurements = screen.getByLabelText("Measurements");

    fireEvent.change(measurements, { target: { value: "1" } });
    expect(measurements).toHaveValue("1");
    fireEvent.change(measurements, { target: { value: "11" } });
    expect(measurements).toHaveValue("11");
    fireEvent.change(measurements, { target: { value: "112" } });
    expect(measurements).toHaveValue("11 / 2");
    fireEvent.change(measurements, { target: { value: "1122" } });
    expect(measurements).toHaveValue("11 / 22");
    fireEvent.change(measurements, { target: { value: "11223" } });
    expect(measurements).toHaveValue("11 / 22 / 3");
    fireEvent.change(measurements, { target: { value: "112233" } });
    expect(measurements).toHaveValue("11 / 22 / 33");

    fireEvent.change(measurements, { target: { value: "11/22/33" } });
    expect(measurements).toHaveValue("11 / 22 / 33");

    fireEvent.change(measurements, { target: { value: "11 / 22 / 33 cm" } });
    expect(measurements).toHaveValue("11 / 22 / 33");
    expect(screen.getByLabelText("Measurements unit")).toHaveTextContent("cm");
    expect((measurements as HTMLInputElement).value).not.toContain("cm");

    fireEvent.change(measurements, { target: { value: "letters and arbitrary text" } });
    expect(measurements).toHaveValue("");
    fireEvent.change(measurements, { target: { value: "123456789" } });
    expect(measurements).toHaveValue("12 / 34 / 56");
  });

  it("loads local Birthplace Nationality Blood Type and Cup Size recent suggestions while preserving manual typing", async () => {
    window.history.pushState({}, "", "/performers/new");
    seedPerformerSuggestionCache({
      birthplace: ["Tokyo"],
      nationality: ["Japanese"],
      bloodType: ["A"],
      cupSize: ["D"],
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const birthplace = await screen.findByLabelText("Birthplace");
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Birthplace suggestions"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Nationality suggestions")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Blood Type suggestions")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cup Size suggestions")).not.toBeInTheDocument();

    fireEvent.focus(birthplace);
    const birthplaceSuggestions = await screen.findByLabelText("Birthplace suggestions");
    expect(within(birthplaceSuggestions).queryByText("Recent")).not.toBeInTheDocument();
    expect(within(birthplaceSuggestions).queryByText("Standard")).not.toBeInTheDocument();
    expect(within(birthplaceSuggestions).getByRole("button", { name: "Tokyo" }))
      .toBeInTheDocument();
    expect(
      within(birthplaceSuggestions).getByRole("button", {
        name: "Remove Birthplace suggestion Tokyo",
      }),
    ).toBeInTheDocument();

    fireEvent.click(within(birthplaceSuggestions).getByRole("button", { name: "Tokyo" }));
    expect(birthplace).toHaveValue("Tokyo");

    fireEvent.change(birthplace, { target: { value: "Osaka" } });
    fireEvent.change(screen.getByLabelText("Nationality"), {
      target: { value: "Korean" },
    });
    fireEvent.change(screen.getByLabelText("Blood Type"), {
      target: { value: "AB" },
    });
    fireEvent.change(screen.getByLabelText("Cup Size"), {
      target: { value: "E" },
    });

    expect(birthplace).toHaveValue("Osaka");
    expect(screen.getByLabelText("Nationality")).toHaveValue("Korean");
    expect(screen.getByLabelText("Blood Type")).toHaveValue("AB");
    expect(screen.getByLabelText("Cup Size")).toHaveValue("E");
  });

  it("caps performer suggestions at 30 most recent values with dropdown scrolling", async () => {
    window.history.pushState({}, "", "/performers/new");
    seedPerformerSuggestionCache({
      birthplace: Array.from({ length: 31 }, (_, index) => `City ${31 - index}`),
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const birthplace = await screen.findByLabelText("Birthplace");
    fireEvent.focus(birthplace);
    const birthplaceSuggestions = await screen.findByLabelText("Birthplace suggestions");

    expect(
      within(birthplaceSuggestions).getAllByRole("button", {
        name: /^City /,
      }),
    ).toHaveLength(30);
    expect(birthplaceSuggestions).toHaveClass("max-h-72", "overflow-y-auto");
    expect(within(birthplaceSuggestions).getByRole("button", { name: "City 31" }))
      .toBeInTheDocument();
    expect(within(birthplaceSuggestions).queryByRole("button", { name: "City 1" }))
      .not.toBeInTheDocument();
    expect(
      within(birthplaceSuggestions).getByRole("button", {
        name: "Remove Birthplace suggestion City 2",
      }),
    ).toBeInTheDocument();
  });

  it("resets old and current performer suggestion cache keys without clearing records", async () => {
    window.history.pushState({}, "", "/performers/new");
    window.localStorage.setItem(
      "sakurava.hiddenPerformerSuggestions.v1",
      '{"birthplace":["Tokyo"]}',
    );
    window.localStorage.setItem(
      "sakurava.performerSuggestionCache.v1",
      '{"cupSize":["A"]}',
    );
    window.localStorage.setItem("sakurava.performerSuggestionCacheReset.v2", "reset");
    window.localStorage.setItem("sakurava.managedCategories.v1", '["Classic"]');
    const performers = [
      persistedPerformer({
        birthplace: "Tokyo",
        cupSize: "A",
      }),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return performers;
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const birthplace = await screen.findByLabelText("Birthplace");
    await waitFor(() =>
      expect(window.localStorage.getItem("sakurava.hiddenPerformerSuggestions.v1"))
        .toBeNull(),
    );
    fireEvent.focus(birthplace);
    expect(screen.queryByLabelText("Birthplace suggestions")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("Cup Size"));
    expect(screen.queryByLabelText("Cup Size suggestions")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.performerSuggestionCache.v1"))
      .toBeNull();
    expect(window.localStorage.getItem("sakurava.performerSuggestionCacheReset.v2"))
      .toBeNull();
    expect(window.localStorage.getItem("sakurava.performerSuggestionsCacheVersion"))
      .toBe("batch-38-9-4-direct-field-history-v1");
    expect(window.localStorage.getItem("sakurava.managedCategories.v1"))
      .toBe('["Classic"]');
    expect(performers[0].birthplace).toBe("Tokyo");
    expect(performers[0].cupSize).toBe("A");
  });

  it("removes performer suggestions locally by field and lets newly saved values return", async () => {
    window.history.pushState({}, "", "/performers/new");
    seedPerformerSuggestionCache({
      birthplace: ["Tokyo"],
      nationality: ["Tokyo"],
      cupSize: ["C"],
    });
    const performers = [
      persistedPerformer({
        birthplace: "Tokyo",
        nationality: "Tokyo",
        bloodType: "A",
        cupSize: "C",
      }),
    ];
    const invokeMock = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return performers;
      }
      if (command === "performer_create") {
        return persistedPerformer({
          name: "Suggestion Return",
          cupSize: "A",
        });
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    });
    const invoke = invokeMock as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const birthplace = await screen.findByLabelText("Birthplace");
    fireEvent.focus(birthplace);
    expect(
      await screen.findByRole("button", {
        name: "Remove Birthplace suggestion Tokyo",
      }),
    ).toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText("Nationality"));
    expect(
      screen.getByRole("button", {
        name: "Remove Nationality suggestion Tokyo",
      }),
    ).toBeInTheDocument();

    fireEvent.change(birthplace, {
      target: { value: "Current City" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Birthplace suggestion Tokyo",
      }),
    );
    expect(birthplace).toHaveValue("Current City");

    expect(
      screen.queryByRole("button", {
        name: "Remove Birthplace suggestion Tokyo",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Nationality suggestion Tokyo",
      }),
    ).toBeInTheDocument();
    expect(performers[0].birthplace).toBe("Tokyo");
    expect(window.localStorage.getItem("sakurava.hiddenPerformerSuggestions.v1"))
      .toBeNull();
    expect(window.localStorage.getItem("sakurava.performerSuggestionCache.v1"))
      .toContain('"birthplace":[]');
    fireEvent.focus(birthplace);
    expect(screen.queryByLabelText("Birthplace suggestions")).not.toBeInTheDocument();

    fireEvent.change(birthplace, {
      target: { value: "Manual City" },
    });
    expect(birthplace).toHaveValue("Manual City");

    const cupSize = screen.getByLabelText("Cup Size");
    fireEvent.focus(cupSize);
    expect(
      await screen.findByRole("button", {
        name: "Remove Cup Size suggestion C",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Cup Size suggestion C",
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Remove Cup Size suggestion C",
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Suggestion Return" },
    });
    fireEvent.change(cupSize, {
      target: { value: "A" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "performer_create",
        expect.objectContaining({
          input: expect.objectContaining({ cupSize: "A" }),
        }),
        undefined,
      ),
    );
    expect(window.localStorage.getItem("sakurava.performerSuggestionCache.v1"))
      .toContain('"cupSize":["A"');
  }, 10000);

  it("orders Performer form completed data sections without duplicate related placeholders", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "Basic Identity" }).closest("section"),
      screen.getByRole("heading", { name: "File" }).closest("section"),
      screen.getByRole("heading", { name: "Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "Profile Details" }).closest("section"),
      screen.getByRole("heading", { name: "Categories" }).closest("section"),
      screen.getByRole("heading", { name: "Rating" }).closest("section"),
      screen.getByRole("heading", { name: "Related Videos" }).closest("section"),
      screen.getByRole("heading", { name: "Related Images" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
    ]);

    expect(screen.queryByText("Available after relation features are added."))
      .not.toBeInTheDocument();
  });

  it("derives Performer Astrological Sign from Birth Date only", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    expect(screen.getByLabelText("Astrological Sign")).toHaveValue("Not set");
    fireEvent.change(screen.getByLabelText("Birth Date"), {
      target: { value: "1998-01-20" },
    });

    expect(screen.getByLabelText("Astrological Sign")).toHaveValue("Aquarius");
    expect(screen.getByLabelText("Debut Date")).not.toBeDisabled();
    expect(screen.getByLabelText("Retired Date")).not.toBeDisabled();
  });

  it("allows local form typing, category chips, aliases, and ratings", () => {
    window.history.pushState({}, "", "/performers/new");
    setManagedCategories(["Typed Category"]);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Typed Performer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Typed Alias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.change(screen.getByLabelText("Attraction"), {
      target: { value: "5" },
    });

    expect(screen.getByDisplayValue("Typed Performer")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.getByText("Typed Alias")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });

  it("loads Home dashboard counts and recent items from Tauri lists", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Recent Video",
            createdAt: "2026-05-14T00:00:00.000Z",
            updatedAt: "2026-05-14T00:00:00.000Z",
          }),
          persistedVideo({
            id: "video_2",
            title: "Older Video",
            favorite: false,
            createdAt: "2026-05-16T00:00:00.000Z",
            updatedAt: "2026-05-18T00:00:00.000Z",
          }),
          persistedVideo({
            id: "video_3",
            title: "Third Video",
            favorite: false,
            createdAt: "2026-05-10T00:00:00.000Z",
            updatedAt: "2026-05-19T00:00:00.000Z",
          }),
          persistedVideo({
            id: "video_4",
            title: "Fourth Video",
            favorite: false,
            createdAt: "2026-05-09T00:00:00.000Z",
            updatedAt: "2026-05-20T00:00:00.000Z",
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Recent Image",
            createdAt: "2026-05-15T00:00:00.000Z",
            updatedAt: "2026-05-15T00:00:00.000Z",
          }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Recent Performer",
            favorite: false,
            createdAt: "2026-05-13T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Recent Video")).toBeInTheDocument();
    expect(screen.getByText("Recent Image")).toBeInTheDocument();
    expect(screen.getByText("Recent Performer")).toBeInTheDocument();
    expect(screen.queryByText(/No edited records yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText("No records yet.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Filmography").length).toBeGreaterThan(0);
    const continueCataloging = screen.getByRole("region", {
      name: "Continue Cataloging",
    });
    const continueLinks = within(continueCataloging).getAllByRole("link");
    expect(continueLinks.map((link) => link.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Fourth Video"),
        expect.stringContaining("Third Video"),
        expect.stringContaining("Older Video"),
      ]),
    );
    const recentlyAddedSection = screen.getByRole("region", {
      name: "Recently Added",
    });
    expect(within(recentlyAddedSection).getAllByRole("link").map((link) => link.textContent))
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining("Older Video"),
          expect.stringContaining("Recent Image"),
          expect.stringContaining("Recent Video"),
          expect.stringContaining("Recent Performer"),
        ]),
      );
    expect(screen.getByText("4 saved videos")).toBeInTheDocument();
    expect(screen.getByText("1 saved image")).toBeInTheDocument();
    expect(screen.getByText("1 saved performer")).toBeInTheDocument();
    expect(screen.getByText("2 favorite items")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("video_list", {}, undefined);
    expect(invoke).toHaveBeenCalledWith("image_list", {}, undefined);
    expect(invoke).toHaveBeenCalledWith("performer_list", {}, undefined);
  });

  it("loads video collection from the Tauri command boundary when available", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ title: "Persisted Video" })];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Persisted Video")).toBeInTheDocument();
    expect(screen.getByText("1 video")).toBeInTheDocument();
    expect(screen.queryByText("video_test_001")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("video_list", {}, undefined);
  });

  it("does not expose Credit counts on Video Catalog cards", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({ id: "video_credits", title: "Credited Catalog Video" }),
          persistedVideo({ id: "video_empty", title: "Empty Credits Video" }),
        ];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Credited Catalog Video")).toBeInTheDocument();
    expect(screen.getByText("Empty Credits Video")).toBeInTheDocument();
    expect(screen.queryByText(/Credits:/)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("credit_list", {}, undefined);
  });

  it("does not expose Credit counts on Image Catalog cards", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({ id: "image_credits", title: "Credited Catalog Image" }),
        ];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Credited Catalog Image")).toBeInTheDocument();
    expect(screen.queryByText(/Credits:/)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("credit_list", {}, undefined);
  });

  it("keeps Performer Catalog identity search isolated from character names", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_identity",
            name: "Identity Performer",
            originalName: "Original Identity",
            aliasesJson: '["Approved Alias"]',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Identity Performer")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Performers search"), {
      target: { value: "Unrelated Character Name" },
    });
    expect(screen.getByText("No matching items")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("credit_list", {}, undefined);
    expect(invoke).not.toHaveBeenCalledWith(
      "credit_list_by_performer",
      expect.anything(),
      undefined,
    );
  });

  it("filters collection cards with search", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({ id: "video_1", title: "Alpha Video" }),
          persistedVideo({ id: "video_2", title: "Beta Video" }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Alpha Video")).toBeInTheDocument();
    expect(screen.getByText("Beta Video")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "alpha" },
    });

    expect(screen.getByText("Alpha Video")).toBeInTheDocument();
    expect(screen.queryByText("Beta Video")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No matching items")).toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos",
      command: "video_list",
      searchLabel: "Videos search",
      searchValue: "VID-CODE-7788",
      matchingText: "Code Match Video",
      nonMatchingText: "Other Video",
      records: [
        persistedVideo({
          id: "video_code",
          title: "Code Match Video",
          code: "VID-CODE-7788",
        }),
        persistedVideo({
          id: "video_other",
          title: "Other Video",
          code: "VID-OTHER",
        }),
      ],
    },
    {
      path: "/images",
      command: "image_list",
      searchLabel: "Images search",
      searchValue: "IMG-CODE-7788",
      matchingText: "Code Match Image",
      nonMatchingText: "Other Image",
      records: [
        persistedImage({
          id: "image_code",
          title: "Code Match Image",
          code: "IMG-CODE-7788",
        }),
        persistedImage({
          id: "image_other",
          title: "Other Image",
          code: "IMG-OTHER",
        }),
      ],
    },
    {
      path: "/performers",
      command: "performer_list",
      searchLabel: "Performers search",
      searchValue: "Alias Needle",
      matchingText: "Alias Match Performer",
      nonMatchingText: "Other Performer",
      records: [
        persistedPerformer({
          id: "performer_alias",
          name: "Alias Match Performer",
          aliasesJson: '["Alias Needle"]',
        }),
        persistedPerformer({
          id: "performer_other",
          name: "Other Performer",
          aliasesJson: '["Other Alias"]',
        }),
      ],
    },
  ])(
    "catalog search matches required secondary fields at $path in card and table views",
    async ({ path, command, searchLabel, searchValue, matchingText, nonMatchingText, records }) => {
      window.history.pushState({}, "", path);
      const kind = path.slice(1);
      const title = kind === "videos" ? "Videos" : kind === "images" ? "Images" : "Performers";
      const invoke = vi.fn(async (incomingCommand: string) => {
        if (incomingCommand === command) {
          return records;
        }

        throw new Error(`Unexpected command ${incomingCommand}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };

      render(<App />);

      expect(await screen.findByText(matchingText)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(searchLabel), {
        target: { value: searchValue },
      });

      expect(screen.getByText(matchingText)).toBeInTheDocument();
      expect(screen.queryByText(nonMatchingText)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
      expect(screen.queryByText(`Search: ${searchValue}`)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();
      expect(screen.queryByTestId(`${kind}-active-filter-row`)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: `Clear ${title} search` }));
      expect(screen.getByLabelText(searchLabel)).toHaveValue("");
      expect(screen.getByText(matchingText)).toBeInTheDocument();
      expect(screen.getByText(nonMatchingText)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(searchLabel), {
        target: { value: searchValue },
      });

      fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText(matchingText)).toBeInTheDocument();
      expect(screen.queryByText(nonMatchingText)).not.toBeInTheDocument();
    },
  );

  it("sorts collection cards without mutating the loaded records", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Zulu Video",
            updatedAt: "1800000000000",
          }),
          persistedVideo({
            id: "video_2",
            title: "Alpha Video",
            updatedAt: "2026-05-11T00:00:00.000Z",
          }),
          persistedVideo({
            id: "video_3",
            title: "Beta Video",
            updatedAt: "2024",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Zulu Video")).toBeInTheDocument();
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Alpha Video", "Beta Video", "Zulu Video"]);

    selectCatalogSort("videos", "Title Z-A");

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Zulu Video", "Beta Video", "Alpha Video"]);

    selectCatalogSort("videos", "Last Updated");

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Zulu Video", "Alpha Video", "Beta Video"]);
  });

  it("filters Video Catalog by rating, year, and duration", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Long Rated Video",
            releaseDate: "2026-05-11",
            durationMinutes: 120,
            ratingJson: '{"rewatch":4,"performance":4}',
          }),
          persistedVideo({
            id: "video_2",
            title: "Short Low Video",
            releaseDate: "1999-05-11",
            durationMinutes: 10,
            ratingJson: '{"rewatch":2}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Long Rated Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Videos filters" }));

    fireEvent.change(panel.getByLabelText("videos Rating"), {
      target: { value: "4" },
    });
    fireEvent.change(panel.getByLabelText("Release Years"), {
      target: { value: "2026" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Duration: Long" }));

    expect(screen.getByText("Long Rated Video")).toBeInTheDocument();
    expect(screen.queryByText("Short Low Video")).not.toBeInTheDocument();
  });

  it("keeps chips visible while Video filter panel is open and clears active filters from the chip row", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Owned Reduced Studio Video",
            availability: "Owned",
            censorship: "Reduced / Reduced Mosaic",
            publisherLabel: "Studio Sakura",
            resolution: "3840x2160",
          }),
          persistedVideo({
            id: "video_2",
            title: "Missing Censored Other Video",
            availability: "Missing",
            censorship: "Censored",
            publisherLabel: "Other Studio",
            resolution: "640x480",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Owned Reduced Studio Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Videos filters" }));
    fireEvent.click(panel.getByRole("button", { name: "Availability: Owned" }));
    fireEvent.click(panel.getByRole("button", { name: "Censorship: Reduced" }));
    fireEvent.change(panel.getByLabelText("Publisher / Label"), {
      target: { value: "Studio Sakura" },
    });
    fireEvent.change(panel.getByLabelText("Quality"), {
      target: { value: "4K" },
    });

    expect(screen.getByRole("button", { name: "Filters 4" })).toBeInTheDocument();
    expect(screen.getByText("Availability: Owned")).toBeInTheDocument();
    expect(screen.getByText("Censorship: Reduced")).toBeInTheDocument();
    expect(screen.getByText("Publisher / Label: Studio Sakura")).toBeInTheDocument();
    expect(screen.getByText("Quality: 4K")).toBeInTheDocument();
    expect(screen.getByText("Owned Reduced Studio Video")).toBeInTheDocument();
    expect(screen.queryByText("Missing Censored Other Video")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.queryByText("Availability: Owned")).not.toBeInTheDocument();
    expect(screen.getByText("Owned Reduced Studio Video")).toBeInTheDocument();
    expect(screen.getByText("Missing Censored Other Video")).toBeInTheDocument();
  });

  it("filters Image Catalog by rating, year, and Image Count", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Some Rated Image",
            releaseDate: "2024-03-15",
            imageCount: 42,
            ratingJson: '{"visual":5}',
          }),
          persistedImage({
            id: "image_2",
            title: "Large Older Image",
            releaseDate: "1998-03-15",
            imageCount: 120,
            ratingJson: '{"visual":2}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Some Rated Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Images filters" }));

    expect(panel.getByText("Image Count")).toBeInTheDocument();
    expect(panel.queryByText("Duration")).not.toBeInTheDocument();
    fireEvent.change(panel.getByLabelText("images Rating"), {
      target: { value: "5" },
    });
    fireEvent.change(panel.getByLabelText("Release Years"), {
      target: { value: "2024" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Image Count: Some" }));

    expect(screen.getByText("Some Rated Image")).toBeInTheDocument();
    expect(screen.queryByText("Large Older Image")).not.toBeInTheDocument();
  });

  it("filters Image Catalog by availability, censorship, publisher, and quality", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Owned Reduced Studio Image",
            availability: "Owned",
            censorship: "Reduced / Reduced Mosaic",
            publisherLabel: "Studio Sakura",
            mainResolution: "3840x2160",
          }),
          persistedImage({
            id: "image_2",
            title: "Missing Censored Other Image",
            availability: "Missing",
            censorship: "Censored",
            publisherLabel: "Other Studio",
            mainResolution: "640x480",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Owned Reduced Studio Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Images filters" }));
    fireEvent.click(panel.getByRole("button", { name: "Availability: Owned" }));
    fireEvent.click(panel.getByRole("button", { name: "Censorship: Reduced" }));
    fireEvent.change(panel.getByLabelText("Publisher / Label"), {
      target: { value: "Studio Sakura" },
    });
    fireEvent.change(panel.getByLabelText("Quality"), {
      target: { value: "4K" },
    });

    expect(screen.getByRole("button", { name: "Filters 4" })).toBeInTheDocument();
    expect(screen.getByText("Owned Reduced Studio Image")).toBeInTheDocument();
    expect(screen.queryByText("Missing Censored Other Image")).not.toBeInTheDocument();
  });

  it("filters Performer Catalog by status, rating, filmography, and pictorial counts", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Active Rated Performer",
            status: "Retired",
            debutDate: "2020-01-02",
            retiredDate: "",
            filmographyCount: 0,
            pictorialsCount: 0,
            relatedVideosJson: relatedCatalogJson("video", 20),
            relatedImagesJson: relatedCatalogJson("image", 120),
            ratingJson: '{"visual":5}',
          }),
          persistedPerformer({
            id: "performer_2",
            name: "Retired Smaller Performer",
            status: "Active",
            debutDate: "",
            retiredDate: "2024-01-01",
            filmographyCount: 20,
            pictorialsCount: 120,
            relatedVideosJson: relatedCatalogJson("video", 5),
            relatedImagesJson: relatedCatalogJson("image", 10),
            ratingJson: '{"visual":2}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Active Rated Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    fireEvent.click(panel.getByRole("button", { name: "Availability: Active" }));
    fireEvent.change(panel.getByLabelText("performers Rating"), {
      target: { value: "5" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Filmography Count: Some" }));
    fireEvent.click(panel.getByRole("button", { name: "Pictorials Count: Many" }));

    expect(screen.getByText("Active Rated Performer")).toBeInTheDocument();
    expect(screen.queryByText("Retired Smaller Performer")).not.toBeInTheDocument();
  });

  it("filters Performer Catalog by age, height, nationality, debut year, and cup size while keeping taxonomy filters inactive by default", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Adult Japan Medium Performer",
            birthDate: "1998-01-20",
            nationality: "Japan",
            heightCm: 160,
            cupSize: "C",
            debutDate: "2020-01-01",
          }),
          persistedPerformer({
            id: "performer_2",
            name: "Senior Korea Tall Performer",
            birthDate: "1975-01-20",
            nationality: "Korea",
            heightCm: 170,
            cupSize: "D",
            debutDate: "2010-01-01",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Adult Japan Medium Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));
    expect(panel.queryByText("Deferred")).not.toBeInTheDocument();
    expect(panel.getByLabelText("Gender")).toBeDisabled();
    expect(panel.getByLabelText("Body Type")).toBeDisabled();
    fireEvent.click(panel.getByRole("button", { name: "Age: Adult" }));
    fireEvent.click(panel.getByRole("button", { name: "Body Height: Medium" }));
    fireEvent.change(panel.getByLabelText("Nationality"), {
      target: { value: "Japan" },
    });
    fireEvent.change(panel.getByLabelText("Debut Years"), {
      target: { value: "2020" },
    });
    fireEvent.change(panel.getByLabelText("Cup Size"), {
      target: { value: "C" },
    });

    expect(screen.getByRole("button", { name: "Filters 5" })).toBeInTheDocument();
    expect(screen.getByText("Age: Adult")).toBeInTheDocument();
    expect(screen.getByText("Body Height: Medium")).toBeInTheDocument();
    expect(screen.getByText("Nationality: Japan")).toBeInTheDocument();
    expect(screen.getByText("Debut Years: 2020")).toBeInTheDocument();
    expect(screen.getByText("Cup Size: C")).toBeInTheDocument();
    expect(screen.queryByText("Gender:")).not.toBeInTheDocument();
    expect(screen.queryByText("Body Type:")).not.toBeInTheDocument();
    expect(screen.getByText("Adult Japan Medium Performer")).toBeInTheDocument();
    expect(screen.queryByText("Senior Korea Tall Performer")).not.toBeInTheDocument();
  });

  it("slices collection cards by page size and navigates pages", async () => {
    window.history.pushState({}, "", "/videos");
    const videos = Array.from({ length: 33 }, (_, index) =>
      persistedVideo({
        id: `video_${index + 1}`,
        title: `Paged Video ${String(index + 1).padStart(2, "0")}`,
      }),
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return videos;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Paged Video 01")).toBeInTheDocument();
    expect(screen.queryByText("Paged Video 33")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Paged Video 33")).toBeInTheDocument();
    expect(screen.queryByText("Paged Video 01")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });

    expect(screen.getByText("Paged Video 01")).toBeInTheDocument();
    expect(screen.getByText("Paged Video 33")).toBeInTheDocument();
  });

  it("filters collection cards by category and restores all categories", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Classic Video",
            categoriesJson: '["Category A"]',
          }),
          persistedVideo({
            id: "video_2",
            title: "Modern Video",
            categoriesJson: '["Category B"]',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Classic Video")).toBeInTheDocument();
    expect(screen.getByText("Modern Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));

    expect(screen.getByText("Classic Video")).toBeInTheDocument();
    expect(screen.queryByText("Modern Video")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove category filter Category A" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove category filter Category A" }),
    );

    expect(screen.getByText("Classic Video")).toBeInTheDocument();
    expect(screen.getByText("Modern Video")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByText("Classic Video")).toBeInTheDocument();
    expect(screen.getByText("Modern Video")).toBeInTheDocument();
  });

  it("combines category filter with search and sort", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Zulu Archive",
            categoriesJson: '["Category A"]',
          }),
          persistedVideo({
            id: "video_2",
            title: "Alpha Archive",
            categoriesJson: '["Category A"]',
          }),
          persistedVideo({
            id: "video_3",
            title: "Beta Clip",
            categoriesJson: '["Category B"]',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Zulu Archive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));

    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "archive" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    selectCatalogSort("videos", "Title A-Z");

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Alpha Archive", "Zulu Archive"]);
    expect(screen.queryByText("Beta Clip")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));

    expect(screen.getByText("No matching items")).toBeInTheDocument();
  });

  it("clears catalog search, category filters, data filters, sort, and page size", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Alpha Archive",
            categoriesJson: '["Category A"]',
            durationMinutes: 120,
            ratingJson: '{"rewatch":4}',
          }),
          persistedVideo({
            id: "video_2",
            title: "Beta Clip",
            categoriesJson: '["Category B"]',
            durationMinutes: 10,
            ratingJson: '{"rewatch":2}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Alpha Archive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Videos filters" }));
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "alpha" },
    });
    fireEvent.change(panel.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Duration: Long" }));
    selectCatalogSort("videos", "Title A-Z");
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });

    expect(screen.getByLabelText("Videos search")).toHaveValue("alpha");
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("64");
    expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));
    expect(screen.queryByText("Search: alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Category: Category A")).toBeInTheDocument();
    expect(screen.getByText("Duration: Long")).toBeInTheDocument();
    expect(screen.getByText("Alpha Archive")).toBeInTheDocument();
    expect(screen.queryByText("Beta Clip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Duration filter" }));

    expect(screen.getByRole("button", { name: "Filters 1" })).toBeInTheDocument();
    expect(screen.queryByText("Search: alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Category: Category A")).toBeInTheDocument();
    expect(screen.queryByText("Duration: Long")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Duration: Long" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByLabelText("Videos search")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Remove category filter Category A" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Search: alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Category: Category A")).not.toBeInTheDocument();
    expect(screen.queryByText("Duration: Long")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear all filters" }),
    ).not.toBeInTheDocument();
    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
    expect(screen.getByText("Alpha Archive")).toBeInTheDocument();
    expect(screen.getByText("Beta Clip")).toBeInTheDocument();
  });

  it("resets advanced panel filters, sort, and page size", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Alpha Gallery",
            categoriesJson: '["Category A"]',
            imageCount: 42,
            ratingJson: '{"visual":5}',
          }),
          persistedImage({
            id: "image_2",
            title: "Beta Gallery",
            categoriesJson: '["Category B"]',
            imageCount: 120,
            ratingJson: '{"visual":2}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Alpha Gallery")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    const panel = within(screen.getByRole("region", { name: "Images filters" }));
    fireEvent.change(screen.getByLabelText("Images search"), {
      target: { value: "alpha" },
    });
    fireEvent.change(panel.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.click(panel.getByRole("button", { name: "Image Count: Some" }));
    selectCatalogSort("images", "Title A-Z");
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });

    expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));
    expect(screen.queryByText("Search: alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Category: Category A")).toBeInTheDocument();
    expect(screen.getByText("Image Count: Some")).toBeInTheDocument();
    expect(screen.queryByText("Beta Gallery")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByRole("button", { name: "Filters 0" })).toBeInTheDocument();
    expect(screen.queryByText("No filters selected")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear all filters" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Search: alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Category: Category A")).not.toBeInTheDocument();
    expect(screen.queryByText("Image Count: Some")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Images search")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    expect(
      screen.getByRole("button", { name: "Image Count: Some" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(catalogSortControl("images")).toHaveTextContent("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("32");
    expect(screen.getByText("Alpha Gallery")).toBeInTheDocument();
    expect(screen.getByText("Beta Gallery")).toBeInTheDocument();
  });

  it("applies category multi-filter with AND behavior and caps active filters", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Two Category Video",
            categoriesJson: '["Category A", "Category B"]',
          }),
          persistedVideo({
            id: "video_2",
            title: "Single Category Video",
            categoriesJson: '["Category A"]',
          }),
          persistedVideo({
            id: "video_3",
            title: "Five Category Video",
            categoriesJson:
              '["Category A", "Category B", "Category C", "Category D", "Category E"]',
          }),
          persistedVideo({
            id: "video_4",
            title: "Sixth Category Video",
            categoriesJson: '["Category F"]',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Two Category Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category B" },
    });

    expect(screen.getByText("Two Category Video")).toBeInTheDocument();
    expect(screen.getByText("Five Category Video")).toBeInTheDocument();
    expect(screen.queryByText("Single Category Video")).not.toBeInTheDocument();
    expect(screen.queryByText("Sixth Category Video")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 2" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Remove category filter Category A" }),
    );

    expect(screen.queryByText("Category: Category A")).not.toBeInTheDocument();
    expect(screen.getByText("Category: Category B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });

    for (const category of ["Category C", "Category D", "Category E"]) {
      fireEvent.change(screen.getByLabelText("Category"), {
        target: { value: category },
      });
    }

    expect(screen.getByText("Five Category Video")).toBeInTheDocument();
    expect(screen.queryByText("Two Category Video")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeDisabled();
  });

  it("applies pagination after category filter and resets to page one", async () => {
    window.history.pushState({}, "", "/videos");
    const categoryAVideos = Array.from({ length: 33 }, (_, index) =>
      persistedVideo({
        id: `video_a_${index + 1}`,
        title: `Category A Video ${String(index + 1).padStart(2, "0")}`,
        categoriesJson: '["Category A"]',
      }),
    );
    const videos = [
      ...categoryAVideos,
      persistedVideo({
        id: "video_b_1",
        title: "Category B Video 01",
        categoriesJson: '["Category B"]',
      }),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return videos;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Category A Video 01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Category A Video 33")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category B" },
    });

    expect(screen.getByText("Category B Video 01")).toBeInTheDocument();
    expect(screen.queryByText("Category A Video 33")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("switches Video Catalog cards to the aligned table view", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Table Video With A Very Long Title For Truncation",
            originalTitle: "Original Table Video",
            code: "",
            categoriesJson: '["Category A","Category B","Category C"]',
            coverPath: "",
            durationMinutes: 84,
            quality: "",
            releaseDate: "",
            ratingJson: "{}",
            censorship: "Unknow",
            availability: "Missing",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByLabelText("Cover Placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Videos catalog toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("videos-toolbar-search-region")).toHaveClass("flex-1");
    expect(screen.getByRole("button", { name: "Filters 0" })).toHaveClass("shrink-0", "sm:w-auto");
    expect(catalogSortControl("videos")).toHaveClass("sm:w-44");
    expect(screen.getByRole("button", { name: "Switch to list view" }))
      .toHaveClass("shrink-0", "sm:w-auto");

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));

    const table = screen.getByTestId("videos-catalog-table");
    expect(table).toHaveClass("min-w-[1480px]", "table-fixed");
    const videoTableWidth = catalogTableInlineWidth("videos");
    expect(videoTableWidth).toEqual({ minWidth: "1696px", width: "1696px" });
    const videoColumnWidths = catalogColumnWidths("videos");
    expect(videoColumnWidths).toEqual([
      { id: "availability", width: "144px" },
      { id: "thumbnail", width: "112px" },
      { id: "favorite", width: "64px" },
      { id: "title", width: "224px" },
      { id: "originalTitle", width: "224px" },
      { id: "code", width: "128px" },
      { id: "categories", width: "240px" },
      { id: "year", width: "96px" },
      { id: "duration", width: "112px" },
      { id: "quality", width: "112px" },
      { id: "censorship", width: "128px" },
      { id: "rating", width: "112px" },
    ]);
    const tableScroll = screen.getByTestId("videos-catalog-table-scroll");
    expect(tableScroll).toHaveClass("sticky-horizontal-scroll-body", "overflow-x-auto");
    expect(tableScroll.closest("[data-sticky-horizontal-scroll='true']"))
      .toHaveClass("sticky-horizontal-scroll-frame");
    expect(tableScroll.className).not.toContain("px-");
    expect(tableScroll.className).not.toContain("mx-");
    expect(table.className).not.toContain("sakura");
    expect(
      within(table).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "AVAILABILITY",
      "THUMBNAIL",
      "FAVORITE",
      "TITLE",
      "ORIGINAL TITLE",
      "CODE",
      "CATEGORIES",
      "RELEASE",
      "DURATION",
      "QUALITY",
      "CENSORSHIP",
      "RATING",
    ]);
    expect(within(table).getByText("THUMBNAIL")).toHaveClass("sr-only");
    expect(within(table).getByText("FAVORITE")).toHaveClass("sr-only");
    expect(within(table).queryByRole("columnheader", { name: "Thumbnail" }))
      .not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Favorite" }))
      .not.toBeInTheDocument();
    expect(within(table).queryByText("MISSING")).not.toBeInTheDocument();
    expect(within(table).getByText("Missing").closest("[data-testid='catalog-table-status-chip']"))
      .toHaveClass("inline-flex", "w-fit");
    expect(within(table).getByLabelText("Cover Placeholder"))
      .toHaveAttribute("data-thumbnail-shape", "16:9");
    expect(within(table).getByLabelText("Cover Placeholder")).not.toHaveTextContent("N/A");
    expect(within(table).getByText("Table Video With A Very Long Title For Truncation"))
      .toHaveClass("truncate");
    expect(within(table).getByText("Table Video With A Very Long Title For Truncation"))
      .toHaveAttribute("title", "Table Video With A Very Long Title For Truncation");
    expect(within(table).getByText("Original Table Video")).toHaveAttribute("title", "Original Table Video");
    expect(within(table).getByText("1h 24m")).toBeInTheDocument();
    expect(within(table).getByText("Unknown")).toBeInTheDocument();
    expect(within(table).queryByText("Unknow")).not.toBeInTheDocument();
    expect(within(table).getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    expect(within(table).getByTestId("catalog-table-category-chips"))
      .toHaveAttribute("title", "Category A, Category B, Category C");
    expect(within(table).getByLabelText("1 more categories")).toHaveTextContent("+1");
    expect(within(table).queryByText(/categoriesJson/)).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "Sort by Rating" }));
    expect(catalogTableInlineWidth("videos")).toEqual(videoTableWidth);
    expect(catalogColumnWidths("videos")).toEqual(videoColumnWidths);
    expect(within(table).getByRole("button", { name: "Sort by Rating" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Favorites" }));
    expect(window.location.pathname).toBe("/videos");
    expect(invoke).toHaveBeenCalledWith(
      "video_update",
      { id: "video_1", patch: { favorite: false } },
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to grid view" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cover Placeholder")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(within(screen.getByTestId("videos-catalog-table")).getByRole("row", {
      name: "Open Table Video With A Very Long Title For Truncation",
    }));
    expect(window.location.pathname).toBe("/videos/video_1");
  }, 10000);

  it("keeps search, category filter, sort, and pagination active in table view", async () => {
    window.history.pushState({}, "", "/videos");
    const videos = [
      persistedVideo({
        id: "video_1",
        title: "Zulu Archive 01",
        categoriesJson: '["Category A"]',
      }),
      persistedVideo({
        id: "video_2",
        title: "Alpha Archive 02",
        categoriesJson: '["Category A"]',
      }),
      persistedVideo({
        id: "video_3",
        title: "Beta Clip 03",
        categoriesJson: '["Category B"]',
      }),
      ...Array.from({ length: 33 }, (_, index) =>
        persistedVideo({
          id: `video_extra_${index + 1}`,
          title: `Extra Archive ${String(index + 4).padStart(2, "0")}`,
          categoriesJson: '["Category A"]',
        }),
      ),
    ];
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return videos;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Alpha Archive 02")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "archive" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    selectCatalogSort("videos", "Title A-Z");

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha Archive 02");
    expect(screen.queryByText("Beta Clip 03")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Alpha Archive 02")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("renders Image and Performer Catalog table-specific columns and formatting", async () => {
    window.history.pushState({}, "", "/images");
    const imageInvoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Table Image",
            code: "IMG-TABLE",
            imageCount: 1240,
            categoriesJson: '["Portrait","Studio","Outdoor"]',
            coverPath: "",
            quality: "",
            censorship: "Leaked",
            ratingJson: "{}",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke: imageInvoke,
    };

    const imageRender = render(<App />);

    expect(await screen.findByText("Table Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    const imageTable = screen.getByTestId("images-catalog-table");
    const imageTableWidth = catalogTableInlineWidth("images");
    expect(imageTableWidth).toEqual({ minWidth: "1728px", width: "1728px" });
    const imageColumnWidths = catalogColumnWidths("images");
    expect(imageColumnWidths).toEqual([
      { id: "availability", width: "144px" },
      { id: "thumbnail", width: "112px" },
      { id: "favorite", width: "64px" },
      { id: "title", width: "224px" },
      { id: "originalTitle", width: "224px" },
      { id: "code", width: "128px" },
      { id: "categories", width: "240px" },
      { id: "year", width: "96px" },
      { id: "imageCount", width: "144px" },
      { id: "quality", width: "112px" },
      { id: "censorship", width: "128px" },
      { id: "rating", width: "112px" },
    ]);
    expect(
      within(imageTable).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "AVAILABILITY",
      "THUMBNAIL",
      "FAVORITE",
      "TITLE",
      "ORIGINAL TITLE",
      "CODE",
      "CATEGORIES",
      "RELEASE",
      "TOTAL PICS",
      "QUALITY",
      "CENSORSHIP",
      "RATING",
    ]);
    expect(within(imageTable).getByText("THUMBNAIL")).toHaveClass("sr-only");
    expect(within(imageTable).getByLabelText("Image Placeholder"))
      .toHaveAttribute("data-thumbnail-shape", "16:9");
    expect(within(imageTable).getByText(/1[,.]240 pics/)).toBeInTheDocument();
    expect(within(imageTable).getByText("Leaked").closest("[data-testid='catalog-table-status-chip']"))
      .toHaveClass("inline-flex", "w-fit");
    expect(within(imageTable).getByLabelText("1 more categories")).toHaveTextContent("+1");
    expect(within(imageTable).getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
    expect(within(imageTable).getByText("-")).toBeInTheDocument();
    expect(within(imageTable).getByText("IMG-TABLE")).toHaveAttribute("title", "IMG-TABLE");
    fireEvent.click(within(imageTable).getByRole("button", { name: "Sort by Rating" }));
    expect(catalogTableInlineWidth("images")).toEqual(imageTableWidth);
    expect(catalogColumnWidths("images")).toEqual(imageColumnWidths);
    expect(within(imageTable).getByRole("button", { name: "Sort by Rating" })).toBeInTheDocument();
    imageRender.unmount();

    window.history.pushState({}, "", "/performers");
    const performerInvoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Table Performer",
            status: "Unknow",
            filmographyCount: 0,
            pictorialsCount: 120,
            relatedImagesJson: relatedCatalogJson("image", 120),
            categoriesJson: '["Classic","Body Type: Athletic","Featured"]',
            coverPath: "",
            debutDate: "",
            ratingJson: "{}",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke: performerInvoke,
    };

    render(<App />);

    expect(await screen.findByText("Table Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    const performerTable = screen.getByTestId("performers-catalog-table");
    const performerTableWidth = catalogTableInlineWidth("performers");
    expect(performerTableWidth).toEqual({ minWidth: "1488px", width: "1488px" });
    const performerColumnWidths = catalogColumnWidths("performers");
    expect(performerColumnWidths).toEqual([
      { id: "status", width: "128px" },
      { id: "thumbnail", width: "96px" },
      { id: "favorite", width: "64px" },
      { id: "name", width: "224px" },
      { id: "originalName", width: "224px" },
      { id: "categories", width: "240px" },
      { id: "debutYear", width: "128px" },
      { id: "filmography", width: "144px" },
      { id: "pictorials", width: "128px" },
      { id: "rating", width: "112px" },
    ]);
    expect(
      within(performerTable).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "AVAILABILITY",
      "THUMBNAIL",
      "FAVORITE",
      "NAME",
      "ORIGINAL NAME",
      "CATEGORIES",
      "DEBUT",
      "FILMOGRAPHY",
      "PICTORIALS",
      "RATING",
    ]);
    expect(performerTable).toHaveClass("min-w-[1200px]");
    expect(within(performerTable).getByLabelText("Profile Placeholder"))
      .toHaveAttribute("data-thumbnail-shape", "portrait");
    expect(within(performerTable).getByText("Unknown")).toBeInTheDocument();
    expect(within(performerTable).queryByText("Unknow")).not.toBeInTheDocument();
    expect(within(performerTable).getByText("120 sets")).toBeInTheDocument();
    expect(within(performerTable).getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
    expect(within(performerTable).getByText("-")).toBeInTheDocument();
    expect(within(performerTable).getByLabelText("1 more categories")).toHaveTextContent("+1");
    fireEvent.click(within(performerTable).getByRole("button", { name: "Sort by Rating" }));
    expect(catalogTableInlineWidth("performers")).toEqual(performerTableWidth);
    expect(catalogColumnWidths("performers")).toEqual(performerColumnWidths);
    expect(within(performerTable).getByRole("button", { name: "Sort by Rating" })).toBeInTheDocument();
  });

  it("sorts the Video Catalog table from a sortable header without clearing filters or page size", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Short Archive",
            categoriesJson: '["Category A"]',
            durationMinutes: 10,
          }),
          persistedVideo({
            id: "video_2",
            title: "Long Archive",
            categoriesJson: '["Category A"]',
            durationMinutes: 120,
          }),
          persistedVideo({
            id: "video_3",
            title: "Other Clip",
            categoriesJson: '["Category B"]',
            durationMinutes: 300,
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Short Archive")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "64" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters 0" }));
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "archive" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Category A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters 1" }));

    fireEvent.click(screen.getByRole("button", { name: "Sort by Duration" }));

    expect(catalogSortControl("videos")).toHaveTextContent("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("64");
    expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Short Archive");
    expect(
      screen.getByRole("button", { name: "Sort by Duration" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("button", { name: "Sort by Duration" }))
      .toHaveClass("text-sakura-800");
    expect(screen.getByRole("button", { name: "Sort by Duration" }).className)
      .not.toContain("rounded");
    expect(screen.getByRole("button", { name: "Sort by Duration" }).className)
      .not.toContain("bg-");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Duration" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Long Archive");
    expect(
      screen.getByRole("button", { name: "Sort by Duration" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");
    expect(screen.queryByText("Other Clip")).not.toBeInTheDocument();
    expect(screen.queryByText("Search: archive")).not.toBeInTheDocument();
    expect(screen.getByText("Category: Category A")).toBeInTheDocument();
  });

  it("sorts the Image Catalog table from a sortable header", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Small Image Set",
            imageCount: 24,
          }),
          persistedImage({
            id: "image_2",
            title: "Large Image Set",
            imageCount: 140,
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Small Image Set")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Image Count" }));

    expect(catalogSortControl("images")).toHaveTextContent("Title A-Z");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Small Image Set");
    expect(
      screen.getByRole("button", { name: "Sort by Image Count" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Image Count" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Large Image Set");
    expect(
      screen.getByRole("button", { name: "Sort by Image Count" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the Performer Catalog table from a sortable header", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Small Performer",
            relatedVideosJson: relatedCatalogJson("video", 4),
          }),
          persistedPerformer({
            id: "performer_2",
            name: "Large Performer",
            relatedVideosJson: relatedCatalogJson("video", 40),
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Small Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Filmography" }));

    expect(catalogSortControl("performers")).toHaveTextContent("Name A-Z");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Small Performer");
    expect(
      screen.getByRole("button", { name: "Sort by Filmography" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Filmography" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Large Performer");
    expect(
      screen.getByRole("button", { name: "Sort by Filmography" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it.each([
    {
      path: "/videos",
      title: "Covered Video",
      placeholder: "Cover Placeholder",
      command: "video_list",
      record: persistedVideo({
        title: "Covered Video",
        coverPath: "D:/Sakurava/video-cover.jpg",
      }),
    },
    {
      path: "/images",
      title: "Covered Image",
      placeholder: "Image Placeholder",
      command: "image_list",
      record: persistedImage({
        title: "Covered Image",
        coverPath: "D:/Sakurava/image-cover.jpg",
      }),
    },
    {
      path: "/performers",
      title: "Covered Performer",
      placeholder: "Profile Placeholder",
      command: "performer_list",
      record: persistedPerformer({
        name: "Covered Performer",
        coverPath: "D:/Sakurava/performer-cover.jpg",
      }),
    },
  ])(
    "renders runtime collection cover image for $path when conversion is available",
    async ({ path, title, placeholder, command, record }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (incomingCommand: string) => {
        if (incomingCommand === command) {
          return [record];
        }

        throw new Error(`Unexpected command ${incomingCommand}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
        convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      };

      render(<App />);

      const image = await screen.findByAltText(`${title} cover`);
      expect(image).toHaveAttribute("src", `asset://localhost/${record.coverPath}`);
      expect(screen.queryByLabelText(placeholder)).not.toBeInTheDocument();
    },
  );

  it("waits for stored media roots before rendering collection cover images", async () => {
    window.history.pushState({}, "", "/videos");
    window.localStorage.setItem(
      "sakurava.mediaAssetRoots.v1",
      JSON.stringify(["D:/Sakurava"]),
    );
    const record = persistedVideo({
      title: "Restart Cover Video",
      coverPath: "D:/Sakurava/video-cover.jpg",
    });
    let resolveMediaRoot!: (value: { rootPath: string; success: boolean }) => void;
    const mediaRootPromise = new Promise<{ rootPath: string; success: boolean }>(
      (resolve) => {
        resolveMediaRoot = resolve;
      },
    );
    const invoke = vi.fn(async (incomingCommand: string) => {
      if (incomingCommand === "media_asset_allow_root") {
        return mediaRootPromise;
      }
      if (incomingCommand === "video_list") {
        return [record];
      }

      throw new Error(`Unexpected command ${incomingCommand}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Restart Cover Video")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Restart Cover Video cover"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cover Placeholder")).toBeInTheDocument();

    resolveMediaRoot({ rootPath: "D:\\Sakurava", success: true });

    const image = await screen.findByAltText("Restart Cover Video cover");
    expect(image).toHaveAttribute("src", `asset://localhost/${record.coverPath}`);
    expect(screen.queryByLabelText("Cover Placeholder")).not.toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/video_test_001",
      alt: "Covered Video Detail cover",
      command: "video_get",
      record: persistedVideo({
        title: "Covered Video Detail",
        coverPath: "D:/Sakurava/video-detail-cover.jpg",
      }),
    },
    {
      path: "/images/image_test_001",
      alt: "Covered Image Detail cover",
      command: "image_get",
      record: persistedImage({
        title: "Covered Image Detail",
        coverPath: "D:/Sakurava/image-detail-cover.jpg",
      }),
    },
    {
      path: "/performers/performer_test_001",
      alt: "Covered Performer Detail profile image",
      command: "performer_get",
      record: persistedPerformer({
        name: "Covered Performer Detail",
        coverPath: "D:/Sakurava/performer-detail-cover.jpg",
      }),
    },
  ])(
    "renders runtime detail cover image for $path when conversion is available",
    async ({ path, alt, command, record }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(
        async (incomingCommand: string, args: Record<string, any>) => {
          if (incomingCommand === command) {
            expect(args.id).toBe(path.split("/").pop());
            return record;
          }

          throw new Error(`Unexpected command ${incomingCommand}`);
        },
      ) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
        convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      };

      render(<App />);

      const image = await screen.findByAltText(alt);
      expect(image).toHaveAttribute("src", `asset://localhost/${record.coverPath}`);
    },
  );

  it.each([
    {
      path: "/videos/video_test_001",
      buttonName: "Preview Video Cover",
      dialogName: "Video Cover",
      command: "video_get",
      record: persistedVideo({
        title: "Preview Video Detail",
        coverPath: "D:/Sakurava/video-preview-cover.jpg",
      }),
    },
    {
      path: "/images/image_test_001",
      buttonName: "Preview Image Cover",
      dialogName: "Image Cover",
      command: "image_get",
      record: persistedImage({
        title: "Preview Image Detail",
        coverPath: "D:/Sakurava/image-preview-cover.jpg",
      }),
    },
    {
      path: "/performers/performer_test_001",
      buttonName: "Preview Performer Cover",
      dialogName: "Performer Cover",
      command: "performer_get",
      record: persistedPerformer({
        name: "Preview Performer Detail",
        coverPath: "D:/Sakurava/performer-preview-cover.jpg",
      }),
    },
  ])(
    "opens and closes full-size cover preview for $path",
    async ({ path, buttonName, dialogName, command, record }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(
        async (incomingCommand: string, args: Record<string, any> = {}) => {
          if (incomingCommand === command) {
            expect(args.id).toBe(path.split("/").pop());
            return record;
          }
          if (
            incomingCommand === "path_status_check" ||
            incomingCommand === "performer_list" ||
            incomingCommand === "image_list" ||
            incomingCommand === "video_list"
          ) {
            if (incomingCommand === "path_status_check") {
              return {
                path: args.path,
                status: "exists",
                kind: "file",
                message: "Path exists",
              };
            }

            return [];
          }

          throw new Error(`Unexpected command ${incomingCommand}`);
        },
      ) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
        convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      };

      render(<App />);

      const previewButton = await screen.findByRole("button", {
        name: buttonName,
      });
      fireEvent.click(previewButton);

      const dialog = await screen.findByRole(
        "dialog",
        { name: dialogName },
        // The mocked multi-window probe rejects before the in-app viewer
        // fallback renders. Under the full 452-test run that transition can
        // exceed the default wait without changing the asserted behavior.
        { timeout: 10000 },
      );
      expect(within(dialog).getByLabelText("Image metadata")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Image viewer actions")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Image viewer controls")).toBeInTheDocument();
      const previewImage = within(dialog).getByAltText("Gallery image 1 full size");
      expect(previewImage).toHaveAttribute(
        "src",
        `asset://localhost/${record.coverPath}`,
      );
      expect(
        within(dialog).queryByRole("button", { name: "Next gallery image" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Previous gallery image" }),
      ).not.toBeInTheDocument();

      expect(
        within(dialog).queryByRole("button", { name: "Close gallery viewer" }),
      ).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: dialogName }),
        ).not.toBeInTheDocument();
      });

      fireEvent.click(previewButton);
      const reopenedDialog = await screen.findByRole(
        "dialog",
        { name: dialogName },
        { timeout: 5000 },
      );
      expect(reopenedDialog).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: dialogName }),
        ).not.toBeInTheDocument();
      });
    },
    10000,
  );

  it("opens Detail cover viewer once for a rapid double click", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "image_get") {
          expect(args.id).toBe("image_test_001");
          return persistedImage({
            title: "Single Viewer Detail",
            coverPath: "D:/Sakurava/image-preview-cover.jpg",
          });
        }
        if (command === "performer_list" || command === "video_list") {
          return [];
        }
        if (command === "path_status_check") {
          return {
            path: args.path,
            status: "exists",
            kind: "file",
            message: "Path exists",
          };
        }
        if (command === "plugin:app|supports_multiple_windows") {
          return false;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    const previewButton = await screen.findByRole("button", {
      name: "Preview Image Cover",
    });
    fireEvent.click(previewButton);
    fireEvent.click(previewButton);

    expect(await screen.findByRole("dialog", { name: "Image Cover" }))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.filter(
          ([command]) => command === "plugin:app|supports_multiple_windows",
        ),
      ).toHaveLength(1);
    });
  });

  it("keeps detail placeholder non-interactive when no safe image source exists", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Placeholder Preview Video",
          coverPath: "D:/Sakurava/unavailable-cover.jpg",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Placeholder Preview Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Cover")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview Video Cover" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Video Cover" })).not.toBeInTheDocument();
  });

  it("uses the shared app placeholder style for detail thumbnails", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Styled Placeholder Video",
          coverPath: "",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Styled Placeholder Video")).toBeInTheDocument();
    const placeholder = screen.getByTestId("detail-thumbnail-placeholder");
    expect(placeholder).toHaveAttribute("aria-label", "Cover");
    expect(placeholder).toHaveClass("from-slate-50");
    expect(placeholder).toHaveClass("to-sakura-50");
    expect(placeholder.querySelector(".text-sakura-200")).not.toBeNull();
  });

  it("clamps long detail titles and expands them with an icon-only chevron control", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const longTitle =
      "A very long saved video title that should stay readable inside the detail hero without pushing the shell sideways";
    const longOriginalTitle =
      "An equally long original title that follows the same two line clamp behavior until the user expands it";
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: longTitle,
          originalTitle: longOriginalTitle,
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const title = await screen.findByRole("heading", { name: longTitle });
    const originalTitle = screen.getByText(longOriginalTitle);
    expect(title).toHaveClass("line-clamp-2");
    expect(originalTitle).toHaveClass("line-clamp-2");

    const expandControl = screen.getByRole("button", { name: "Expand full title" });
    expect(expandControl).toHaveAccessibleName("Expand full title");
    expect(expandControl).toHaveClass("size-7");
    expect(expandControl.querySelector("svg")).not.toBeNull();
    expect(expandControl).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "Show full title" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Show full title")).not.toBeInTheDocument();

    fireEvent.click(expandControl);

    expect(title).not.toHaveClass("line-clamp-2");
    expect(originalTitle).not.toHaveClass("line-clamp-2");
    const collapseControl = screen.getByRole("button", { name: "Collapse title" });
    expect(collapseControl.querySelector("svg")).not.toBeNull();
    expect(collapseControl).toHaveTextContent("");
    expect(collapseControl)
      .toHaveAttribute("aria-expanded", "true");
  });

  it("renders Performer Detail Body Type from taxonomy categories while Gender remains direct-field only", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_get") {
        return persistedPerformer({
          name: "Taxonomy Detail Performer",
          gender: "Non-binary",
          categoriesJson: '["Woman","Athletic","Classic"]',
        });
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Taxonomy Detail Performer"))
      .toBeInTheDocument();
    const personal = screen
      .getByRole("heading", { name: "Personal" })
      .closest("section") as HTMLElement;
    const physical = screen
      .getByRole("heading", { name: "Physical" })
      .closest("section") as HTMLElement;
    expect(screen.queryByRole("heading", { name: "Profile Metadata" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Metadata" }))
      .not.toBeInTheDocument();
    expect(within(personal).getByText("Gender")).toBeInTheDocument();
    expect(within(personal).getByText("Non-binary")).toBeInTheDocument();
    expect(within(personal).queryByText("Woman")).not.toBeInTheDocument();
    expect(within(personal).queryByText("Body Type")).not.toBeInTheDocument();
    expectPrecedes(personal, "Gender", "Birth Date");
    expectPrecedes(personal, "Birth Date", "Birthplace");
    expectPrecedes(personal, "Debut Date", "Retired Date");
    expect(within(physical).getByText("Body Type")).toBeInTheDocument();
    expect(within(physical).getByText("Athletic")).toBeInTheDocument();
    expectPrecedes(physical, "Body Type", "Height");
    expectPrecedes(physical, "Height", "Weight");
    expectPrecedes(physical, "Weight", "Measurement");
    expectPrecedes(physical, "Measurement", "Cup Size");
    expect(within(physical).getByText("Blood Type")).toBeInTheDocument();
    expectPrecedes(physical, "Cup Size", "Blood Type");
  });

  it("renders Performer Detail Gender and Body Type as N/A when missing", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_get") {
        return persistedPerformer({
          name: "No Deferred Fields Performer",
        });
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("No Deferred Fields Performer"))
      .toBeInTheDocument();
    const personal = screen
      .getByRole("heading", { name: "Personal" })
      .closest("section") as HTMLElement;
    const physical = screen
      .getByRole("heading", { name: "Physical" })
      .closest("section") as HTMLElement;
    expect(screen.queryByRole("heading", { name: "Profile Metadata" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Metadata" }))
      .not.toBeInTheDocument();
    expect(within(personal).getByText("Gender")).toBeInTheDocument();
    expect(within(personal).queryByText("Body Type")).not.toBeInTheDocument();
    expect(within(personal).getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
    expect(within(physical).getByText("Body Type")).toBeInTheDocument();
    expect(within(physical).getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Source Links")).toBeInTheDocument();
  });

  it("does not render Gender or Body Type metadata on Video and Image Detail", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const videoInvoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({ title: "No Taxonomy Video" });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: "",
          status: "notSet",
          kind: "unknown",
          message: "Path is not set",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke: videoInvoke };

    const { unmount } = render(<App />);
    expect(await screen.findByText("No Taxonomy Video")).toBeInTheDocument();
    const videoMetadata = screen
      .getByRole("heading", { name: "Metadata" })
      .closest("section") as HTMLElement;
    expect(within(videoMetadata).queryByText("Gender")).not.toBeInTheDocument();
    expect(within(videoMetadata).queryByText("Body Type")).not.toBeInTheDocument();

    unmount();
    window.history.pushState({}, "", "/images/image_test_001");
    const imageInvoke = vi.fn(async (command: string) => {
      if (command === "image_get") {
        return persistedImage({ title: "No Taxonomy Image" });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: "",
          status: "notSet",
          kind: "unknown",
          message: "Path is not set",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke: imageInvoke };

    render(<App />);
    expect(await screen.findByText("No Taxonomy Image")).toBeInTheDocument();
    const imageMetadata = screen
      .getByRole("heading", { name: "Metadata" })
      .closest("section") as HTMLElement;
    expect(within(imageMetadata).queryByText("Gender")).not.toBeInTheDocument();
    expect(within(imageMetadata).queryByText("Body Type")).not.toBeInTheDocument();
  });

  it.each([
    [
      "/videos/video_test_001",
      "video_get",
      persistedVideo({
        title: "Source Video",
        sourceLinksJson:
          '[{"title":"Studio source","url":"https://example.invalid/video/source"}]',
      }),
    ],
    [
      "/images/image_test_001",
      "image_get",
      persistedImage({
        title: "Source Image",
        sourceLinksJson:
          '[{"title":"Image source","url":"https://example.invalid/image/source"}]',
      }),
    ],
    [
      "/performers/performer_test_001",
      "performer_get",
      persistedPerformer({
        name: "Source Performer",
        sourceLinksJson:
          '[{"title":"Performer source","url":"https://example.invalid/performer/source"}]',
      }),
    ],
  ])("renders safe Source Links on Detail for %s", async (path, getCommand, record) => {
    window.history.pushState({}, "", path);
    const invoke = vi.fn(async (command: string) => {
      if (command === getCommand) {
        return record;
      }
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "video_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: "",
          status: "notSet",
          kind: "unknown",
          message: "Path is not set",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText(/Source (Video|Image|Performer)/))
      .toBeInTheDocument();
    const sourceSection = screen
      .getByRole("heading", { name: "Source Links" })
      .closest("section") as HTMLElement;
    const sourceIcon = sourceSection
      .querySelector("[data-testid='detail-section-icon'] svg");
    expect(sourceIcon).not.toBeNull();
    expect(sourceIcon).toHaveClass("lucide-earth");
    expect(sourceSection.querySelector("svg.lucide-info")).toBeNull();
    expect(within(sourceSection).queryByText("Source Title")).not.toBeInTheDocument();
    expect(within(sourceSection).queryByText("Source URL")).not.toBeInTheDocument();
    expect(within(sourceSection).getByText(/^(Studio|Image|Performer) source$/))
      .toBeInTheDocument();
    expect(within(sourceSection).getByText(/^https:\/\/example\.invalid\//))
      .toHaveClass("truncate");
    const openAction = within(sourceSection).getByRole("button", {
      name: /Open Source Link/,
    });
    expect(openAction).toBeEnabled();
    fireEvent.click(openAction);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("open_source_link", {
        url: expect.stringMatching(/^https:\/\/example\.invalid\//),
      }, undefined);
    });
    expect(within(sourceSection).queryByText(/sourceLinksJson/))
      .not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      expect.stringMatching(/create|update|delete/i),
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    ["javascript:alert(1)", "Script source"],
    ["data:text/plain,source", "Data source"],
    ["file:///D:/source.txt", "File source"],
    ["https://", "Malformed source"],
  ])("blocks unsafe Detail Source Link URL %s", async (sourceUrl, sourceTitle) => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Unsafe Source Video",
          sourceLinksJson: JSON.stringify([{ title: sourceTitle, url: sourceUrl }]),
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: "",
          status: "notSet",
          kind: "unknown",
          message: "Path is not set",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Unsafe Source Video")).toBeInTheDocument();
    const sourceSection = screen
      .getByRole("heading", { name: "Source Links" })
      .closest("section") as HTMLElement;

    expect(within(sourceSection).getByText(sourceTitle)).toBeInTheDocument();
    expect(within(sourceSection).getByText(sourceUrl)).toBeInTheDocument();
    expect(within(sourceSection).queryByRole("link")).not.toBeInTheDocument();
    expect(within(sourceSection).getByRole("button", {
      name: `Open Source Link ${sourceTitle}`,
    })).toBeDisabled();
    expect(invoke).not.toHaveBeenCalledWith(
      expect.stringMatching(/create|update|delete/i),
      expect.anything(),
      expect.anything(),
    );
  });

  it("renders Source Links URL as N/A when missing", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Missing URL Source Video",
          sourceTitle: "Missing URL source",
          sourceUrl: "",
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: "",
          status: "notSet",
          kind: "unknown",
          message: "Path is not set",
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Missing URL Source Video"))
      .toBeInTheDocument();
    const sourceSection = screen
      .getByRole("heading", { name: "Source Links" })
      .closest("section") as HTMLElement;
    expect(within(sourceSection).getByText("Missing URL source"))
      .toBeInTheDocument();
    expect(within(sourceSection).getByText("N/A")).toBeInTheDocument();
    expect(within(sourceSection).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps extreme detail text constrained in title, chips, and metadata rows", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const longTitle =
      "Ultra long detail title ".repeat(12).trim();
    const longCategory =
      "Category With An Extremely Long UnbrokenNameThatShouldNeverStretchTheDetailHeroWidth";
    const longPublisher =
      "Publisher Label With An Extremely Long UnbrokenValueThatShouldWrapInsideTheMetadataRowWithoutHorizontalOverflow";
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: longTitle,
          categoriesJson: JSON.stringify([longCategory]),
          publisherLabel: longPublisher,
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const title = await screen.findByRole("heading", { name: longTitle });
    expect(title).toHaveClass("min-w-0", "flex-1", "line-clamp-2");
    expect(screen.getByRole("button", { name: "Expand full title" }))
      .toBeInTheDocument();

    const categoryText = screen.getByText(longCategory);
    expect(categoryText).toHaveClass("min-w-0", "truncate", "whitespace-nowrap");
    expect(categoryText.parentElement).toHaveAttribute("title", longCategory);

    const metadataValue = screen.getByText(longPublisher);
    expect(metadataValue).toHaveClass("min-w-0", "break-words");
    expect(metadataValue).toHaveClass("[overflow-wrap:anywhere]");
    expect(metadataValue).toHaveAttribute("title", longPublisher);

    const metadataRow = metadataValue.closest("div");
    expect(metadataRow).toHaveClass("min-w-0");
  });

  it.each([
    {
      path: "/videos/video_test_001",
      getCommand: "video_get",
      listCommands: ["performer_list", "image_list"],
      record: persistedVideo({
        title: "Many Category Video",
        categoriesJson: JSON.stringify([
          "Category 1",
          "Category 2",
          "Category 3",
          "Category 4",
          "Category 5",
          "Category 6",
          "Category 7",
        ]),
      }),
    },
    {
      path: "/images/image_test_001",
      getCommand: "image_get",
      listCommands: ["performer_list", "video_list"],
      record: persistedImage({
        title: "Many Category Image",
        categoriesJson: JSON.stringify([
          "Image Category 1",
          "Image Category 2",
          "Image Category 3",
          "Image Category 4",
          "Image Category 5",
          "Image Category 6",
          "Image Category 7",
        ]),
      }),
    },
  ])(
    "renders one-row collapsed category chips with overflow on $path",
    async ({ path, getCommand, listCommands, record }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (command: string) => {
        if (command === getCommand) {
          return record;
        }
        if (listCommands.includes(command)) {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };

      render(<App />);

      expect(await screen.findByText(record.title as string)).toBeInTheDocument();
      const chipRow = screen.getByTestId("detail-category-chip-row");
      expect(chipRow).toHaveClass("max-h-14", "flex-wrap", "overflow-hidden");
      expect(within(chipRow).getByRole("button", { name: "Show 2 more categories" }))
        .toHaveTextContent("+2");
      expect(within(chipRow).queryByText(/Category 7$/)).not.toBeInTheDocument();

      fireEvent.click(within(chipRow).getByRole("button", { name: "Show 2 more categories" }));

      expect(chipRow).toHaveClass("flex-wrap");
      expect(within(chipRow).getByText(/Category 7$/)).toBeInTheDocument();
      expect(within(chipRow).getByRole("button", { name: "Collapse categories" }))
        .toHaveTextContent("Show less");
    },
  );

  it("keeps very long related LiteCard titles clamped and stats truncated", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const longRelatedTitle =
      "Related image title ".repeat(14).trim();
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Long Related Card Video",
          relatedImagesJson:
            '[{"recordId":"image_long","titleSnapshot":"Snapshot Gallery"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_long",
            title: longRelatedTitle,
            imageCount: 123456789,
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Long Related Card Video")).toBeInTheDocument();
    const relatedSection = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(relatedSection).not.toBeNull();
    const related = within(relatedSection as HTMLElement);
    const relatedTitle = related.getByText(longRelatedTitle);
    expect(relatedTitle).toHaveClass("min-w-0", "line-clamp-2");

    const imageCount = related.getByText("123456789");
    expect(imageCount).toHaveClass("truncate");
    expect(imageCount.closest(".grid")).toHaveClass("min-w-0");
  });

  it("renders Video Detail related performers and images in redesigned carousel pages", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
    });
    let relatedPerformers = Array.from({ length: 20 }, (_, index) =>
      persistedPerformer({
        id: `performer_slider_${index + 1}`,
        name: `Carousel Performer ${index + 1}`,
      }),
    );
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Carousel Related Video",
          relatedPerformersJson: JSON.stringify(
            Array.from({ length: 20 }, (_, index) => ({
              performerId: `performer_slider_${index + 1}`,
              nameSnapshot: `Snapshot Performer ${index + 1}`,
            })),
          ),
          relatedImagesJson: JSON.stringify(
            Array.from({ length: 20 }, (_, index) => ({
              recordId: `image_slider_${index + 1}`,
              titleSnapshot: `Snapshot Image ${index + 1}`,
            })),
          ),
        });
      }
      if (command === "performer_list") {
        return relatedPerformers;
      }
      if (command === "performer_get") {
        return persistedPerformer({
          id: args.id,
          name: `Loaded ${args.id}`,
        });
      }
      if (command === "performer_update") {
        const performerIndex = relatedPerformers.findIndex(
          (performer) => performer.id === args.id,
        );
        expect(performerIndex).toBeGreaterThanOrEqual(0);
        relatedPerformers = relatedPerformers.map((performer, index) =>
          index === performerIndex
            ? { ...performer, favorite: args.patch.favorite }
            : performer,
        );
        return relatedPerformers[performerIndex];
      }
      if (command === "image_list") {
        return Array.from({ length: 20 }, (_, index) =>
          persistedImage({
            id: `image_slider_${index + 1}`,
            title: `Carousel Image ${index + 1}`,
          }),
        );
      }
      if (command === "image_get") {
        return persistedImage({
          id: args.id,
          title: `Loaded ${args.id}`,
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Carousel Related Video")).toBeInTheDocument();
    for (const [heading, countLabel] of [
      ["Related Performers", "20 performers"],
      ["Related Images", "20 images"],
    ] as const) {
      const section = screen.getByRole("heading", { name: heading }).closest("section");
      expect(section).not.toBeNull();
      const count = within(section as HTMLElement).getByText(countLabel);
      expect(count).toBeInTheDocument();
      expect(count).toHaveClass("text-sm", "text-slate-500");
      expect(count).not.toHaveClass("rounded-md", "bg-slate-100", "border");
      expect(within(section as HTMLElement).queryByText(/Read-only Related/i))
        .not.toBeInTheDocument();
      const carousel = within(section as HTMLElement).getByTestId("detail-related-carousel");
      expect(carousel).toHaveAttribute("aria-label", `${heading} carousel`);
      expect(carousel).toHaveAttribute("tabindex", "0");
      expect(carousel).toHaveClass("overflow-hidden");
      expect(carousel).not.toHaveClass("overflow-x-auto");
      expect(carousel).not.toHaveClass("focus-visible:ring-2");
      expect(carousel).not.toHaveClass("focus-visible:ring-sakura-300");
      expect(carousel).not.toHaveClass("group");
      expect(carousel).toHaveClass("group/carousel");
      expect(carousel).toHaveAttribute("data-visible-count", "5");
      expect(carousel).toHaveAttribute("data-rendered-count", "20");
      expect(carousel).toHaveAttribute("data-total-count", "20");
      expect(carousel).toHaveAttribute("data-page-count", "4");
      expect(within(carousel).getAllByTestId("detail-related-carousel-card"))
        .toHaveLength(20);
      expect(within(carousel).getAllByTestId("detail-related-carousel-window"))
        .toHaveLength(4);
      expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
        .toHaveClass("basis-full", "shrink-0", "gap-2");
      expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
        .toHaveStyle({ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" });
      const track = within(carousel).getByTestId("detail-related-carousel-track");
      expect(track)
        .toHaveClass("w-full", "transition-transform", "duration-300", "ease-out");
      expect(track).not.toHaveClass("snap-x", "snap-mandatory", "overflow-x-auto", "scroll-smooth");
      expect(track).toHaveStyle({ transform: "translateX(-0%)" });
      expect(within(carousel).getByTestId("detail-related-carousel-viewport"))
        .not.toHaveClass("min-h-[23rem]");
      expect(within(carousel).getByTestId("detail-related-carousel-viewport"))
        .toHaveClass("overflow-hidden");
      expect(within(carousel).getByTestId("detail-related-carousel-viewport"))
        .not.toHaveClass("cursor-grab");
      const firstCardShell = within(carousel).getAllByTestId("detail-related-carousel-card")[0];
      expect(firstCardShell)
        .toHaveClass("flex", "w-full", "min-w-0", "[&>*]:w-full", "[&>*]:min-w-0", "[&>*]:h-full");
      expect(firstCardShell).not.toHaveClass("h-[22rem]");
      expect(firstCardShell).not.toHaveClass("shrink-0", "snap-start");
      expect(firstCardShell.getAttribute("style") ?? "")
        .not.toContain("flex-basis");
      expect(within(carousel).getByTestId("detail-related-carousel-controls"))
        .toHaveClass("min-h-9");
      const previousButton = within(carousel).getByRole("button", { name: "Previous related items" });
      const nextButton = within(carousel).getByRole("button", { name: "Next related items" });
      expect(previousButton)
        .toBeDisabled();
      expect(previousButton).toHaveClass("focus-visible:ring-2");
      expect(nextButton)
        .not.toHaveClass("opacity-0");
      expect(nextButton).toHaveClass("focus-visible:ring-2");
      expect(nextButton).not.toHaveClass("absolute");
      expect(within(carousel).getAllByRole("button", { name: /Go to .* page/ }))
        .toHaveLength(4);
      expect(within(carousel).getByRole("button", { name: `Go to ${heading} page 1` }))
        .toHaveAttribute("aria-current", "page");
      expect(within(carousel).getByRole("button", { name: `Go to ${heading} page 1` }))
        .toHaveClass("focus-visible:ring-2");
    }

    const performersSection = screen.getByRole("heading", { name: "Related Performers" }).closest("section") as HTMLElement;
    const performersCarousel = within(performersSection).getByTestId("detail-related-carousel");
    expect(within(performersCarousel).getByText("Carousel Performer 1")).toBeInTheDocument();
    expect(within(performersCarousel).getByText("Carousel Performer 16")).toBeInTheDocument();
    const locationBeforeArrowClick = window.location.pathname;
    fireEvent.click(within(performersCarousel).getByRole("button", { name: "Next related items" }));
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(locationBeforeArrowClick);
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 2" }))
      .toHaveAttribute("aria-current", "page");
    expect(performersCarousel).toHaveAttribute("data-active-page", "2");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-100%)" });

    fireEvent.keyDown(performersCarousel, { key: "End" });
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 4" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-300%)" });
    expect(window.location.pathname).toBe(locationBeforeArrowClick);

    fireEvent.keyDown(performersCarousel, { key: "Home" });
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 1" }))
      .toHaveAttribute("aria-current", "page");
    fireEvent.keyDown(performersCarousel, { key: "ArrowLeft" });
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 1" }))
      .toHaveAttribute("aria-current", "page");
    fireEvent.keyDown(performersCarousel, { key: "ArrowRight" });
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 2" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-100%)" });
    fireEvent.click(within(performersCarousel).getByRole("button", { name: "Previous related items" }));
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 1" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-0%)" });

    fireEvent.click(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 3" }));
    expect(scrollToMock).not.toHaveBeenCalled();
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 3" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-200%)" });
    expect(within(performersCarousel).getByText("Carousel Performer 11")).toBeInTheDocument();
    fireEvent.transitionEnd(within(performersCarousel).getByTestId("detail-related-carousel-track"));
    expect(within(performersCarousel).getByText("Carousel Performer 1")).toBeInTheDocument();
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 3" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(performersCarousel).getByTestId("detail-related-carousel-track"))
      .toHaveStyle({ transform: "translateX(-200%)" });

    fireEvent.keyDown(performersCarousel, { key: "Home" });
    expect(window.location.pathname).toBe(locationBeforeArrowClick);
    expect(within(performersCarousel).getByRole("button", { name: "Go to Related Performers page 1" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Carousel Performer 1").closest("a"))
      .toHaveAttribute("href", "/performers/performer_slider_1");
    expect(screen.getByText("Carousel Image 1").closest("a"))
      .toHaveAttribute("href", "/images/image_slider_1");
    fireEvent.pointerDown(within(performersCarousel).getByText("Carousel Performer 1").closest("a") as HTMLElement, {
      clientX: 12,
      pointerId: 1,
    });
    fireEvent.pointerUp(within(performersCarousel).getByText("Carousel Performer 1").closest("a") as HTMLElement, {
      clientX: 96,
      pointerId: 1,
    });
    expect(window.location.pathname).toBe(locationBeforeArrowClick);
    fireEvent.click(within(performersCarousel).getAllByRole("button", { name: "Favorite" })[0]);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "performer_update",
        expect.objectContaining({
          id: "performer_slider_1",
          patch: expect.objectContaining({ favorite: false }),
        }),
        undefined,
      );
    });
    expect(window.location.pathname).toBe(locationBeforeArrowClick);
    const imagesSection = screen.getByRole("heading", { name: "Related Images" }).closest("section") as HTMLElement;
    expect(within(imagesSection).getByText("Carousel Image 1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Carousel Performer 1").closest("a") as HTMLElement);
    expect(window.location.pathname).toBe("/performers/performer_slider_1");
  }, 10_000);

  it("clicking a Video Detail related image card navigates to Image Detail", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Related Image Navigation Video",
          relatedImagesJson:
            '[{"recordId":"image_nav","titleSnapshot":"Related Image Nav"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_nav",
            title: "Related Image Nav",
          }),
        ];
      }
      if (command === "image_get") {
        return persistedImage({
          id: args.id,
          title: "Loaded Related Image Nav",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Image Navigation Video")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Related Image Nav").closest("a") as HTMLElement);
    expect(window.location.pathname).toBe("/images/image_nav");
  });

  it("renders Image Detail related performers and videos in carousel viewports", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Carousel Related Image",
          relatedPerformersJson:
            '[{"performerId":"performer_slider","nameSnapshot":"Snapshot Performer"}]',
          relatedVideosJson:
            '[{"recordId":"video_slider","titleSnapshot":"Snapshot Video"}]',
        });
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_slider",
            name: "Image Slider Performer",
          }),
        ];
      }
      if (command === "performer_get") {
        return persistedPerformer({
          id: args.id,
          name: "Loaded Image Slider Performer",
        });
      }
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_slider",
            title: "Image Slider Video",
          }),
        ];
      }
      if (command === "video_get") {
        return persistedVideo({
          id: args.id,
          title: "Loaded Image Slider Video",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Carousel Related Image")).toBeInTheDocument();
    for (const heading of ["Related Performers", "Related Videos"]) {
      const section = screen.getByRole("heading", { name: heading }).closest("section");
      expect(section).not.toBeNull();
      expect(within(section as HTMLElement).getByText(heading === "Related Performers" ? "1 performer" : "1 video"))
        .toBeInTheDocument();
      const carousel = within(section as HTMLElement).getByTestId("detail-related-carousel");
      expect(carousel).toHaveClass("overflow-hidden");
      expect(carousel).toHaveAttribute("data-visible-count", "5");
      expect(carousel).toHaveAttribute("data-rendered-count", "1");
      expect(carousel).toHaveAttribute("data-total-count", "1");
      expect(within(carousel).queryByRole("button", { name: "Next related items" }))
        .not.toBeInTheDocument();
      expect(within(carousel).getByTestId("detail-related-carousel-window"))
        .toHaveClass("basis-full", "shrink-0", "gap-2");
      expect(within(carousel).getByTestId("detail-related-carousel-window"))
        .toHaveStyle({ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" });
      expect(within(carousel).getByTestId("detail-related-carousel-track"))
        .toHaveClass("w-full", "transition-transform");
      expect(within(carousel).getByTestId("detail-related-carousel-track"))
        .not.toHaveClass("snap-x", "snap-mandatory", "overflow-x-auto");
      expect(within(carousel).getByTestId("detail-related-carousel-card"))
        .toHaveClass("w-full", "min-w-0", "[&>*]:w-full", "[&>*]:min-w-0", "[&>*]:h-full");
      expect(within(carousel).getByTestId("detail-related-carousel-card"))
        .not.toHaveClass("h-[22rem]");
    }
    expect(screen.getByText("Image Slider Performer").closest("a"))
      .toHaveAttribute("href", "/performers/performer_slider");
    expect(screen.getByText("Image Slider Video").closest("a"))
      .toHaveAttribute("href", "/videos/video_slider");
    fireEvent.click(screen.getByText("Image Slider Performer").closest("a") as HTMLElement);
    expect(window.location.pathname).toBe("/performers/performer_slider");
  });

  it("clicking an Image Detail related video card navigates to Video Detail", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        return persistedImage({
          title: "Related Video Navigation Image",
          relatedVideosJson:
            '[{"recordId":"video_nav","titleSnapshot":"Related Video Nav"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_nav",
            title: "Related Video Nav",
          }),
        ];
      }
      if (command === "video_get") {
        return persistedVideo({
          id: args.id,
          title: "Loaded Related Video Nav",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Video Navigation Image")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Related Video Nav").closest("a") as HTMLElement);
    expect(window.location.pathname).toBe("/videos/video_nav");
  });

  it("reduces Detail related carousel visible count in narrow windows", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 520,
    });
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Narrow Carousel Video",
          relatedPerformersJson: JSON.stringify(
            Array.from({ length: 9 }, (_, index) => ({
              performerId: `narrow_performer_${index + 1}`,
              nameSnapshot: `Narrow Performer ${index + 1}`,
            })),
          ),
        });
      }
      if (command === "performer_list") {
        return Array.from({ length: 9 }, (_, index) =>
          persistedPerformer({
            id: `narrow_performer_${index + 1}`,
            name: `Narrow Performer ${index + 1}`,
          }),
        );
      }
      if (command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Narrow Carousel Video")).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Performers" }).closest("section");
    expect(section).not.toBeNull();
    const carousel = within(section as HTMLElement).getByTestId("detail-related-carousel");

    await waitFor(() => {
      expect(carousel).toHaveAttribute("data-visible-count", "2");
    });
    expect(carousel).toHaveAttribute("data-page-count", "5");
    expect(carousel).toHaveAttribute("data-rendered-count", "9");
    expect(within(carousel).getAllByTestId("detail-related-carousel-card"))
      .toHaveLength(9);
    expect(within(carousel).getAllByTestId("detail-related-carousel-window"))
      .toHaveLength(5);
    expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
      .toHaveClass("gap-2");
    expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
      .toHaveStyle({ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" });
    expect(within(carousel).getByTestId("detail-related-carousel-track"))
      .toHaveClass("w-full", "transition-transform");
    expect(within(carousel).getByTestId("detail-related-carousel-track"))
      .not.toHaveClass("overflow-x-auto", "snap-x");
    expect(within(carousel).getAllByTestId("detail-related-carousel-card")[0])
      .not.toHaveClass("shrink-0", "snap-start");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
  });

  it.each([
    { width: 900, visibleCount: 4, pageCount: 2 },
    { width: 700, visibleCount: 3, pageCount: 3 },
    { width: 320, visibleCount: 1, pageCount: 7 },
  ])(
    "uses $visibleCount-card responsive basis for $width px related carousel",
    async ({ width, visibleCount, pageCount }) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      window.history.pushState({}, "", "/videos/video_test_001");
      const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
        if (command === "video_get") {
          expect(args.id).toBe("video_test_001");
          return persistedVideo({
            title: `Responsive ${visibleCount} Carousel Video`,
            relatedPerformersJson: JSON.stringify(
              Array.from({ length: 7 }, (_, index) => ({
                performerId: `responsive_performer_${index + 1}`,
                nameSnapshot: `Responsive Performer ${index + 1}`,
              })),
            ),
          });
        }
        if (command === "performer_list") {
          return Array.from({ length: 7 }, (_, index) =>
            persistedPerformer({
              id: `responsive_performer_${index + 1}`,
              name: `Responsive Performer ${index + 1}`,
            }),
          );
        }
        if (command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };

      render(<App />);

      expect(await screen.findByText(`Responsive ${visibleCount} Carousel Video`))
        .toBeInTheDocument();
      const section = screen.getByRole("heading", { name: "Related Performers" }).closest("section");
      expect(section).not.toBeNull();
      const carousel = within(section as HTMLElement).getByTestId("detail-related-carousel");

      await waitFor(() => {
        expect(carousel).toHaveAttribute("data-visible-count", String(visibleCount));
      });
      expect(carousel).toHaveAttribute("data-page-count", String(pageCount));
      expect(within(carousel).getByTestId("detail-related-carousel-track"))
        .toHaveClass("w-full", "transition-transform");
      expect(within(carousel).getByTestId("detail-related-carousel-track"))
        .not.toHaveClass("overflow-x-auto", "snap-x", "scroll-smooth");
      expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
        .toHaveClass("gap-2");
      expect(within(carousel).getAllByTestId("detail-related-carousel-window")[0])
        .toHaveStyle({
          gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))`,
        });
      expect(within(carousel).getAllByTestId("detail-related-carousel-card")[0])
        .toHaveClass("w-full", "min-w-0", "[&>*]:w-full", "[&>*]:min-w-0", "[&>*]:h-full");
      expect(within(carousel).getAllByTestId("detail-related-carousel-card")[0])
        .not.toHaveClass("h-[22rem]");
      expect(within(carousel).getAllByTestId("detail-related-carousel-card")[0])
        .not.toHaveClass("shrink-0", "snap-start");

      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 1024,
      });
    },
  );

  it("renders saved Performer mini thumbnails and opens thumbnail preview", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const record = persistedPerformer({
      name: "Thumbnail Performer Detail",
      performerThumbnailPathsJson: JSON.stringify([
        "D:/Sakurava/thumb-1.jpg",
        "D:/Sakurava/thumb-2.jpg",
      ]),
    });
    const invoke = vi.fn(
      async (incomingCommand: string, args: Record<string, any> = {}) => {
        if (incomingCommand === "performer_get") {
          expect(args.id).toBe("performer_test_001");
          return record;
        }

        if (
          incomingCommand === "path_status_check" ||
          incomingCommand === "video_list" ||
          incomingCommand === "image_list"
        ) {
          if (incomingCommand === "path_status_check") {
            return {
              path: args.path,
              status: args.path ? "exists" : "notSet",
              kind: args.path ? "file" : "unknown",
              message: args.path ? "Path exists" : "Path is not set",
            };
          }

          return [];
        }

        throw new Error(`Unexpected command ${incomingCommand}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Thumbnail Performer Detail")).toBeInTheDocument();
    expect(await screen.findByAltText("Performer Thumbnail 1")).toHaveAttribute(
      "src",
      "asset://localhost/D:/Sakurava/thumb-1.jpg",
    );
    expect(screen.getByAltText("Performer Thumbnail 2")).toHaveAttribute(
      "src",
      "asset://localhost/D:/Sakurava/thumb-2.jpg",
    );
    expect(screen.getByLabelText("Performer Thumbnail 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Performer Thumbnail 4")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview Performer Thumbnail 3" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Preview Performer Thumbnail 1" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Performer Thumbnail 1",
    });
    expect(within(dialog).getByLabelText("Image metadata")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Image viewer actions")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Image viewer controls")).toBeInTheDocument();
    expect(
      within(dialog).getByAltText("Gallery image 1 full size"),
    ).toHaveAttribute("src", "asset://localhost/D:/Sakurava/thumb-1.jpg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next gallery image" }));
    expect(
      within(dialog).getByAltText("Gallery image 2 full size"),
    ).toHaveAttribute("src", "asset://localhost/D:/Sakurava/thumb-2.jpg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Previous gallery image" }));
    expect(
      within(dialog).getByAltText("Gallery image 1 full size"),
    ).toHaveAttribute("src", "asset://localhost/D:/Sakurava/thumb-1.jpg");

    expect(
      within(dialog).queryByRole("button", { name: "Close gallery viewer" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Performer Thumbnail 1" }),
      ).not.toBeInTheDocument();
    });

    fireEvent.error(screen.getByAltText("Performer Thumbnail 2"));
    await waitFor(() => {
      expect(screen.getByLabelText("Performer Thumbnail 2")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Preview Performer Thumbnail 2" }),
    ).not.toBeInTheDocument();
  });

  it("keeps collection placeholder when cover conversion is unavailable", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Unconverted Cover Video",
            coverPath: "D:/Sakurava/unconverted-cover.jpg",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Unconverted Cover Video")).toBeInTheDocument();
    expect(screen.getByLabelText("Cover Placeholder")).toBeInTheDocument();
    expect(
      screen.queryByAltText("Unconverted Cover Video cover"),
    ).not.toBeInTheDocument();
  });

  it("falls back to collection placeholder when cover image loading fails", async () => {
    clearAllSessionFilterStateForTests();
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Broken Cover Video",
            coverPath: "D:/Sakurava/broken-cover.jpg",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    const image = await screen.findByAltText("Broken Cover Video cover");
    fireEvent.error(image);

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "Cover Placeholder" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByAltText("Broken Cover Video cover")).not.toBeInTheDocument();
  });

  it("displays resolved Related Performers on video detail without raw ids", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Related Performer Video",
          relatedPerformersJson:
            '[{"performerId":"performer_aoi","nameSnapshot":"Snapshot Aoi"}]',
        });
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_aoi",
            name: "Aoi Sakura",
            originalName: "Sakura Aoi",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Performer Video")).toBeInTheDocument();
    expect(screen.getByText("Aoi Sakura")).toBeInTheDocument();
    const relatedCard = screen.getByText("Aoi Sakura").closest("a");
    expect(relatedCard).not.toBeNull();
    expect(relatedCard).toHaveAttribute("href", "/performers/performer_aoi");
    expect(screen.queryByText("performer_aoi")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("renders sorted Video Related Performers carousel with compact metadata", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Credits Video",
          relatedPerformersJson:
            '[{"performerId":"performer_aoi","nameSnapshot":"Legacy Aoi"}]',
        });
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_aoi",
            name: "Aoi Sakura",
            originalName: "Sakura Aoi",
            aliasesJson: '["Must Not Be Character"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({ key: "credit_cast", name: "Cast" }),
          managedCategoryFixture({ key: "role_lead", name: "Lead" }),
        ];
      }
      if (command === "credit_list_by_work") {
        return [
          persistedCredit({
            id: "credit_second",
            performerId: "performer_aoi",
            characterName: "",
            billingOrder: null,
          }),
          persistedCredit({
            id: "credit_first",
            performerId: "performer_aoi",
            characterName: "Hana",
            characterOriginalName: "花",
            creditedAs: "A. Sakura",
            creditedAsMode: "custom",
            creditTypeCategoryId: "credit_cast",
            roleImportanceCategoryId: "role_lead",
            billingOrder: 1,
            note: "Opening role",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Credits Video")).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Performers" })
      .closest("section") as HTMLElement;
    const credits = within(section);
    expect(credits.getAllByText("Aoi Sakura")).toHaveLength(1);
    expect(credits.getByText("Aoi Sakura").closest("a"))
      .toHaveAttribute("href", "/performers/performer_aoi");
    expect(credits.getByText("Hana").closest("a")).toBeNull();
    expect(credits.getByText("Hana").closest(
      '[data-testid="credit-metadata"]',
    )).toBeInTheDocument();
    expect(credits.getByText("Cast")).toBeInTheDocument();
    expect(credits.queryByText("Lead")).not.toBeInTheDocument();
    expect(credits.queryByText("Opening role")).not.toBeInTheDocument();
    expect(credits.queryByText("A. Sakura")).not.toBeInTheDocument();
    expect(credits.queryByText("Must Not Be Character")).not.toBeInTheDocument();
    expect(credits.getByLabelText("Related Performers carousel"))
      .toBeInTheDocument();
  });

  it("renders Image credits with Self and safe unresolved fallbacks", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        return persistedImage({
          title: "Credits Image",
          relatedPerformersJson:
            '[{"performerId":"missing_performer","nameSnapshot":"Legacy Snapshot"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [];
      }
      if (command === "credit_list_by_work") {
        expect(args).toEqual({ workType: "image", workId: "image_test_001" });
        return [
          persistedCredit({
            id: "credit_self",
            workType: "image",
            performerId: "missing_performer",
            characterMode: "self",
            creditTypeCategoryId: "missing_credit_type",
          }),
          persistedCredit({
            id: "credit_second_role",
            workType: "image",
            performerId: "missing_performer",
            characterName: "Guest Role",
            billingOrder: 2,
          }),
          persistedCredit({
            id: "credit_unknown",
            workType: "image",
            performerId: "unknown_performer",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Credits Image")).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Performers" })
      .closest("section") as HTMLElement;
    const credits = within(section);
    expect(credits.getAllByText("Legacy Snapshot")).toHaveLength(1);
    expect(credits.getByText("Unknown performer")).toBeInTheDocument();
    expect(credits.getByText("Self")).toBeInTheDocument();
    expect(credits.getByText("Self").closest("a")).toBeNull();
    expect(credits.getByText("Guest Role").closest("a")).toBeNull();
    expect(credits.getByText("missing_credit_type")).toBeInTheDocument();
    expect(credits.getByText("Legacy Snapshot").closest("a"))
      .not.toHaveAttribute("href", "/performers/missing_performer");
  });

  it("maps and persists Related Performer favorite state on video detail", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    let relatedPerformer = persistedPerformer({
      id: "performer_favorite",
      name: "Favorite Related Performer",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Related Performer Favorite Video",
          relatedPerformersJson:
            '[{"performerId":"performer_favorite","nameSnapshot":"Snapshot Performer"}]',
        });
      }
      if (command === "performer_list") {
        return [relatedPerformer];
      }
      if (command === "image_list") {
        return [];
      }
      if (command === "performer_update") {
        expect(args.id).toBe("performer_favorite");
        expect(args.patch).toEqual({ favorite: false });
        relatedPerformer = { ...relatedPerformer, favorite: false };
        return relatedPerformer;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Performer Favorite Video"))
      .toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Performers" }).closest("section");
    expect(section).not.toBeNull();
    const related = within(section as HTMLElement);
    expect(related.getByText("Favorite Related Performer")).toBeInTheDocument();

    fireEvent.click(related.getByRole("button", { name: "Favorite" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "performer_update",
        { id: "performer_favorite", patch: { favorite: false } },
        undefined,
      );
    });
    expect(related.getByRole("button", { name: "Not favorite" }))
      .toBeInTheDocument();
  });

  it("displays Related Performer snapshots on image detail when performers cannot load", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Legacy Performer Image",
          relatedPerformersJson:
            '[{"performerId":"missing_performer","nameSnapshot":"Former Performer"},{"performerId":"empty_snapshot","nameSnapshot":""}]',
        });
      }
      if (command === "performer_list") {
        throw new Error("Performer list unavailable");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Legacy Performer Image")).toBeInTheDocument();
    expect(screen.getByText("Former Performer")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Performer")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.queryByText("Related item unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("missing_performer")).not.toBeInTheDocument();
    expect(screen.queryByText("empty_snapshot")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("displays resolved Related Images on video detail without raw ids", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Related Image Video",
          relatedImagesJson:
            '[{"recordId":"image_hanami","titleSnapshot":"Snapshot Gallery"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_hanami",
            title: "Hanami Gallery",
            originalTitle: "Spring Original",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Image Video")).toBeInTheDocument();
    expect(screen.getByText("Hanami Gallery")).toBeInTheDocument();
    const relatedCard = screen.getByText("Hanami Gallery").closest("a");
    expect(relatedCard).not.toBeNull();
    expect(relatedCard).toHaveAttribute("href", "/images/image_hanami");
    expect(screen.queryByText("image_hanami")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("maps and persists Related Image favorite state on video detail", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    let relatedImage = persistedImage({
      id: "image_favorite",
      title: "Favorite Related Gallery",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Related Image Favorite Video",
          relatedImagesJson:
            '[{"recordId":"image_favorite","titleSnapshot":"Snapshot Gallery"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "image_list") {
        return [relatedImage];
      }
      if (command === "image_update") {
        expect(args.id).toBe("image_favorite");
        expect(args.patch).toEqual({ favorite: false });
        relatedImage = { ...relatedImage, favorite: false };
        return relatedImage;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Image Favorite Video"))
      .toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(section).not.toBeNull();
    const related = within(section as HTMLElement);
    expect(related.getByText("Favorite Related Gallery")).toBeInTheDocument();

    fireEvent.click(related.getByRole("button", { name: "Favorite" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "image_update",
        { id: "image_favorite", patch: { favorite: false } },
        undefined,
      );
    });
    expect(related.getByRole("button", { name: "Not favorite" }))
      .toBeInTheDocument();
  });

  it("displays resolved Related Videos on image detail without raw ids", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Related Video Image",
          relatedVideosJson:
            '[{"recordId":"video_spring","titleSnapshot":"Snapshot Video"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_spring",
            title: "Spring Feature",
            originalTitle: "Feature Original",
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Video Image")).toBeInTheDocument();
    expect(screen.getByText("Spring Feature")).toBeInTheDocument();
    const relatedCard = screen.getByText("Spring Feature").closest("a");
    expect(relatedCard).not.toBeNull();
    expect(relatedCard).toHaveAttribute("href", "/videos/video_spring");
    expect(screen.queryByText("video_spring")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("maps and persists Related Video favorite state on image detail", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    let relatedVideo = persistedVideo({
      id: "video_favorite",
      title: "Favorite Related Video",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Related Video Favorite Image",
          relatedVideosJson:
            '[{"recordId":"video_favorite","titleSnapshot":"Snapshot Video"}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "video_list") {
        return [relatedVideo];
      }
      if (command === "video_update") {
        expect(args.id).toBe("video_favorite");
        expect(args.patch).toEqual({ favorite: false });
        relatedVideo = { ...relatedVideo, favorite: false };
        return relatedVideo;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Related Video Favorite Image"))
      .toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Videos" }).closest("section");
    expect(section).not.toBeNull();
    const related = within(section as HTMLElement);
    expect(related.getByText("Favorite Related Video")).toBeInTheDocument();

    fireEvent.click(related.getByRole("button", { name: "Favorite" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "video_update",
        { id: "video_favorite", patch: { favorite: false } },
        undefined,
      );
    });
    expect(related.getByRole("button", { name: "Not favorite" }))
      .toBeInTheDocument();
  });

  it("displays Related Image fallbacks when target records cannot load", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Legacy Image Detail Video",
          relatedImagesJson:
            '[{"recordId":"missing_image","titleSnapshot":"Former Gallery"},{"recordId":"empty_snapshot","titleSnapshot":""}]',
        });
      }
      if (command === "performer_list") {
        return [];
      }
      if (command === "image_list") {
        throw new Error("Image list unavailable");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Legacy Image Detail Video"))
      .toBeInTheDocument();
    expect(screen.getByText("Former Gallery")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Image")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    const imagesSection = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(imagesSection).not.toBeNull();
    expect(within(imagesSection as HTMLElement).queryByRole("button", { name: "Not favorite" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Related item unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("missing_image")).not.toBeInTheDocument();
    expect(screen.queryByText("empty_snapshot")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("displays resolved Performer Related Videos and Related Images without raw ids", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Persisted Performer",
          relatedVideosJson:
            '[{"recordId":"video_hanami","titleSnapshot":"Snapshot Video"}]',
          relatedImagesJson:
            '[{"recordId":"image_hanami","titleSnapshot":"Snapshot Gallery"}]',
        });
      }
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_hanami",
            title: "Hanami Feature",
            originalTitle: "Video Original",
            publisherLabel: "Hanami Video Label",
            releaseDate: "2024-04-05",
            durationMinutes: 86,
            ratingJson: '{"rewatch":5,"visual":4}',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_hanami",
            title: "Hanami Gallery",
            originalTitle: "Gallery Original",
            publisherLabel: "Hanami Image Label",
            releaseDate: "2023-03-04",
            imageCount: 42,
            ratingJson: '{"memorability":4,"visual":4}',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Persisted Performer")).toBeInTheDocument();
    const videosSection = screen.getByRole("heading", { name: "Related Videos" }).closest("section");
    expect(videosSection).not.toBeNull();
    const videos = within(videosSection as HTMLElement);
    expect(videos.queryByRole("button", { name: "Card" })).not.toBeInTheDocument();
    expect(videos.queryByRole("button", { name: "Table" })).not.toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Switch to table view" })).toBeInTheDocument();
    expect(videos.getByTestId("performer-related-view-button"))
      .toHaveClass("h-9", "w-9");
    expect(videos.getByTestId("performer-related-search-control"))
      .toHaveClass("flex", "items-center");
    expect(videos.getByTestId("performer-related-sort-control"))
      .toHaveAttribute("aria-haspopup", "listbox");
    expect(videos.getByText("Page size")).toBeInTheDocument();
    expect(videos.getByText("per page")).toBeInTheDocument();
    expect(videos.getByLabelText("Related items per page")).toHaveValue("20");
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "20" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "40" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "80" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "120" }),
    ).toBeInTheDocument();
    expect(videos.getByLabelText("Search related items")).toBeInTheDocument();
    expect(videos.getByText("Hanami Feature")).toBeInTheDocument();
    expect(videos.getByTestId("performer-related-videos-card-grid"))
      .toHaveClass("[grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]");
    fireEvent.click(videos.getByLabelText("Related items per page control"));
    expect(
      videos.getByRole("listbox", {
        name: "Related items per page options",
      }).parentElement,
    ).toHaveAttribute("data-placement", "down");
    fireEvent.keyDown(document, { key: "Escape" });
    const relatedVideoCard = videos.getByText("Hanami Feature").closest("a");
    expect(relatedVideoCard).not.toBeNull();
    expect(relatedVideoCard).toHaveAttribute("href", "/videos/video_hanami");
    const videoRating = videos.getByLabelText("Rating 4.5");
    expect(videoRating).toHaveClass("bg-sakura-50");
    expect(videoRating).toHaveClass("text-sakura-600");
    expect(videoRating).not.toHaveClass("bg-sakura-500");
    fireEvent.click(videos.getByRole("button", { name: "Switch to table view" }));
    expect(videos.getByRole("button", { name: "Switch to card view" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "AVAIL" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "FAV" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: /TITLE/ })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by AVAIL" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by Title" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "CODE" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by CODE" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "TOTAL" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by TOTAL" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "CENSOR" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by CENSOR" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "RATING" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Sort by RATING" })).toBeInTheDocument();
    expect(videos.getByTestId("performer-related-videos-table-scroll"))
      .toHaveClass("sticky-horizontal-scroll-body", "overflow-x-auto");
    expect(
      videos.getByTestId("performer-related-videos-table-scroll")
        .closest("[data-sticky-horizontal-scroll='true']"),
    ).toHaveClass("sticky-horizontal-scroll-frame");
    expect(videos.getByTestId("performer-related-videos-table"))
      .toHaveClass("w-full", "table-fixed", "min-w-[1040px]");
    expect(videos.getByTestId("performer-related-videos-table"))
      .toHaveStyle({ width: "100%" });
    expect(videos.getByRole("link", { name: "Hanami Feature" })).toHaveAttribute("href", "/videos/video_hanami");

    const imagesSection = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(imagesSection).not.toBeNull();
    const images = within(imagesSection as HTMLElement);
    expect(images.queryByRole("button", { name: "Card" })).not.toBeInTheDocument();
    expect(images.queryByRole("button", { name: "Table" })).not.toBeInTheDocument();
    expect(images.getByRole("button", { name: "Switch to table view" })).toBeInTheDocument();
    expect(images.getByTestId("performer-related-view-button"))
      .toHaveClass("h-9", "w-9");
    expect(images.getByTestId("performer-related-search-control"))
      .toHaveClass("flex", "items-center");
    expect(images.getByTestId("performer-related-sort-control"))
      .toHaveAttribute("aria-haspopup", "listbox");
    expect(images.getByText("Page size")).toBeInTheDocument();
    expect(images.getByText("per page")).toBeInTheDocument();
    expect(images.getByLabelText("Related items per page")).toHaveValue("20");
    expect(images.getByLabelText("Search related items")).toBeInTheDocument();
    expect(images.getByText("Hanami Gallery")).toBeInTheDocument();
    expect(images.getByTestId("performer-related-images-card-grid"))
      .toHaveClass("[grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]");
    const relatedImageCard = images.getByText("Hanami Gallery").closest("a");
    expect(relatedImageCard).not.toBeNull();
    expect(relatedImageCard).toHaveAttribute("href", "/images/image_hanami");
    const imageRating = images.getByLabelText("Rating 4.0");
    expect(imageRating).toHaveClass("bg-sakura-50");
    expect(imageRating).toHaveClass("text-sakura-600");
    expect(imageRating).not.toHaveClass("bg-sakura-500");
    fireEvent.click(images.getByRole("button", { name: "Switch to table view" }));
    expect(images.getByRole("button", { name: "Switch to card view" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "AVAIL" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "FAV" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: /TITLE/ })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by AVAIL" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by Title" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "CODE" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by CODE" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "TOTAL" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by TOTAL" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "CENSOR" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by CENSOR" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "RATING" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Sort by RATING" })).toBeInTheDocument();
    expect(images.getByTestId("performer-related-images-table-scroll"))
      .toHaveClass("sticky-horizontal-scroll-body", "overflow-x-auto");
    expect(images.getByTestId("performer-related-images-table"))
      .toHaveClass("w-full", "table-fixed", "min-w-[1040px]");
    expect(images.getByTestId("performer-related-images-table"))
      .toHaveStyle({ width: "100%" });
    expect(images.getByRole("link", { name: "Hanami Gallery" })).toHaveAttribute("href", "/images/image_hanami");

    expect(screen.queryByText("video_hanami")).not.toBeInTheDocument();
    expect(screen.queryByText("image_hanami")).not.toBeInTheDocument();
    expect(screen.queryByText("Snapshot Video")).not.toBeInTheDocument();
    expect(screen.queryByText("Snapshot Gallery")).not.toBeInTheDocument();
    expect(screen.queryByText("Available after relation features are added."))
      .not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps Performer Related Videos and Images while showing credit metadata", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Filmography Performer",
          aliasesJson: '["Identity Alias"]',
          relatedVideosJson:
            '[{"recordId":"legacy_video","titleSnapshot":"Legacy Video"}]',
          relatedImagesJson:
            '[{"recordId":"legacy_image","titleSnapshot":"Legacy Image"}]',
        });
      }
      if (command === "credit_list_by_performer") {
        expect(args).toEqual({ performerId: "performer_test_001" });
        return [
          persistedCredit({
            id: "credit_image",
            workType: "image",
            workId: "image_credit",
            performerId: "performer_test_001",
            characterMode: "self",
            creditTypeCategoryId: "credit_model",
          }),
          persistedCredit({
            id: "credit_video_second_role",
            workId: "video_credit",
            performerId: "performer_test_001",
            characterName: "",
            billingOrder: 2,
          }),
          persistedCredit({
            id: "credit_video_first_role",
            workId: "video_credit",
            performerId: "performer_test_001",
            characterName: "Hana",
            characterOriginalName: "花",
            creditedAsMode: "custom",
            creditedAs: "Stage Name",
            creditTypeCategoryId: "credit_cast",
            roleImportanceCategoryId: "role_lead",
            billingOrder: 1,
            note: "Lead performance",
          }),
          persistedCredit({
            id: "credit_missing_video",
            workId: "missing_video",
            performerId: "performer_test_001",
            creditTypeCategoryId: "missing_category",
          }),
        ];
      }
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_credit",
            title: "Credited Video",
            originalTitle: "Credited Video Original",
            releaseDate: "2025-05-01",
            publisherLabel: "Video Studio",
          }),
          persistedVideo({ id: "legacy_video", title: "Legacy Video" }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_credit",
            title: "Credited Image",
            releaseDate: "2026-01-01",
            publisherLabel: "Image Studio",
          }),
          persistedImage({ id: "legacy_image", title: "Legacy Image" }),
        ];
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({ key: "credit_cast", name: "Cast" }),
          managedCategoryFixture({ key: "role_lead", name: "Lead" }),
          managedCategoryFixture({ key: "credit_model", name: "Model" }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Filmography Performer")).toBeInTheDocument();
    const videosSection = screen.getByRole("heading", {
      name: "Related Videos",
    }).closest("section") as HTMLElement;
    const imagesSection = screen.getByRole("heading", {
      name: "Related Images",
    }).closest("section") as HTMLElement;
    const videos = within(videosSection);
    const images = within(imagesSection);
    expect(videos.getAllByText("Credited Video")).toHaveLength(1);
    expect(videos.getByText("Credited Video").closest("a"))
      .toHaveAttribute("href", "/videos/video_credit");
    expect(images.getByText("Credited Image").closest("a"))
      .toHaveAttribute("href", "/images/image_credit");
    expect(videos.queryByText("Hana")).not.toBeInTheDocument();
    expect(images.queryByText("Self")).not.toBeInTheDocument();
    expect(videos.queryByText("Cast")).not.toBeInTheDocument();
    expect(images.queryByText("Model")).not.toBeInTheDocument();
    expect(videos.getByText("Unresolved Video")).toBeInTheDocument();
    expect(videos.queryByText("missing_category")).not.toBeInTheDocument();
    expect(videos.queryByText("Legacy Video")).not.toBeInTheDocument();
    expect(images.queryByText("Legacy Image")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Credits / Filmography" }))
      .not.toBeInTheDocument();
  });

  it("keeps unresolved Performer related catalog items visible as safe fallbacks", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Fallback Performer",
          relatedVideosJson:
            '[{"recordId":"missing_video","titleSnapshot":"Former Video"},{"recordId":"empty_video","titleSnapshot":""}]',
          relatedImagesJson:
            '[{"recordId":"missing_image","titleSnapshot":"Former Gallery"},{"recordId":"empty_image","titleSnapshot":""}]',
        });
      }
      if (command === "video_list" || command === "image_list") {
        throw new Error("Related target list unavailable");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Fallback Performer")).toBeInTheDocument();
    expect(screen.getByText("Former Video")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Video")).toBeInTheDocument();
    expect(screen.getByText("Former Gallery")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Image")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.queryByText("Related item unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("missing_video")).not.toBeInTheDocument();
    expect(screen.queryByText("missing_image")).not.toBeInTheDocument();
    expect(screen.queryByText("empty_video")).not.toBeInTheDocument();
    expect(screen.queryByText("empty_image")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("shows neutral empty states for empty Performer related sections", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({ name: "Empty Related Performer" });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Empty Related Performer")).toBeInTheDocument();
    const videosSection = screen.getByRole("heading", { name: "Related Videos" }).closest("section");
    expect(videosSection).not.toBeNull();
    expect(within(videosSection as HTMLElement).getByText("No related videos saved."))
      .toBeInTheDocument();

    const imagesSection = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(imagesSection).not.toBeNull();
    expect(within(imagesSection as HTMLElement).getByText("No related images saved."))
      .toBeInTheDocument();
    expect(screen.queryByText("Available after relation features are added."))
      .not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("video_list", {}, undefined);
    expect(invoke).not.toHaveBeenCalledWith("image_list", {}, undefined);
  });

  it("sorts and paginates Performer Related Videos locally", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const relatedVideos = [
      { id: "video_alpha", title: "Alpha Video", releaseDate: "2024-01-01" },
      { id: "video_zulu", title: "Zulu Video", releaseDate: "2022-01-01" },
      { id: "video_middle", title: "Middle Video", releaseDate: "2023-01-01" },
      { id: "video_page_4", title: "Page Video 4", releaseDate: "2021-01-01" },
      { id: "video_page_5", title: "Page Video 5", releaseDate: "2020-01-01" },
      { id: "video_page_6", title: "Page Video 6", releaseDate: "2019-01-01" },
      { id: "video_page_7", title: "Page Video 7", releaseDate: "2018-01-01" },
      { id: "video_page_8", title: "Page Video 8", releaseDate: "2017-01-01" },
      { id: "video_page_9", title: "Page Video 9", releaseDate: "2016-01-01" },
      { id: "video_page_10", title: "Page Video 10", releaseDate: "2015-01-01" },
      { id: "video_page_11", title: "Page Video 11", releaseDate: "2014-01-01" },
      { id: "video_page_12", title: "Page Video 12", releaseDate: "2013-01-01" },
      { id: "video_missing", title: "Missing Date Video", releaseDate: "" },
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Sorted Video Performer",
          relatedVideosJson: JSON.stringify(
            relatedVideos.map((video) => ({
              recordId: video.id,
              titleSnapshot: video.title,
            })),
          ),
        });
      }
      if (command === "video_list") {
        return relatedVideos.map((video) =>
          persistedVideo({
            id: video.id,
            title: video.title,
            releaseDate: video.releaseDate,
            publisherLabel: `${video.title} Label`,
            durationMinutes: 70,
          }),
        );
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Sorted Video Performer")).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Videos" }).closest("section");
    expect(section).not.toBeNull();
    const videos = within(section as HTMLElement);

    expect(videos.getByText("Alpha Video")).toBeInTheDocument();
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    expect(videos.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(videos.queryByRole("button", { name: "Page 2" })).not.toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Related items per page"), { target: { value: "40" } });
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    expect(videos.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Search related items"), {
      target: { value: "zulu" },
    });
    expect(videos.getByText("Showing 1-1 of 1 filtered from 13")).toBeInTheDocument();
    expect(videos.getByText("Zulu Video")).toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Search related items"), {
      target: { value: "" },
    });
    fireEvent.change(videos.getByLabelText("Related items per page"), { target: { value: "20" } });

    selectRelatedSort(videos, "A-Z");
    expectPrecedes(section as HTMLElement, "Alpha Video", "Middle Video");
    selectRelatedSort(videos, "Z-A");
    expectPrecedes(section as HTMLElement, "Zulu Video", "Page Video 9");
    selectRelatedSort(videos, "New Release");
    expectPrecedes(section as HTMLElement, "Alpha Video", "Middle Video");
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    selectRelatedSort(videos, "Old Release");
    expectPrecedes(section as HTMLElement, "Page Video 9", "Page Video 8");
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Switch to table view" }));
    fireEvent.click(videos.getByRole("button", { name: "Sort by CODE" }));
    expectPrecedes(section as HTMLElement, "Alpha Video", "Middle Video");
    fireEvent.click(videos.getByRole("button", { name: "Sort by TOTAL" }));
    expectPrecedes(section as HTMLElement, "Alpha Video", "Zulu Video");
    fireEvent.click(videos.getByRole("button", { name: "Sort by RATING" }));
    expect(videos.getByRole("columnheader", { name: /RATING/ }))
      .toHaveAttribute("aria-sort", "ascending");
  });

  it("sorts and paginates Performer Related Images locally", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const relatedImages = [
      { id: "image_alpha", title: "Alpha Gallery", releaseDate: "2024-01-01" },
      { id: "image_zulu", title: "Zulu Gallery", releaseDate: "2022-01-01" },
      { id: "image_middle", title: "Middle Gallery", releaseDate: "2023-01-01" },
      { id: "image_page_4", title: "Page Gallery 4", releaseDate: "2021-01-01" },
      { id: "image_page_5", title: "Page Gallery 5", releaseDate: "2020-01-01" },
      { id: "image_page_6", title: "Page Gallery 6", releaseDate: "2019-01-01" },
      { id: "image_page_7", title: "Page Gallery 7", releaseDate: "2018-01-01" },
      { id: "image_page_8", title: "Page Gallery 8", releaseDate: "2017-01-01" },
      { id: "image_page_9", title: "Page Gallery 9", releaseDate: "2016-01-01" },
      { id: "image_page_10", title: "Page Gallery 10", releaseDate: "2015-01-01" },
      { id: "image_page_11", title: "Page Gallery 11", releaseDate: "2014-01-01" },
      { id: "image_page_12", title: "Page Gallery 12", releaseDate: "2013-01-01" },
      { id: "image_missing", title: "Missing Date Gallery", releaseDate: "" },
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Sorted Image Performer",
          relatedImagesJson: JSON.stringify(
            relatedImages.map((image) => ({
              recordId: image.id,
              titleSnapshot: image.title,
            })),
          ),
        });
      }
      if (command === "image_list") {
        return relatedImages.map((image) =>
          persistedImage({
            id: image.id,
            title: image.title,
            releaseDate: image.releaseDate,
            publisherLabel: `${image.title} Label`,
            imageCount: 20,
          }),
        );
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Sorted Image Performer")).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(section).not.toBeNull();
    const images = within(section as HTMLElement);

    expect(images.getByText("Alpha Gallery")).toBeInTheDocument();
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    expect(images.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(images.queryByRole("button", { name: "Page 2" })).not.toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Related items per page"), { target: { value: "40" } });
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    expect(images.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Search related items"), {
      target: { value: "zulu" },
    });
    expect(images.getByText("Showing 1-1 of 1 filtered from 13")).toBeInTheDocument();
    expect(images.getByText("Zulu Gallery")).toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Search related items"), {
      target: { value: "" },
    });
    fireEvent.change(images.getByLabelText("Related items per page"), { target: { value: "20" } });

    selectRelatedSort(images, "A-Z");
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Middle Gallery");
    selectRelatedSort(images, "Z-A");
    expectPrecedes(section as HTMLElement, "Zulu Gallery", "Page Gallery 9");
    selectRelatedSort(images, "New Release");
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Middle Gallery");
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    selectRelatedSort(images, "Old Release");
    expectPrecedes(section as HTMLElement, "Page Gallery 9", "Page Gallery 8");
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    fireEvent.click(images.getByRole("button", { name: "Switch to table view" }));
    fireEvent.click(images.getByRole("button", { name: "Sort by CODE" }));
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Middle Gallery");
    fireEvent.click(images.getByRole("button", { name: "Sort by TOTAL" }));
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Zulu Gallery");
    fireEvent.click(images.getByRole("button", { name: "Sort by RATING" }));
    expect(images.getByRole("columnheader", { name: /RATING/ }))
      .toHaveAttribute("aria-sort", "ascending");
  });

  it("creates a video through Tauri commands without exposing the internal id", async () => {
    window.history.pushState({}, "", "/videos/new");
    setManagedCategories(["Typed Category"]);
    const created = persistedVideo({
      title: "Created Video",
      categoriesJson: '["Typed Category"]',
      ratingJson: '{"rewatch":4}',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "video_create") {
          expect(args.input.title).toBe("Created Video");
          expect(args.input.categoriesJson).toBe('["Typed Category"]');
          expect(args.input.relatedPerformersJson).toBe("[]");
          expect(args.input.sourceLinksJson).toBe(
            '[{"title":"Official source","url":"https://example.invalid/video"}]',
          );
          return created;
        }
        if (command === "video_get") {
          return created;
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }
        if (command === "managed_category_list") {
          return [
            managedCategoryFixture({ key: "cat_classic", name: "Classic" }),
            managedCategoryFixture({ key: "cat_drama", name: "Drama" }),
          ];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Created Video" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: " Official source " },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: " https://example.invalid/video " },
    });
    fillVideoRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Created Video")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("video_test_001")).not.toBeInTheDocument();
  });

  it("saves detected Video Tech Info and availability from a typed media path", async () => {
    window.history.pushState({}, "", "/videos/new");
    const created = persistedVideo({
      title: "Detected Video",
      availability: "Owned",
      mediaPath: "D:/Media/detected.mp4",
      durationMinutes: 24,
      resolution: "1920x1080",
      fileSizeBytes: 4096,
      fileType: "MP4",
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "media_metadata_probe") {
          expect(args.path).toBe("D:/Media/detected.mp4");
          return {
            path: args.path,
            status: "exists",
            kind: "file",
            fileSizeBytes: 4096,
            fileType: "MP4",
            durationMinutes: 24,
            width: 1920,
            height: 1080,
            resolution: "1920x1080",
            message: "Metadata checked",
          };
        }
        if (command === "video_create") {
          expect(args.input.availability).toBe("Owned");
          expect(args.input.mediaPath).toBe("D:/Media/detected.mp4");
          expect(args.input.durationMinutes).toBe(24);
          expect(args.input.resolution).toBe("1920x1080");
          expect(args.input.fileSizeBytes).toBe(4096);
          expect(args.input.fileType).toBe("MP4");
          return created;
        }
        if (command === "video_get") {
          return created;
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Detected Video" },
    });
    fireEvent.change(screen.getByLabelText("Media Path"), {
      target: { value: "D:/Media/detected.mp4" },
    });
    fillVideoRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Detected Video")).toBeInTheDocument();
  });

  it("shows Video detection fallbacks without hiding detected file size and type", async () => {
    window.history.pushState({}, "", "/videos/new");
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "media_metadata_probe") {
          expect(args.path).toBe("D:/Media/detected.mp4");
          return {
            path: args.path,
            status: "exists",
            kind: "file",
            fileSizeBytes: 4096,
            fileType: "MP4",
            durationMinutes: null,
            width: null,
            height: null,
            resolution: null,
            message: "Metadata checked",
          };
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText("Media Path"), {
      target: { value: "D:/Media/detected.mp4" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect" }));

    expect(
      await screen.findByText(
        "Tech Info checked from the Media Path. Save to persist these values.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Duration")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Duration")).toHaveAttribute(
      "placeholder",
      "n/a",
    );
    expect(screen.getByLabelText("Resolution")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Resolution")).toHaveAttribute(
      "placeholder",
      "n/a",
    );
    expect(screen.getByLabelText("File Size")).toHaveDisplayValue("4096");
    expect(screen.getByLabelText("File Type")).toHaveDisplayValue("MP4");
  });

  it("shows detected Video duration and resolution from the metadata command", async () => {
    window.history.pushState({}, "", "/videos/new");
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "media_metadata_probe") {
          expect(args.path).toBe("D:/Media/detected.mp4");
          return {
            path: args.path,
            status: "exists",
            kind: "file",
            fileSizeBytes: 4096,
            fileType: "MP4",
            durationMinutes: 24,
            width: 1920,
            height: 1080,
            resolution: "1920x1080",
            message: "Metadata checked",
          };
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText("Media Path"), {
      target: { value: "D:/Media/detected.mp4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect" }));

    expect(
      await screen.findByText(
        "Tech Info checked from the Media Path. Save to persist these values.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Duration")).toHaveDisplayValue("24");
    expect(screen.getByLabelText("Resolution")).toHaveDisplayValue("1920x1080");
    expect(screen.getByLabelText("File Size")).toHaveDisplayValue("4096");
    expect(screen.getByLabelText("File Type")).toHaveDisplayValue("MP4");
  });

  it("renders the Video form category picker and serializes selected labels", async () => {
    window.history.pushState({}, "", "/videos/new");
    setManagedCategories(["Classic", "Drama"]);
    const created = persistedVideo({
      title: "Picker Video",
      categoriesJson: '["Drama"]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "video_create") {
          expect(args.input.categoriesJson).toBe('["Drama"]');
          expect(args.input).not.toHaveProperty("categoryIds");
          return created;
        }
        if (command === "video_get") {
          return created;
        }
        if (command === "performer_list" || command === "image_list") {
          return [];
        }
        if (command === "managed_category_list") {
          return [managedCategoryFixture({ key: "cat_updated", name: "Updated" })];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(screen.getByTestId("category-picker-field")).toBeInTheDocument();
    expect(screen.getByText("No categories selected.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText(
      "Search categories, genre, setting, attribute...",
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Classic" }))
      .not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("textbox", { name: "Search categories" }));
    expect(screen.getByRole("button", { name: "Add Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Drama" })).toBeInTheDocument();
    expect(screen.queryByText((_, element) => element?.tagName === "MARK"))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Category" })).toHaveAttribute(
      "href",
      "/settings/category-management",
    );
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoryIds|category_ids/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /category/i }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "clas" },
    });
    expect(screen.getByText("Clas").tagName.toLowerCase()).toBe("mark");
    fireEvent.click(screen.getByRole("button", { name: "Add Classic" }));
    expect(screen.getByText("Classic")).toBeInTheDocument();
    expect(screen.getByText("1 category selected.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "classic" },
    });
    expect(screen.queryByRole("button", { name: "Add Classic" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Classic" }));
    expect(screen.getByText("No categories selected.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "missing" },
    });
    expect(screen.getByText(
      "No matching Managed Categories. Use Manage Category to add it first.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add missing" }))
      .not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "Drama" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Drama" }));
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Picker Video" },
    });
    fillVideoRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Picker Video")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
  }, 10000);

  it("renders category picker results in deterministic scroll-loaded batches", async () => {
    window.history.pushState({}, "", "/videos/new");
    setManagedCategories(
      Array.from({ length: 35 }, (_, index) =>
        `Batch Category ${String(index + 1).padStart(2, "0")}`,
      ),
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(screen.queryByTestId("category-result-row")).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole("textbox", { name: "Search categories" }));

    let rows = screen.getAllByTestId("category-result-row");
    expect(rows).toHaveLength(30);
    expect(rows[0]).toHaveTextContent("Batch Category 01");
    expect(rows[29]).toHaveTextContent("Batch Category 30");
    expect(screen.queryByRole("button", { name: "Add Batch Category 31" }))
      .not.toBeInTheDocument();

    fireEvent.scroll(rows[0].parentElement as HTMLElement);

    rows = screen.getAllByTestId("category-result-row");
    expect(rows).toHaveLength(35);
    expect(rows[30]).toHaveTextContent("Batch Category 31");
    expect(rows[34]).toHaveTextContent("Batch Category 35");
  });

  it("shows managed category parent paths and keeps search text after selection", async () => {
    window.history.pushState({}, "", "/videos/new");
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_bodytype",
            name: "Bodytype",
          }),
          managedCategoryFixture({
            key: "cat_slim",
            name: "Slim",
            parentKey: "cat_bodytype",
          }),
        ];
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const search = screen.getByRole("textbox", { name: "Search categories" });
    expect(search).toHaveClass("select-text");
    fireEvent.change(search, { target: { value: "body" } });
    expect(screen.queryByRole("button", { name: "Add Bodytype" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Slim" }))
      .not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "slim" } });

    const slimResult = await screen.findByRole("button", { name: "Add Slim" });
    expect(slimResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(slimResult).toHaveTextContent(/Bodytype\s*>\s*Slim/);
    const slimLabel = within(slimResult).getByText("Slim");
    expect(slimLabel.tagName.toLowerCase()).toBe("mark");
    expect(slimLabel.closest("span")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );

    fireEvent.click(slimResult);

    expect(search).toHaveValue("slim");
    expect(screen.getByText("Slim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Slim" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear category search" }));
    expect(search).toHaveValue("");
  });

  it.each([
    {
      path: "/videos/new",
      visible: "Video Only",
      hidden: "Image Only",
      showInVideos: true,
      showInImages: false,
      showInPerformers: false,
    },
    {
      path: "/images/new",
      visible: "Image Only",
      hidden: "Performer Only",
      showInVideos: false,
      showInImages: true,
      showInPerformers: false,
    },
    {
      path: "/performers/new",
      visible: "Performer Only",
      hidden: "Video Only",
      showInVideos: false,
      showInImages: false,
      showInPerformers: true,
    },
  ])(
    "filters form category picker options by Used In on $path",
    async ({ path, visible, hidden, showInVideos, showInImages, showInPerformers }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (command: string) => {
        if (command === "managed_category_list") {
          return [
            managedCategoryFixture({
              key: `cat_${visible.toLowerCase().replace(/\s+/g, "_")}`,
              name: visible,
              showInVideos,
              showInImages,
              showInPerformers,
            }),
            managedCategoryFixture({
              key: `cat_${hidden.toLowerCase().replace(/\s+/g, "_")}`,
              name: hidden,
              showInVideos: !showInVideos,
              showInImages: !showInImages,
              showInPerformers: !showInPerformers,
            }),
          ];
        }
        if (
          command === "performer_list" ||
          command === "image_list" ||
          command === "video_list"
        ) {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };

      render(<App />);

      const search = screen.getByRole("textbox", { name: "Search categories" });
      fireEvent.change(search, { target: { value: "Only" } });

      expect(await screen.findByRole("button", { name: `Add ${visible}` }))
        .toBeInTheDocument();
      expect(screen.queryByRole("button", { name: `Add ${hidden}` }))
        .not.toBeInTheDocument();
    },
  );

  it("keeps already selected categories visible when they are disabled for the current form", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const existing = persistedVideo({
      title: "Disabled Category Video",
      categoriesJson: '["Image Only"]',
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return existing;
      }
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_image_only",
            name: "Image Only",
            showInVideos: false,
            showInImages: true,
            showInPerformers: false,
          }),
        ];
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Disabled Category Video"))
      .toBeInTheDocument();
    expect(screen.getByText("Image Only")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "Image" },
    });

    expect(screen.queryByRole("button", { name: "Add Image Only" }))
      .not.toBeInTheDocument();
  });

  it("constrains very long category chip text without blocking input selection", async () => {
    window.history.pushState({}, "", "/videos/new");
    const longCategory = "a".repeat(96);
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return [
          managedCategoryFixture({
            key: "cat_long",
            name: longCategory,
          }),
        ];
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const titleInput = screen.getByLabelText(/^Title/);
    expect(titleInput).toHaveClass("select-text");

    const search = screen.getByRole("textbox", { name: "Search categories" });
    fireEvent.change(search, { target: { value: longCategory.slice(0, 12) } });
    fireEvent.click(await screen.findByRole("button", { name: `Add ${longCategory}` }));

    const chipText = screen.getByText(longCategory);
    expect(chipText).toHaveClass("min-w-0", "truncate", "whitespace-nowrap");
    expect(chipText.parentElement).toHaveClass("max-w-full", "min-w-0");
  });

  it("renders existing Video record categories as normalized managed and record-only chips", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    setManagedCategories(["Classic", "Updated"]);
    const existing = persistedVideo({
      title: "Existing Picker Video",
      categoriesJson: '[" Classic ","classic","Legacy","City","Drama","Cute",""]',
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return existing;
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Picker Video"))
      .toBeInTheDocument();
    expect(screen.getAllByText("Classic")).toHaveLength(1);
    expect(screen.getByText("Legacy")).toBeInTheDocument();
    expect(screen.queryByText("Cute")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
    expect(screen.getByText("Cute")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText("Cute")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Cute" }));
    expect(screen.queryByText("Cute")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+1 more" })).not.toBeInTheDocument();
    expect(screen.getByText("4 categories selected.")).toBeInTheDocument();
    expect(screen.queryByText(/Record.only/)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
  });

  it("shows persisted timestamps on video detail", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Timestamped Video",
          releaseDate: "2026-02-02",
          createdAt: "1778611681088",
          updatedAt: "1778611707544",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Timestamped Video")).toBeInTheDocument();
    expect(screen.getByText("Release Date")).toBeInTheDocument();
    expect(screen.getByText("Feb 02, 2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-02-02")).not.toBeInTheDocument();
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getAllByText(formatExpectedLocalTimestamp("1778611681088")).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(formatExpectedLocalTimestamp("1778611707544")).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Created At")).not.toBeInTheDocument();
    expect(screen.queryByText("Updated At")).not.toBeInTheDocument();
    expect(screen.queryByText("1778611681088")).not.toBeInTheDocument();
    expect(screen.queryByText("1778611707544")).not.toBeInTheDocument();
  });

  it("shows Video detail Play button for existing media path status", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Status Video",
          coverPath: "D:/Sakurava/covers/status-video.jpg",
          mediaPath: "D:/Sakurava/videos/status-video.mp4",
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: args.path,
          status: "exists",
          kind: "file",
          message: "Path exists",
        };
      }
      if (command === "open_media_path") {
        expect(args.path).toBe("D:/Sakurava/videos/status-video.mp4");
        return {
          path: args.path,
          opened: true,
          message: "Media file open request sent",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Status Video")).toBeInTheDocument();
    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    expect(await status.findByText("Cover status")).toBeInTheDocument();
    expect(status.getByText("Media status")).toBeInTheDocument();
    await waitFor(() => expect(status.getAllByText("Available")).toHaveLength(2));
    expect(status.queryByText("File is available")).not.toBeInTheDocument();
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    const playButton = screen.getByRole("button", { name: "Play" });
    expect(playButton).toBeEnabled();
    fireEvent.click(playButton);
    expect(await screen.findByText("Opening with default app.")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
      "open_media_path",
      { path: "D:/Sakurava/videos/status-video.mp4" },
      undefined,
    );
    expect(within(statusSection as HTMLElement).queryByRole("button", { name: /Open folder/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps Video detail Play disabled when media path status is missing", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Missing Media Video",
          coverPath: "D:/Sakurava/covers/missing-video.jpg",
          mediaPath: "D:/Sakurava/videos/missing-video.mp4",
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: args.path,
          status: args.path.includes("missing-video.mp4") ? "missing" : "exists",
          kind: args.path.includes("missing-video.mp4") ? "unknown" : "file",
          message: args.path.includes("missing-video.mp4")
            ? "Path does not exist"
            : "Path exists",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Missing Media Video")).toBeInTheDocument();
    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    await waitFor(() => expect(status.getByText("Missing")).toBeInTheDocument());
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(invoke).not.toHaveBeenCalledWith(
      "open_media_path",
      expect.anything(),
      expect.anything(),
    );
  });

  it("shows safe feedback when Video detail Play fails", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        return persistedVideo({
          title: "Open Failure Video",
          mediaPath: "D:/Sakurava/videos/open-failure.mp4",
        });
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: args.path,
          status: args.path.includes("open-failure.mp4") ? "exists" : "notSet",
          kind: args.path.includes("open-failure.mp4") ? "file" : "unknown",
          message: args.path.includes("open-failure.mp4")
            ? "Path exists"
            : "Path is not set",
        };
      }
      if (command === "open_media_path") {
        throw new Error("raw platform error");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Open Failure Video")).toBeInTheDocument();
    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    const playButton = await screen.findByRole("button", { name: "Play" });
    await waitFor(() => expect(playButton).toBeEnabled());
    fireEvent.click(playButton);

    expect(await screen.findByText("Media file could not be opened")).toBeInTheDocument();
    expect(screen.queryByText("raw platform error")).not.toBeInTheDocument();
  });

  it("shows Image detail compact not set statuses safely", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        return persistedImage({
          title: "Status Image",
          coverPath: "",
          folderPath: "D:/Sakurava/images/missing-folder",
          galleryImagePathsJson: "[]",
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }
      if (command === "path_status_check") {
        return {
          path: args.path,
          status: "missing",
          kind: "unknown",
          message: "Path does not exist",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Status Image")).toBeInTheDocument();
    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    expect(await status.findByText("Cover status")).toBeInTheDocument();
    expect(status.getByText("Gallery status")).toBeInTheDocument();
    await waitFor(() => expect(status.getAllByText("N/A")).toHaveLength(2));
    expect(status.queryByText("Not set")).not.toBeInTheDocument();
    expect(status.queryByText("Folder status")).not.toBeInTheDocument();
    expect(status.queryByText("Missing")).not.toBeInTheDocument();
    expect(status.queryByText("No path saved")).not.toBeInTheDocument();
    expect(status.queryByText("Saved path was not found")).not.toBeInTheDocument();
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "image_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("shows Performer detail cover path status", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        return persistedPerformer({
          name: "Status Performer",
          coverPath: "D:/Sakurava/performers/status-cover.jpg",
        });
      }
      if (command === "path_status_check") {
        return {
          path: args.path,
          status: "exists",
          kind: "file",
          message: "Path exists",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Status Performer")).toBeInTheDocument();
    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    expect(await status.findByText("Profile image status")).toBeInTheDocument();
    await waitFor(() => expect(status.getByText("Available")).toBeInTheDocument());
    expect(status.queryByText("File is available")).not.toBeInTheDocument();
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
  });

  it("shows browser preview fallback for static detail path status", async () => {
    window.history.pushState({}, "", "/videos/sample-id");

    render(<App />);

    const statusSection = screen.getByText("System Info").closest("section");
    expect(statusSection).not.toBeNull();
    const status = within(statusSection as HTMLElement);

    expect(await status.findAllByText("N/A")).toHaveLength(4);
    expect(status.queryByText("Unknown")).not.toBeInTheDocument();
    expect(status.queryByText("Status check not available")).not.toBeInTheDocument();
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it.each([
    {
      path: "/videos/video_test_001",
      title: "Read Only Detail Video",
      heading: "Video Detail",
      getCommand: "video_get",
      record: persistedVideo({ title: "Read Only Detail Video" }),
    },
    {
      path: "/images/image_test_001",
      title: "Read Only Detail Image",
      heading: "Image Detail",
      getCommand: "image_get",
      record: persistedImage({ title: "Read Only Detail Image" }),
    },
    {
      path: "/performers/performer_test_001",
      title: "Read Only Detail Performer",
      heading: "Performer Detail",
      getCommand: "performer_get",
      record: persistedPerformer({ name: "Read Only Detail Performer" }),
    },
  ])("does not render Delete on $heading pages", async ({ path, title, heading, getCommand, record }) => {
    window.history.pushState({}, "", path);
    const invoke = vi.fn(async (command: string) => {
      if (command === getCommand) return record;
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "video_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Delete/i })).not.toBeInTheDocument();
  });

  it.each([
    ["/videos/new", "Video Create Form"],
    ["/images/new", "Image Create Form"],
    ["/performers/new", "Performer Create Form"],
  ])("does not render Delete on create form %s", async (path, formLabel) => {
    window.history.pushState({}, "", path);
    const invoke = vi.fn(async (command: string) => {
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "video_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByRole("form", { name: formLabel })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/video_test_001/edit",
      title: "Editable Delete Video",
      formLabel: "Video Edit Form",
      getCommand: "video_get",
      record: persistedVideo({ title: "Editable Delete Video" }),
    },
    {
      path: "/images/image_test_001/edit",
      title: "Editable Delete Image",
      formLabel: "Image Edit Form",
      getCommand: "image_get",
      record: persistedImage({ title: "Editable Delete Image" }),
    },
    {
      path: "/performers/performer_test_001/edit",
      title: "Editable Delete Performer",
      formLabel: "Performer Edit Form",
      getCommand: "performer_get",
      record: persistedPerformer({ name: "Editable Delete Performer" }),
    },
  ])("renders Delete on $formLabel", async ({ path, title, formLabel, getCommand, record }) => {
    window.history.pushState({}, "", path);
    const invoke = vi.fn(async (command: string) => {
      if (command === getCommand) return record;
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "video_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue(title)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: formLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("opens edit form delete confirmation with item-specific safety copy", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const nativeConfirm = vi.spyOn(window, "confirm");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") return persistedVideo({ title: "Delete Candidate Video" });
      if (command === "performer_list" || command === "image_list" || command === "managed_category_list") {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Delete Candidate Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", {
      name: "Delete Delete Candidate Video?",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog-backdrop")).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Delete Delete Candidate Video?")).toBeInTheDocument();
    expect(
      screen.getByText(/removes the saved Sakurava record for Delete Candidate Video/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not delete local media files/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    nativeConfirm.mockRestore();
  });

  it("cancels edit form delete confirmation without calling the delete command", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") return persistedVideo({ title: "Cancel Delete Video" });
      if (command === "performer_list" || command === "image_list" || command === "managed_category_list") {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Cancel Delete Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Delete Cancel Delete Video?" }))
      .not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_delete",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    {
      path: "/videos/video_test_001/edit",
      title: "Deletable Video",
      getCommand: "video_get",
      deleteCommand: "video_delete",
      listCommand: "video_list",
      collectionPath: "/videos",
      collectionHeading: "Videos",
      record: persistedVideo({ title: "Deletable Video" }),
    },
    {
      path: "/images/image_test_001/edit",
      title: "Deletable Image",
      getCommand: "image_get",
      deleteCommand: "image_delete",
      listCommand: "image_list",
      collectionPath: "/images",
      collectionHeading: "Images",
      record: persistedImage({ title: "Deletable Image" }),
    },
    {
      path: "/performers/performer_test_001/edit",
      title: "Deletable Performer",
      getCommand: "performer_get",
      deleteCommand: "performer_delete",
      listCommand: "performer_list",
      collectionPath: "/performers",
      collectionHeading: "Performers",
      record: persistedPerformer({ name: "Deletable Performer" }),
    },
  ])(
    "confirms delete with $deleteCommand and redirects to $collectionPath",
    async ({
      path,
      title,
      getCommand,
      deleteCommand,
      listCommand,
      collectionPath,
      collectionHeading,
      record,
    }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(
        async (command: string, args: Record<string, any> = {}) => {
          if (command === getCommand) {
            return record;
          }
          if (command === deleteCommand) {
            return { id: args.id, deleted: true };
          }
          if (
            command === listCommand ||
            command === "performer_list" ||
            command === "image_list" ||
            command === "video_list" ||
            command === "managed_category_list"
          ) {
            return [];
          }

          throw new Error(`Unexpected command ${command}`);
        },
      ) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(await screen.findByDisplayValue(title)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      const deleteDialog = await screen.findByRole(
        "dialog",
        {},
        { timeout: 5_000 },
      );
      fireEvent.click(
        within(deleteDialog).getByRole("button", { name: "Delete" }),
      );

      await waitFor(() => expect(window.location.pathname).toBe(collectionPath));
      expect(
        await screen.findByRole("heading", { name: collectionHeading }),
      ).toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith(
        deleteCommand,
        { id: path.split("/")[2] },
        undefined,
      );
    },
  );

  it("shows an error and stays on edit form when delete returns false", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "image_get") {
          return persistedImage({ title: "Failed Delete Image" });
        }
        if (command === "image_delete") {
          return { id: args.id, deleted: false };
        }
        if (
          command === "performer_list" ||
          command === "video_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Failed Delete Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const deleteDialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "Delete" }),
    );

    expect(
      await screen.findByText(
        "Image delete failed. The saved Sakurava record was not removed.",
      ),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/images/image_test_001/edit");
    expect(screen.getByRole("form", { name: "Image Edit Form" })).toBeInTheDocument();
  });

  it("disables delete confirmation while pending and prevents duplicate submits", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    let resolveDelete: (value: { id: string; deleted: boolean }) => void = () => {};
    const deletePromise = new Promise<{ id: string; deleted: boolean }>((resolve) => {
      resolveDelete = resolve;
    });
    const invokeMock = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "performer_get") {
          return persistedPerformer({ name: "Pending Delete Performer" });
        }
        if (command === "performer_delete") {
          return deletePromise;
        }
        if (
          command === "performer_list" ||
          command === "image_list" ||
          command === "video_list"
        ) {
          return [];
        }
        if (command === "managed_category_list") {
          return [
            managedCategoryFixture({
              key: "cat_typed_category",
              name: "Typed Category",
            }),
          ];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    );
    window.__TAURI_INTERNALS__ = {
      invoke: invokeMock as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Pending Delete Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    confirmDialog("Delete");

    const pendingButton = await screen.findByRole("button", { name: "Deleting..." });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "performer_delete"),
    ).toHaveLength(1);

    resolveDelete({ id: "performer_test_001", deleted: true });
    await waitFor(() => expect(window.location.pathname).toBe("/performers"));
  });

  it("does not add bulk, checkbox, or row delete behavior to edit form delete", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({ title: "Single Delete Only Video" });
      }
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "managed_category_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Single Delete Only Video")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /delete|select/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bulk|select all/i }))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  });

  it("toggles Video detail favorite and reopens edit form with the saved value", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    let currentVideo = persistedVideo({
      title: "Favorite Detail Video",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return currentVideo;
      }
      if (command === "video_update") {
        expect(args.id).toBe("video_test_001");
        expect(args.patch).toEqual({ favorite: false });
        currentVideo = { ...currentVideo, favorite: false };
        return currentVideo;
      }
      if (
        command === "performer_list" ||
        command === "image_list" ||
        command === "media_metadata_probe"
      ) {
        return command === "media_metadata_probe"
          ? {
              path: args.path,
              status: "notSet",
              kind: "unknown",
              fileSizeBytes: null,
              fileType: "",
              durationMinutes: null,
              width: null,
              height: null,
              resolution: null,
              message: "No path set",
            }
          : [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Favorite Detail Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "video_update",
        { id: "video_test_001", patch: { favorite: false } },
        undefined,
      );
    });
    expect(screen.getByRole("button", { name: "Add to Favorites" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Edit" }));

    const favoriteCheckbox = await screen.findByRole("checkbox", {
      name: "Favorite",
    });
    expect(favoriteCheckbox).not.toBeChecked();
  });

  it("toggles Image detail favorite and reopens edit form with the saved value", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    let currentImage = persistedImage({
      title: "Favorite Detail Image",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return currentImage;
      }
      if (command === "image_update") {
        expect(args.id).toBe("image_test_001");
        expect(args.patch).toEqual({ favorite: false });
        currentImage = { ...currentImage, favorite: false };
        return currentImage;
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Favorite Detail Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "image_update",
        { id: "image_test_001", patch: { favorite: false } },
        undefined,
      );
    });
    expect(screen.getByRole("button", { name: "Add to Favorites" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Edit" }));

    const favoriteCheckbox = await screen.findByRole("checkbox", {
      name: "Favorite",
    });
    expect(favoriteCheckbox).not.toBeChecked();
  });

  it("toggles Performer detail favorite and reopens edit form with the saved value", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    let currentPerformer = persistedPerformer({
      name: "Favorite Detail Performer",
      favorite: true,
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return currentPerformer;
      }
      if (command === "performer_update") {
        expect(args.id).toBe("performer_test_001");
        expect(args.patch).toEqual({ favorite: false });
        currentPerformer = { ...currentPerformer, favorite: false };
        return currentPerformer;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(
      await screen.findByText("Favorite Detail Performer"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Favorites" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        "performer_update",
        { id: "performer_test_001", patch: { favorite: false } },
        undefined,
      );
    });
    expect(screen.getByRole("button", { name: "Add to Favorites" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Edit" }));

    const favoriteCheckbox = await screen.findByRole("checkbox", {
      name: "Favorite",
    });
    expect(favoriteCheckbox).not.toBeChecked();
  });

  it("rolls back Video detail favorite when the save fails", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        expect(args.id).toBe("video_test_001");
        return persistedVideo({
          title: "Favorite Failure Video",
          favorite: true,
        });
      }
      if (command === "video_update") {
        throw new Error("favorite update failed");
      }
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Favorite Failure Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Favorites" }));

    expect(
      await screen.findByText(
        "Favorite update failed. The saved record was not changed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from Favorites" }))
      .toBeInTheDocument();
  });

  it("loads and updates a video through Tauri commands", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedVideo({
      title: "Existing Video",
      categoriesJson: '["Classic"]',
      ratingJson: '{"rewatch":3}',
      sourceLinksJson:
        '[{"title":"Existing source","url":"https://example.invalid/old-video"}]',
    });
    const updated = persistedVideo({
      title: "Updated Video",
      categoriesJson: '["Classic","Updated"]',
      ratingJson: '{"rewatch":5}',
      sourceLinksJson:
        '[{"title":"Updated source","url":"https://example.invalid/new-video"}]',
    });
    let currentVideo = existing;
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "media_metadata_probe") {
          return {
            path: args.path,
            status: "notSet",
            kind: "unknown",
            fileSizeBytes: null,
            fileType: "",
            durationMinutes: null,
            width: null,
            height: null,
            resolution: null,
            message: "No path set",
          };
        }
        if (command === "video_get") {
          expect(args.id).toBe("video_test_001");
          return currentVideo;
        }
        if (command === "video_update") {
          expect(args.id).toBe("video_test_001");
          expect(args.patch.title).toBe("Updated Video");
          expect(args.patch.categoriesJson).toBe('["Classic","Updated"]');
          expect(args.patch.relatedPerformersJson).toBe("[]");
          expect(args.patch.sourceLinksJson).toBe(
            '[{"title":"Updated source","url":"https://example.invalid/new-video"}]',
          );
          expect(args.patch.ratingJson).toContain('"rewatch":5');
          currentVideo = updated;
          return updated;
        }
        if (command === "video_list") {
          return [currentVideo];
        }
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Video")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing source")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.invalid/old-video"))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Updated Video" },
    });
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "Updated source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/new-video" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fillVideoRatingFields({ Rewatch: "5" });
    clickSaveAndConfirm();

    expect(await screen.findByText("Updated Video")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("video_test_001")).not.toBeInTheDocument();
  });

  it("loads image collection from the Tauri command boundary when available", async () => {
    window.history.pushState({}, "", "/images");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [persistedImage({ title: "Persisted Image" })];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Persisted Image")).toBeInTheDocument();
    expect(screen.getByText("1 image")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("image_list", {}, undefined);
  });

  it("creates an image through Tauri commands without exposing the internal id", async () => {
    window.history.pushState({}, "", "/images/new");
    setManagedCategories(["Typed Category"]);
    const created = persistedImage({
      title: "Created Image",
      categoriesJson: '["Typed Category"]',
      ratingJson: '{"memorability":4}',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "image_create") {
          expect(args.input.title).toBe("Created Image");
          expect(args.input.categoriesJson).toBe('["Typed Category"]');
          expect(args.input.galleryImagePathsJson).toBe(
            '["C:/Gallery/one.jpg","C:/Gallery/two.jpg"]',
          );
          expect(args.input.relatedPerformersJson).toBe("[]");
          expect(args.input.sourceLinksJson).toBe(
            '[{"title":"Image source","url":"https://example.invalid/image"}]',
          );
          return created;
        }
        if (command === "image_get") {
          return created;
        }
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue([
      " C:/Gallery/one.jpg ",
      "",
      "C:/Gallery/two.jpg",
      "C:/Gallery/one.jpg",
    ]);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Created Image" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    expect(await screen.findByDisplayValue("C:/Gallery/one.jpg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:/Gallery/two.jpg")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "Image source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/image" },
    });
    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Created Image")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  }, 15_000);

  it("saves detected Image Tech Info and availability from a typed image path", async () => {
    window.history.pushState({}, "", "/images/new");
    const created = persistedImage({
      title: "Detected Image",
      availability: "Owned",
      imageCount: 1,
      galleryImagePathsJson: '["D:/Images/one.jpg"]',
      mainResolution: "1200 x 800",
      totalFileSizeBytes: 2048,
      mainFileType: "JPG",
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "media_metadata_probe") {
          expect(args.path).toBe("D:/Images/one.jpg");
          return {
            path: args.path,
            status: "exists",
            kind: "file",
            fileSizeBytes: 2048,
            fileType: "JPG",
            width: 1200,
            height: 800,
            resolution: "1200 x 800",
            message: "Metadata checked",
          };
        }
        if (command === "image_create") {
          expect(args.input.availability).toBe("Owned");
          expect(args.input.imageCount).toBe(1);
          expect(args.input.galleryImagePathsJson).toBe('["D:/Images/one.jpg"]');
          expect(args.input.mainResolution).toBe("1200 x 800");
          expect(args.input.totalFileSizeBytes).toBe(2048);
          expect(args.input.mainFileType).toBe("JPG");
          return created;
        }
        if (command === "image_get") {
          return created;
        }
        if (command === "performer_list" || command === "video_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };
    dialogMocks.open.mockResolvedValue("D:/Images/one.jpg");

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Detected Image" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    expect(await screen.findByDisplayValue("D:/Images/one.jpg")).toBeInTheDocument();
    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Detected Image")).toBeInTheDocument();
  });

  it("renders the Image form category picker", () => {
    window.history.pushState({}, "", "/images/new");
    setManagedCategories(["Portrait"]);

    render(<App />);

    expect(screen.getByTestId("category-picker-field")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText(
      "Search categories, face, body, pose, setting...",
    )).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "por" },
    });
    expect(screen.getByRole("button", { name: "Add Portrait" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Category" })).toHaveAttribute(
      "href",
      "/settings/category-management",
    );
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
  });

  it("replaces image Gallery Images rows from a browsed gallery folder", async () => {
    window.history.pushState({}, "", "/images/new");
    dialogMocks.open.mockResolvedValue("C:/GalleryFolder");
    const created = persistedImage({
      title: "Folder Gallery Image",
      galleryImagePathsJson:
        '["C:/GalleryFolder/a.JPG","C:/GalleryFolder/b.png","C:/GalleryFolder/c.webp"]',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "gallery_folder_images_list") {
          expect(args.folderPath).toBe("C:/GalleryFolder");
          return {
            folderPath: "C:/GalleryFolder",
            imagePaths: [
              "C:/GalleryFolder/a.JPG",
              "C:/GalleryFolder/b.png",
              "C:/GalleryFolder/c.webp",
            ],
          };
        }
        if (command === "image_create") {
          expect(args.input.title).toBe("Folder Gallery Image");
          expect(args.input.galleryImagePathsJson).toBe(
            '["C:/GalleryFolder/a.JPG","C:/GalleryFolder/b.png","C:/GalleryFolder/c.webp"]',
          );
          return created;
        }
        if (command === "image_get") {
          return created;
        }
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Folder Gallery Image" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add Folder" }),
    );

    expect(
      await screen.findByDisplayValue("C:/GalleryFolder/a.JPG"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:/GalleryFolder/b.png")).toBeInTheDocument();
    expect(
      screen.getByText("Loaded 3 Gallery Path rows."),
    ).toBeInTheDocument();
    expect(dialogMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Browse Gallery Folder",
        multiple: false,
        directory: true,
      }),
    );

    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Folder Gallery Image")).toBeInTheDocument();
  });

  it("confirms before replacing existing image Gallery Images rows from a folder", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    dialogMocks.open.mockResolvedValue("C:/Replacement");
    const existing = persistedImage({
      title: "Existing Gallery Image",
      galleryImagePathsJson: '["C:/Old/one.jpg"]',
    });
    const updated = persistedImage({
      title: "Existing Gallery Image",
      galleryImagePathsJson: '["C:/Replacement/new.gif"]',
    });
    let currentImage = existing;
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "image_get") {
          return currentImage;
        }
        if (command === "gallery_folder_images_list") {
          expect(args.folderPath).toBe("C:/Replacement");
          return {
            folderPath: "C:/Replacement",
            imagePaths: ["C:/Replacement/new.gif"],
          };
        }
        if (command === "image_update") {
          expect(args.patch.galleryImagePathsJson).toBe(
            '["C:/Replacement/new.gif"]',
          );
          currentImage = updated;
          return updated;
        }
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("C:/Old/one.jpg")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add Folder" }),
    );

    expect(await screen.findByRole("dialog", { name: "Replace Gallery Path?" }))
      .toBeInTheDocument();
    confirmDialog("Replace");
    expect(
      await screen.findByDisplayValue("C:/Replacement/new.gif"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("C:/Old/one.jpg")).not.toBeInTheDocument();

    fillImageRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Existing Gallery Image")).toBeInTheDocument();
  }, 10000);

  it("does not mutate image gallery rows when Add Folder is canceled", async () => {
    window.history.pushState({}, "", "/images/new");
    dialogMocks.open.mockResolvedValue(null);
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Folder" }));

    await waitFor(() => expect(dialogMocks.open).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No Gallery Path rows added.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "gallery_folder_images_list",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_create",
      expect.anything(),
      expect.anything(),
    );
  });

  it("adds selected image files to Gallery Path rows without mutating Cover Path", async () => {
    window.history.pushState({}, "", "/images/new");
    dialogMocks.open.mockResolvedValue([
      "C:/Gallery/one.jpg",
      "C:/Gallery/two.png",
      "C:/Gallery/one.jpg",
    ]);
    const probedPaths: string[] = [];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "media_metadata_probe") {
        probedPaths.push(args.path);
        return {
          path: args.path,
          status: "exists",
          kind: "file",
          fileSizeBytes: args.path.endsWith("one.jpg") ? 1000 : 2000,
          fileType: args.path.endsWith("one.jpg") ? "JPG" : "PNG",
          width: args.path.endsWith("one.jpg") ? 1200 : 800,
          height: args.path.endsWith("one.jpg") ? 800 : 600,
          resolution: args.path.endsWith("one.jpg") ? "1200 x 800" : "800 x 600",
          message: "Metadata checked",
        };
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText("Cover Path"), {
      target: { value: "C:/Cover/cover.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));

    expect(await screen.findByDisplayValue("C:/Gallery/one.jpg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:/Gallery/two.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Cover Path")).toHaveDisplayValue("C:/Cover/cover.jpg");
    expect(screen.getByLabelText("Image Count")).toHaveDisplayValue("2");
    expect(screen.getByLabelText("Main Resolution")).toHaveDisplayValue("1200 x 800");
    expect(screen.getByLabelText("Total File Size")).toHaveDisplayValue("3000");
    expect(screen.getByLabelText("Main File Type")).toHaveDisplayValue("JPG");
    expect(probedPaths).toEqual(["C:/Gallery/one.jpg", "C:/Gallery/two.png"]);
    expect(dialogMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Select Image Files",
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"],
          },
        ],
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "image_create",
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not mutate image gallery rows when Add Images is canceled", async () => {
    window.history.pushState({}, "", "/images/new");
    dialogMocks.open.mockResolvedValue(null);
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));

    await waitFor(() => expect(dialogMocks.open).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No Gallery Path rows added.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gallery Image Path 1")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "image_create",
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not drive Image Tech Info from Cover Path detection", async () => {
    window.history.pushState({}, "", "/images/new");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText("Cover Path"), {
      target: { value: "C:/Cover/cover.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Image Count")).toHaveDisplayValue("");
    });
    expect(screen.getByLabelText("Main Resolution")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Total File Size")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Main File Type")).toHaveDisplayValue("");
    expect(invoke).not.toHaveBeenCalledWith(
      "media_metadata_probe",
      expect.objectContaining({ path: "C:/Cover/cover.jpg" }),
      expect.anything(),
    );
  });

  it("loads and updates an image through Tauri commands", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedImage({
      title: "Existing Image",
      galleryImagePathsJson:
        '["C:/Gallery/existing-one.jpg","C:/Gallery/existing-two.jpg"]',
      categoriesJson: '["Portrait"]',
      ratingJson: '{"memorability":3}',
      sourceLinksJson:
        '[{"title":"Existing image source","url":"https://example.invalid/old-image"}]',
    });
    const updated = persistedImage({
      title: "Updated Image",
      galleryImagePathsJson: '["C:/Gallery/updated.jpg"]',
      categoriesJson: '["Portrait","Updated"]',
      ratingJson: '{"memorability":5}',
      sourceLinksJson:
        '[{"title":"","url":"https://example.invalid/url-only-image"}]',
    });
    let currentImage = existing;
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "image_get") {
          expect(args.id).toBe("image_test_001");
          return currentImage;
        }
        if (command === "image_update") {
          expect(args.id).toBe("image_test_001");
          expect(args.patch.title).toBe("Updated Image");
          expect(args.patch.categoriesJson).toBe('["Portrait","Updated"]');
          expect(args.patch.galleryImagePathsJson).toBe(
            '["C:/Gallery/updated.jpg","C:/Gallery/existing-two.jpg"]',
          );
          expect(args.patch.relatedPerformersJson).toBe("[]");
          expect(args.patch.sourceLinksJson).toBe(
            '[{"title":"","url":"https://example.invalid/url-only-image"}]',
          );
          expect(args.patch.ratingJson).toContain('"memorability":5');
          currentImage = updated;
          return updated;
        }
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Image")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing image source")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.invalid/old-image"))
      .toBeInTheDocument();
    expect(
      screen.getByDisplayValue("C:/Gallery/existing-one.jpg"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/url-only-image" },
    });
    fireEvent.change(screen.getByLabelText("Gallery Image Path 1"), {
      target: { value: " C:/Gallery/updated.jpg " },
    });
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Updated Image" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fillImageRatingFields({ Memorability: "5" });
    clickSaveAndConfirm();

    expect(
      await screen.findByText("Updated Image", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  }, 10000);

  it("renders image detail gallery paths with load more from saved data", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const galleryPaths = Array.from(
      { length: 40 },
      (_, index) =>
        `C:/Gallery/${String(index + 1).padStart(2, "0")}.jpg`,
    );
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Gallery Detail Image",
          galleryImagePathsJson: JSON.stringify([
            ` ${galleryPaths[0]} `,
            "",
            ...galleryPaths.slice(1),
            galleryPaths[0],
            7,
          ]),
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(await screen.findByText("Gallery Detail Image")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByText("Showing 15 of 40 images")).toBeInTheDocument();
    const initialImages = screen.getAllByRole("img", {
      name: /Gallery image/i,
    });
    expect(initialImages).toHaveLength(15);
    expect(screen.getByTestId("image-detail-gallery-grid")).toHaveClass("lg:grid-cols-5");
    expect(initialImages[0]).toHaveAttribute(
      "src",
      "asset://localhost/C:/Gallery/01.jpg",
    );
    expect(initialImages[0]).toHaveAttribute("loading", "lazy");
    expect(initialImages[1]).toHaveAttribute(
      "src",
      "asset://localhost/C:/Gallery/02.jpg",
    );
    expect(screen.queryByAltText("Gallery image 16")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show All" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("img", { name: /Gallery image/i }),
      ).toHaveLength(30);
    });
    expect(screen.getByText("Showing 30 of 40 images")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show All" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("img", { name: /Gallery image/i }),
      ).toHaveLength(40);
    });
    expect(screen.getByText("Showing 40 of 40 images")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load More" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show All" }),
    ).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "gallery_folder_images_list",
      expect.anything(),
      expect.anything(),
    );
  });

  it("opens image detail gallery images in the reusable global preview viewer", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const galleryPaths = [
      "C:/Gallery/one.jpg",
      "C:/Gallery/two.jpg",
      "C:/Gallery/three.jpg",
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Viewer Gallery Image",
          galleryImagePathsJson: JSON.stringify(galleryPaths),
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };
    render(<App />);

    expect(await screen.findByText("Viewer Gallery Image")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Preview Gallery image 2" }),
    );

    const viewer = await screen.findByRole("dialog", {
      name: "Gallery full-size viewer",
    }, { timeout: 5000 });
    expect(within(viewer).queryByRole("heading")).not.toBeInTheDocument();
    const metadataBar = within(viewer).getByLabelText("Image metadata");
    const actionBar = within(viewer).getByLabelText("Image viewer actions");
    const controlBar = within(viewer).getByLabelText("Image viewer controls");
    expect(viewer).toHaveAttribute("data-theme-surface", "adaptive");
    expect(viewer).toHaveClass("global-image-viewer");
    expect(metadataBar).toBeInTheDocument();
    expect(actionBar).toBeInTheDocument();
    expect(controlBar).toBeInTheDocument();
    expect(metadataBar).toHaveAttribute("data-layout-zone", "viewer-metadata");
    expect(actionBar).toHaveAttribute("data-layout-zone", "viewer-actions");
    expect(controlBar).toHaveAttribute("data-layout-zone", "viewer-controls");
    expect(
      within(actionBar).getByRole("button", {
        name: "Show image viewer shortcuts",
      }),
    ).toBeInTheDocument();
    expect(within(actionBar).getByRole("button", { name: "More image actions" }))
      .toBeInTheDocument();
    expect(within(actionBar).queryByRole("button", { name: "Close gallery viewer" }))
      .not.toBeInTheDocument();
    expect(within(actionBar).getByLabelText("Image aspect ratio"))
      .toHaveTextContent("-");
    expect(within(controlBar).getByRole("button", { name: "Reset gallery image view" }))
      .toBeInTheDocument();
    const bottomDock = within(viewer).getByLabelText("Image viewer bottom dock");
    expect(bottomDock).toHaveClass("viewer-bottom-dock");
    expect(bottomDock).toContainElement(controlBar);
    expect(controlBar).toHaveClass("viewer-control-panel");
    expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();
    expect(within(viewer).getByText("two.jpg")).toBeInTheDocument();
    expect(
      within(viewer).getByAltText("Gallery image 2 full size"),
    ).toHaveAttribute("src", "asset://localhost/C:/Gallery/two.jpg");
    expect(
      within(viewer).getByRole("button", { name: "Previous gallery image" }),
    ).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", { name: "Next gallery image" }),
    ).toBeInTheDocument();
    expect(actionBar).toHaveClass("opacity-100");

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Next gallery image" }),
    );

    expect(within(viewer).getByText("3 / 3")).toBeInTheDocument();
    expect(
      within(viewer).queryByRole("button", { name: "Next gallery image" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();

    const galleryZoomControl = within(viewer).getByLabelText("Gallery image zoom control");
    fireEvent.change(
      within(galleryZoomControl).getByLabelText("Set gallery image zoom percentage"),
      { target: { value: "1" } },
    );
    expect(within(viewer).getAllByText("100%").length).toBeGreaterThan(0);

    fireEvent.click(
      within(galleryZoomControl).getByRole("button", { name: "Zoom in gallery image" }),
    );
    expect(within(viewer).getAllByText("125%").length).toBeGreaterThan(0);
    fireEvent.click(
      within(galleryZoomControl).getByRole("button", { name: "Zoom in gallery image" }),
    );
    expect(within(viewer).getAllByText("150%").length).toBeGreaterThan(0);
    for (let count = 0; count < 10; count += 1) {
      fireEvent.click(
        within(galleryZoomControl).getByRole("button", { name: "Zoom in gallery image" }),
      );
    }
    expect(within(viewer).getAllByText("400%").length).toBeGreaterThan(0);
    expect(
      within(viewer).getByRole("button", {
        name: "Enter full-window gallery mode",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Previous gallery image" }),
    );
    await waitFor(() => {
      expect(within(viewer).getByText("1 / 3")).toBeInTheDocument();
    });
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).toBeInTheDocument();
    expect(
      within(viewer).queryByRole("button", { name: "Previous gallery image" }),
    ).not.toBeInTheDocument();

    try {
      vi.useFakeTimers();
      fireEvent.mouseMove(viewer);
      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(actionBar).toHaveClass("opacity-0");

      fireEvent.mouseMove(viewer);
      expect(actionBar).toHaveClass("opacity-100");

      act(() => {
        vi.advanceTimersByTime(2100);
      });
      expect(actionBar).toHaveClass("opacity-0");

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(actionBar).toHaveClass("opacity-100");
      expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Gallery full-size viewer" }),
    ).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "gallery_folder_images_list",
      expect.anything(),
      expect.anything(),
    );
  });

  it("focuses an existing separate Tauri image viewer window and sends payload", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const eventHarness = createTauriEventHarness();
    const eventOrder: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:app|supports_multiple_windows") {
          return true;
        }

        if (command === "plugin:window|get_all_windows") {
          return ["image-viewer"];
        }

        if (command === "plugin:webview|create_webview_window") {
          throw new Error("Existing viewer window should be reused");
        }

        if (command === "plugin:window|set_focus") {
          expect(args.label).toBe("image-viewer");
          return null;
        }

        if (command === "plugin:event|listen") {
          eventOrder.push(`listen:${args.event}`);
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          eventOrder.push(`emit:${args.event}`);
          expect(args.event).toBe("global-image-viewer:payload");
          expect(args.payload.initialIndex).toBe(1);
          expect(args.payload.openRequestId).toEqual(expect.any(String));
          const ackHandlerId = eventHarness.listenersByEvent.get(
            "global-image-viewer:payload-ack",
          );
          if (ackHandlerId) {
            eventHarness.callbacks.get(ackHandlerId)?.({
              event: "global-image-viewer:payload-ack",
              id: ackHandlerId,
              payload: { openRequestId: args.payload.openRequestId },
            });
          }
          return null;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    await expect(
      openGlobalImageViewerWindow({
        images: [
          { path: "C:/Gallery/one.jpg" },
          { path: "C:/Gallery/two.jpg" },
        ],
        initialIndex: 1,
      }),
    ).resolves.toEqual({ mode: "window" });

    expect(
      vi.mocked(invoke).mock.calls.some(([command, args]) => {
        return (
          command === "plugin:window|set_focus" &&
          (args as { label?: string })?.label === "image-viewer"
        );
      }),
    ).toBe(true);
    expect(
      vi.mocked(invoke).mock.calls.some(([command]) =>
        command === "plugin:webview|create_webview_window"
      ),
    ).toBe(false);
    expect(eventOrder.indexOf("listen:global-image-viewer:payload-ack"))
      .toBeLessThan(eventOrder.indexOf("emit:global-image-viewer:payload"));
  });

  it("opens the same image twice with different global viewer request ids", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const eventHarness = createTauriEventHarness();
    const emittedOpenRequestIds: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:app|supports_multiple_windows") {
          return true;
        }

        if (command === "plugin:window|get_all_windows") {
          return ["image-viewer"];
        }

        if (command === "plugin:window|set_focus") {
          return null;
        }

        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          emittedOpenRequestIds.push(args.payload.openRequestId);
          expect(args.payload.initialIndex).toBe(0);
          expect(args.payload.images[0].path).toBe("C:/Gallery/same.jpg");
          const ackHandlerId = eventHarness.listenersByEvent.get(
            "global-image-viewer:payload-ack",
          );
          if (ackHandlerId) {
            eventHarness.callbacks.get(ackHandlerId)?.({
              event: "global-image-viewer:payload-ack",
              id: ackHandlerId,
              payload: { openRequestId: args.payload.openRequestId },
            });
          }
          return null;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    await openGlobalImageViewerWindow({
      images: [{ path: "C:/Gallery/same.jpg" }],
      initialIndex: 0,
    });
    const firstStoredPayload = JSON.parse(
      window.localStorage.getItem("sakurava.globalImageViewer.payload.v1") ?? "{}",
    );

    await openGlobalImageViewerWindow({
      images: [{ path: "C:/Gallery/same.jpg" }],
      initialIndex: 0,
    });
    const secondStoredPayload = JSON.parse(
      window.localStorage.getItem("sakurava.globalImageViewer.payload.v1") ?? "{}",
    );

    expect(emittedOpenRequestIds).toHaveLength(2);
    expect(emittedOpenRequestIds[0]).toEqual(expect.any(String));
    expect(emittedOpenRequestIds[1]).toEqual(expect.any(String));
    expect(emittedOpenRequestIds[0]).not.toBe(emittedOpenRequestIds[1]);
    expect(firstStoredPayload.openRequestId).toBe(emittedOpenRequestIds[0]);
    expect(secondStoredPayload.openRequestId).toBe(emittedOpenRequestIds[1]);
  });

  it("keeps the existing viewer window when payload delivery does not ack", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const eventHarness = createTauriEventHarness();
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:app|supports_multiple_windows") {
          return true;
        }

        if (command === "plugin:window|get_all_windows") {
          return ["image-viewer"];
        }

        if (command === "plugin:window|set_focus") {
          return null;
        }

        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          throw new Error("emit denied");
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    await expect(
      openGlobalImageViewerWindow({
        images: [{ path: "C:/Gallery/same.jpg" }],
        initialIndex: 0,
      }),
    ).resolves.toEqual({ mode: "window" });
  }, 10000);

  it("creates a separate Tauri image viewer window when one is not open", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const eventHarness = createTauriEventHarness();
    const eventOrder: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:app|supports_multiple_windows") {
          return true;
        }

        if (command === "plugin:window|get_all_windows") {
          return [];
        }

        if (command === "plugin:webview|create_webview_window") {
          expect(args.options.label).toBe("image-viewer");
          expect(args.options.url).toBe("/?sakuravaWindow=image-viewer");
          return null;
        }

        if (command === "plugin:window|set_focus") {
          expect(args.label).toBe("image-viewer");
          return null;
        }

        if (command === "plugin:event|listen") {
          eventOrder.push(`listen:${args.event}`);
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          eventOrder.push(`emit:${args.event}`);
          expect(args.event).toBe("global-image-viewer:payload");
          expect(args.payload.initialIndex).toBe(1);
          expect(args.payload.openRequestId).toEqual(expect.any(String));
          const ackHandlerId = eventHarness.listenersByEvent.get(
            "global-image-viewer:payload-ack",
          );
          if (ackHandlerId) {
            eventHarness.callbacks.get(ackHandlerId)?.({
              event: "global-image-viewer:payload-ack",
              id: ackHandlerId,
              payload: { openRequestId: args.payload.openRequestId },
            });
          }
          return null;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    await expect(
      openGlobalImageViewerWindow({
        images: [
          { path: "C:/Gallery/one.jpg" },
          { path: "C:/Gallery/two.jpg" },
        ],
        initialIndex: 1,
      }),
    ).resolves.toEqual({ mode: "window" });

    expect(
      vi.mocked(invoke).mock.calls.some(([command, args]) => {
        const options = (args as { options?: { label?: string } })?.options;
        return (
          command === "plugin:webview|create_webview_window" &&
          options?.label === "image-viewer"
        );
      }),
    ).toBe(true);
    expect(eventOrder.indexOf("listen:global-image-viewer:payload-ack"))
      .toBeLessThan(eventOrder.indexOf("emit:global-image-viewer:payload"));
  });

  it("returns fallback diagnostics when separate Tauri windows are unsupported", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "plugin:app|supports_multiple_windows") {
        return false;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    await expect(
      openGlobalImageViewerWindow({
        images: [{ path: "C:/Gallery/one.jpg" }],
        initialIndex: 0,
      }),
    ).resolves.toEqual({
      mode: "fallback",
      reason: "multiple-windows-unsupported",
    });
  });

  it("returns fallback diagnostics when separate viewer window creation fails", async () => {
    const { openGlobalImageViewerWindow } = await import(
      "./runtime/globalImageViewerWindow"
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "plugin:app|supports_multiple_windows") {
        return true;
      }

      if (command === "plugin:window|get_all_windows") {
        return [];
      }

      if (command === "plugin:webview|create_webview_window") {
        throw new Error("create denied");
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    await expect(
      openGlobalImageViewerWindow({
        images: [{ path: "C:/Gallery/one.jpg" }],
        initialIndex: 0,
      }),
    ).resolves.toEqual({
      mode: "fallback",
      reason: "viewer-window-create-failed: create denied",
    });
  });

  it("emits an ack when the separate viewer window receives a payload", async () => {
    const eventHarness = createTauriEventHarness();
    const emittedAcks: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          if (args.event === "global-image-viewer:payload-ack") {
            emittedAcks.push(args.payload.openRequestId);
            return null;
          }
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    render(<GlobalImageViewerWindow />);

    await waitFor(() => {
      expect(eventHarness.listenersByEvent.get("global-image-viewer:payload"))
        .toEqual(expect.any(Number));
    });

    const payloadHandlerId = eventHarness.listenersByEvent.get(
      "global-image-viewer:payload",
    );
    if (!payloadHandlerId) {
      throw new Error("Payload listener was not registered");
    }

    await act(async () => {
      eventHarness.callbacks.get(payloadHandlerId)?.({
        event: "global-image-viewer:payload",
        id: payloadHandlerId,
        payload: {
          images: [{ path: "C:/Gallery/direct.jpg" }],
          initialIndex: 0,
          openRequestId: "image-open-1000-direct",
        },
      });
    });

    expect(emittedAcks).toContain("image-open-1000-direct");
    expect(await screen.findByText("direct.jpg")).toBeInTheDocument();
  });

  it("refresh request makes the separate viewer read localStorage and ack", async () => {
    const eventHarness = createTauriEventHarness();
    const emittedAcks: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          if (args.event === "global-image-viewer:payload-ack") {
            emittedAcks.push(args.payload.openRequestId);
            return null;
          }
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    render(<GlobalImageViewerWindow />);

    await waitFor(() => {
      expect(eventHarness.listenersByEvent.get("global-image-viewer:payload-refresh"))
        .toEqual(expect.any(Number));
    });

    window.localStorage.setItem(
      "sakurava.globalImageViewer.payload.v1",
      JSON.stringify({
        images: [{ path: "C:/Gallery/refresh.jpg" }],
        initialIndex: 0,
        openRequestId: "image-open-1001-refresh",
      }),
    );

    const refreshHandlerId = eventHarness.listenersByEvent.get(
      "global-image-viewer:payload-refresh",
    );
    if (!refreshHandlerId) {
      throw new Error("Payload refresh listener was not registered");
    }

    await act(async () => {
      eventHarness.callbacks.get(refreshHandlerId)?.({
        event: "global-image-viewer:payload-refresh",
        id: refreshHandlerId,
        payload: { openRequestId: "image-open-1001-refresh" },
      });
    });

    expect(emittedAcks).toContain("image-open-1001-refresh");
    expect(await screen.findByText("refresh.jpg")).toBeInTheDocument();
  });

  it("does not let stale localStorage overwrite a newer viewer payload", async () => {
    const eventHarness = createTauriEventHarness();
    const emittedAcks: string[] = [];
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "plugin:event|listen") {
          eventHarness.listenersByEvent.set(args.event, args.handler);
          return args.handler;
        }

        if (command === "plugin:event|unlisten") {
          return null;
        }

        if (command === "plugin:event|emit_to") {
          if (args.event === "global-image-viewer:payload-ack") {
            emittedAcks.push(args.payload.openRequestId);
            return null;
          }
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
      transformCallback: eventHarness.transformCallback,
    } as unknown as Window["__TAURI_INTERNALS__"];
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: vi.fn(),
    };

    render(<GlobalImageViewerWindow />);

    await waitFor(() => {
      expect(eventHarness.listenersByEvent.get("global-image-viewer:payload"))
        .toEqual(expect.any(Number));
      expect(eventHarness.listenersByEvent.get("global-image-viewer:payload-refresh"))
        .toEqual(expect.any(Number));
    });

    const payloadHandlerId = eventHarness.listenersByEvent.get(
      "global-image-viewer:payload",
    );
    const refreshHandlerId = eventHarness.listenersByEvent.get(
      "global-image-viewer:payload-refresh",
    );
    if (!payloadHandlerId || !refreshHandlerId) {
      throw new Error("Viewer listeners were not registered");
    }

    await act(async () => {
      eventHarness.callbacks.get(payloadHandlerId)?.({
        event: "global-image-viewer:payload",
        id: payloadHandlerId,
        payload: {
          images: [{ path: "C:/Gallery/newer.jpg" }],
          initialIndex: 0,
          openRequestId: "image-open-2000-newer",
        },
      });
    });

    window.localStorage.setItem(
      "sakurava.globalImageViewer.payload.v1",
      JSON.stringify({
        images: [{ path: "C:/Gallery/older.jpg" }],
        initialIndex: 0,
        openRequestId: "image-open-1000-older",
      }),
    );

    await act(async () => {
      eventHarness.callbacks.get(refreshHandlerId)?.({
        event: "global-image-viewer:payload-refresh",
        id: refreshHandlerId,
        payload: { openRequestId: "image-open-1000-older" },
      });
    });

    expect(emittedAcks).toContain("image-open-2000-newer");
    expect(emittedAcks).not.toContain("image-open-1000-older");
    expect(screen.getByText("newer.jpg")).toBeInTheDocument();
    expect(screen.queryByText("older.jpg")).not.toBeInTheDocument();
  });

  it("closes the separate-window viewer safely on Escape", async () => {
    const onClose = vi.fn();

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "escape.jpg",
            path: "C:/Gallery/escape.jpg",
            resolution: "800 x 600",
          },
        ]}
        initialIndex={0}
        isSeparateWindow
        onClose={onClose}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders advanced viewer shortcuts, transforms, pointer zoom, and minimap controls", async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.useFakeTimers();

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "wide.jpg",
            path: "C:/Gallery/wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const actionBar = within(viewer).getByLabelText("Image viewer actions");
    const controlBar = within(viewer).getByLabelText("Image viewer controls");
    expect(viewer).toHaveAttribute("data-theme-surface", "adaptive");
    expect(viewer).toHaveClass("global-image-viewer");
    expect(within(actionBar).getByLabelText("Image aspect ratio"))
      .toHaveTextContent("16:9");
    expect(actionBar).toHaveClass("viewer-panel");
    const bottomDock = within(viewer).getByLabelText("Image viewer bottom dock");
    expect(bottomDock).toHaveClass("viewer-bottom-dock");
    expect(bottomDock).toContainElement(controlBar);
    expect(bottomDock).toHaveAttribute("data-dock-mode");
    expect(controlBar).toHaveClass("viewer-control-panel");
    expect(controlBar).not.toHaveClass("flex-wrap");
    const controlPanel = controlBar;
    const controlStrip = controlBar.querySelector('[data-control-strip="inline-or-stacked"]');
    expect(controlPanel).toHaveClass("viewer-control-panel");
    expect(controlStrip).toHaveClass("viewer-control-strip");
    if (!(controlStrip instanceof HTMLElement)) {
      throw new Error("Viewer control panel structure was not rendered");
    }
    for (const element of [
      controlBar,
      controlPanel,
      controlStrip,
      ...controlBar.querySelectorAll("[data-control-group]"),
    ]) {
      expect(element).not.toHaveClass("w-full");
      expect(element).not.toHaveClass("w-fit");
      expect(element).not.toHaveClass("flex-1");
      expect(element).not.toHaveClass("grow");
      expect(element).not.toHaveClass("basis-full");
      expect(element).not.toHaveClass("flex-wrap");
    }
    expect(controlBar).not.toHaveClass("lg:max-w-[calc(100%-20rem)]");
    expect(controlBar.querySelector("[data-control-row]"))
      .not.toBeInTheDocument();
    expect(controlBar.querySelector('[data-control-group="fit-mode"]'))
      .toBeInTheDocument();
    const zoomCommand = controlBar.querySelector('[data-control-group="zoom-command"]');
    const rotationCommand = controlBar.querySelector('[data-control-group="rotation-command"]');
    expect(zoomCommand)
      .toBeInTheDocument();
    expect(rotationCommand)
      .toBeInTheDocument();
    expect(within(controlBar).getByLabelText("Gallery image zoom control"))
      .toBeInTheDocument();
    expect(within(controlBar).getByLabelText("Gallery image rotation control"))
      .toBeInTheDocument();
    expect(controlBar.querySelector('[data-control-group="actual-size"]'))
      .not.toBeInTheDocument();
    expect(controlBar.querySelector('[data-control-group="window-mode"]'))
      .toHaveClass("viewer-command-medium");
    expect(controlBar.querySelector('[data-control-group="view-reset"]'))
      .toHaveClass("viewer-command-medium");
    expect(controlBar.querySelector('[data-control-group="viewer-more"]'))
      .toBeInTheDocument();
    const fitIcon = controlBar.querySelector('[data-control-group="fit-mode"] svg');
    const fullscreenIcon = controlBar.querySelector('[data-control-group="window-mode"] svg');
    expect(fitIcon).toHaveClass("lucide-image");
    expect(fullscreenIcon).toHaveClass("lucide-maximize-2");
    const bottomMoreButton = controlBar.querySelector(
      '[data-control-group="viewer-more"]',
    );
    if (!(bottomMoreButton instanceof HTMLElement)) {
      throw new Error("Viewer bottom More control was not rendered");
    }
    fireEvent.click(bottomMoreButton);
    const viewerMoreMenu = within(viewer).getByRole("menu", {
      name: "More viewer controls menu",
    });
    expect(within(viewerMoreMenu).getByRole("menuitem", { name: "Reset View" }))
      .toBeInTheDocument();
    expect(within(viewerMoreMenu).getByRole("menuitem", { name: "Full Window" }))
      .toBeInTheDocument();
    expect(within(viewerMoreMenu).queryByRole("menuitem", { name: "Copy Image Path" }))
      .not.toBeInTheDocument();
    expect(within(viewerMoreMenu).queryByRole("menuitem", { name: "Copy File Name" }))
      .not.toBeInTheDocument();
    fireEvent.click(bottomMoreButton);

    fireEvent.click(
      within(actionBar).getByRole("button", {
        name: "Show image viewer shortcuts",
      }),
    );
    const shortcuts = within(viewer).getByLabelText("Image viewer shortcuts");
    expect(shortcuts).toHaveTextContent("Esc");
    expect(shortcuts).toHaveTextContent("F11");
    expect(shortcuts).toHaveTextContent("Wheel");
    expect(shortcuts).toHaveTextContent("Drag");
    fireEvent.pointerLeave(shortcuts);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      within(viewer).queryByLabelText("Image viewer shortcuts"),
    ).not.toBeInTheDocument();

    fireEvent.click(within(actionBar).getByRole("button", { name: "More image actions" }));
    const moreMenu = within(viewer).getByRole("menu", {
      name: "More image actions menu",
    });
    expect(within(moreMenu).queryByRole("menuitem", { name: "100%" }))
      .not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole("menuitem", { name: "Rotation" }))
      .not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole("menuitem", { name: "Reset View" }))
      .not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole("menuitem", { name: "Full Window" }))
      .not.toBeInTheDocument();
    expect(within(moreMenu).getByRole("menuitem", { name: "Save As" }))
      .toBeEnabled();
    expect(within(moreMenu).getByRole("menuitem", { name: "Open Folder" }))
      .toBeEnabled();
    expect(within(moreMenu).queryByRole("menuitem", { name: "Copy Image" }))
      .not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(moreMenu).getByRole("menuitem", { name: "Copy File Name" }));
    });
    expect(writeText).toHaveBeenCalledWith("wide.jpg");
    expect(within(moreMenu).getByText("Copied")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(moreMenu).getByRole("menuitem", { name: "Copy Image Path" }));
    });
    expect(writeText).toHaveBeenCalledWith("C:/Gallery/wide.jpg");
    expect(within(moreMenu).getAllByText("Copied").length).toBeGreaterThan(0);
    fireEvent.click(within(moreMenu).getByRole("menuitem", { name: "File Info" }));
    const fileInfo = within(viewer).getByLabelText("Image file info");
    expect(fileInfo).toHaveTextContent("Name");
    expect(fileInfo).toHaveTextContent("File Type");
    expect(fileInfo).toHaveTextContent("JPG image");
    expect(fileInfo).toHaveTextContent("Dimension");
    expect(fileInfo).toHaveTextContent("1600 x 900 (16:9)");
    expect(fileInfo).toHaveTextContent("Size");
    expect(fileInfo).toHaveTextContent("Date Taken");
    expect(fileInfo).toHaveTextContent("N/A");
    expect(fileInfo).toHaveTextContent("Path");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(within(viewer).queryByLabelText("Image file info")).not.toBeInTheDocument();

    fireEvent.click(within(actionBar).getByRole("button", { name: "More image actions" }));
    fireEvent.click(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Always Show Controls",
      }),
    );
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(actionBar).toHaveClass("opacity-100");

    expect(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Always Show Controls",
      }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Remember Viewer Settings",
      }),
    );
    expect(window.localStorage.getItem("sakurava.globalImageViewer.settings.v1"))
      .toContain("rememberViewerSettings");
    fireEvent.click(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Always Show Controls",
      }),
    );
    expect(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Always Show Controls",
      }),
    ).toHaveAttribute("aria-checked", "false");

    const fitButton = within(viewer).getByRole("button", {
      name: "Cycle gallery image fit mode: Fit Window",
    });
    expect(fitButton).toHaveAccessibleName("Cycle gallery image fit mode: Fit Window");
    expect(fitButton).not.toHaveTextContent(/Fit/);
    fireEvent.click(fitButton);
    expect(fitButton).toHaveAccessibleName("Cycle gallery image fit mode: Fit Width");
    fireEvent.click(fitButton);
    expect(fitButton).toHaveAccessibleName("Cycle gallery image fit mode: Fit Height");
    fireEvent.click(fitButton);
    expect(fitButton).toHaveAccessibleName("Cycle gallery image fit mode: Fit Window");
    fireEvent.click(fitButton);
    expect(fitButton)
      .toHaveAccessibleName("Cycle gallery image fit mode: Fit Width");
    const zoomControl = within(controlBar).getByLabelText("Gallery image zoom control");
    expect(zoomControl.querySelector(".lucide-zoom-out"))
      .toBeInTheDocument();
    expect(zoomControl.querySelector(".lucide-zoom-in"))
      .toBeInTheDocument();
    expect(within(zoomControl).getByLabelText("Set gallery image zoom percentage"))
      .toBeInTheDocument();
    fireEvent.change(within(zoomControl).getByLabelText("Set gallery image zoom percentage"), {
      target: { value: "3" },
    });
    expect(within(viewer).getAllByText("300%").length).toBeGreaterThan(0);

    fireEvent.change(within(zoomControl).getByLabelText("Set gallery image zoom percentage"), {
      target: { value: "5" },
    });
    expect(within(viewer).getAllByText("500%").length).toBeGreaterThan(0);

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: /Cycle gallery image fit mode/,
      }),
    );
    fireEvent.click(
      within(viewer).getByRole("button", {
        name: /Cycle gallery image fit mode/,
      }),
    );
    fireEvent.change(within(zoomControl).getByLabelText("Set gallery image zoom percentage"), {
      target: { value: "1" },
    });
    fireEvent.click(
      within(zoomControl).getByRole("button", { name: "Zoom in gallery image" }),
    );

    expect(within(viewer).getByText("125% - Drag to pan")).toBeInTheDocument();
    const minimap = within(viewer).getByLabelText("Image minimap navigator");
    const minimapPanel = within(viewer).getByLabelText("Image position overview");
    expect(minimapPanel).toBeInTheDocument();
    expect(minimapPanel).toHaveAttribute("data-layout-zone", "viewer-minimap");
    expect(bottomDock).toContainElement(minimapPanel);
    expect(minimapPanel).toHaveClass("viewer-minimap-slot");
    expect(minimapPanel).not.toHaveClass("absolute");
    expect(minimapPanel).not.toHaveClass("bottom-7");
    expect(minimapPanel).not.toHaveClass("right-5");
    expect(minimap).toHaveStyle({ width: "180px", height: "101px" });
    const minimapViewport = within(viewer).getByTestId("image-minimap-viewport");
    const initialMinimapLeft = minimapViewport.style.left;
    const panSurface = within(viewer).getByLabelText("Image pan surface");

    fireEvent.pointerDown(panSurface, { clientX: 500, clientY: 350, pointerId: 1 });
    fireEvent.pointerMove(panSurface, { clientX: 430, clientY: 320, pointerId: 1 });

    expect(panSurface).toHaveAttribute("data-pan-x", "-70");
    expect(panSurface).toHaveAttribute("data-pan-y", "-30");
    expect(minimapViewport.style.left).not.toBe(initialMinimapLeft);

    fireEvent.pointerDown(minimap, { clientX: 20, clientY: 20, pointerId: 2 });
    expect(panSurface).not.toHaveAttribute("data-pan-x", "-70");

    const rotationControl = within(controlBar).getByLabelText("Gallery image rotation control");
    fireEvent.click(
      within(rotationControl).getByRole("button", { name: "Rotate gallery image right" }),
    );
    expect(within(rotationControl).getByLabelText("Image rotation value"))
      .toHaveTextContent("15°");
    fireEvent.change(within(rotationControl).getByLabelText("Set image rotation degrees"), {
      target: { value: "45" },
    });
    expect(within(rotationControl).getByLabelText("Image rotation value"))
      .toHaveTextContent("45°");
    expect(within(rotationControl).queryByRole("button", { name: "Reset image rotation" }))
      .not.toBeInTheDocument();

    const panXBeforeWheel = panSurface.getAttribute("data-pan-x");
    fireEvent.wheel(within(viewer).getByAltText("Gallery image 1 full size"), {
      clientX: 250,
      clientY: 220,
      deltaY: -120,
    });
    expect(panSurface.getAttribute("data-pan-x")).not.toBe(panXBeforeWheel);

    fireEvent.keyDown(window, { key: "F11" });
    expect(requestFullscreen).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resets pan, drag state, and pannability when a reused viewer receives a new image payload", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    const { rerender } = render(
      <GlobalImageViewer
        images={[
          {
            filename: "first-wide.jpg",
            path: "C:/Gallery/first-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        viewerEpoch={0}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    fireEvent.change(
      within(viewer).getByLabelText("Set gallery image zoom percentage"),
      { target: { value: "3" } },
    );

    const firstPanSurface = within(viewer).getByLabelText("Image pan surface");
    expect(firstPanSurface).toHaveAttribute("data-pannable", "true");
    fireEvent.pointerDown(firstPanSurface, {
      clientX: 500,
      clientY: 350,
      pointerId: 10,
    });
    fireEvent.pointerMove(firstPanSurface, {
      clientX: 420,
      clientY: 330,
      pointerId: 10,
    });
    expect(firstPanSurface).toHaveAttribute("data-pan-x", "-80");
    expect(firstPanSurface).toHaveClass("cursor-grabbing");

    rerender(
      <GlobalImageViewer
        images={[
          {
            filename: "first-wide.jpg",
            path: "C:/Gallery/first-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        viewerEpoch={1}
      />,
    );

    const samePayloadPanSurface = within(viewer).getByLabelText("Image pan surface");
    expect(samePayloadPanSurface).toHaveAttribute("data-pan-x", "0");
    expect(samePayloadPanSurface).toHaveAttribute("data-pan-y", "0");
    expect(samePayloadPanSurface).not.toHaveClass("cursor-grabbing");

    rerender(
      <GlobalImageViewer
        images={[
          {
            filename: "second-tall.jpg",
            path: "C:/Gallery/second-tall.jpg",
            resolution: "800 x 1200",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        viewerEpoch={2}
      />,
    );

    expect(within(viewer).getByText("second-tall.jpg")).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image aspect ratio"))
      .toHaveTextContent("2:3");
    const secondPanSurface = within(viewer).getByLabelText("Image pan surface");
    expect(secondPanSurface).toHaveAttribute("data-pan-x", "0");
    expect(secondPanSurface).toHaveAttribute("data-pan-y", "0");
    expect(secondPanSurface).toHaveAttribute("data-pannable", "false");
    expect(secondPanSurface).toHaveClass("cursor-default");
    expect(secondPanSurface).not.toHaveClass("cursor-grabbing");

    fireEvent.change(
      within(viewer).getByLabelText("Set gallery image zoom percentage"),
      { target: { value: "3" } },
    );
    expect(secondPanSurface).toHaveAttribute("data-pannable", "true");
    expect(secondPanSurface).toHaveClass("cursor-grab");

    fireEvent.pointerDown(secondPanSurface, {
      clientX: 500,
      clientY: 350,
      pointerId: 11,
    });
    fireEvent.pointerMove(secondPanSurface, {
      clientX: 470,
      clientY: 290,
      pointerId: 11,
    });
    expect(secondPanSurface).toHaveAttribute("data-pan-x", "-30");
    expect(secondPanSurface).toHaveAttribute("data-pan-y", "-60");
  });

  it("resets same-image reopen state when only the open request id changes", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    const { rerender } = render(
      <GlobalImageViewer
        images={[
          {
            filename: "same-wide.jpg",
            path: "C:/Gallery/same-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        openRequestId="request-1"
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    fireEvent.change(
      within(viewer).getByLabelText("Set gallery image zoom percentage"),
      { target: { value: "3" } },
    );

    const panSurface = within(viewer).getByLabelText("Image pan surface");
    fireEvent.pointerDown(panSurface, {
      clientX: 500,
      clientY: 350,
      pointerId: 20,
    });
    fireEvent.pointerMove(panSurface, {
      clientX: 410,
      clientY: 315,
      pointerId: 20,
    });
    expect(panSurface).toHaveAttribute("data-pan-x", "-90");
    expect(panSurface).toHaveAttribute("data-pan-y", "-35");
    expect(panSurface).toHaveClass("cursor-grabbing");

    rerender(
      <GlobalImageViewer
        images={[
          {
            filename: "same-wide.jpg",
            path: "C:/Gallery/same-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        openRequestId="request-2"
      />,
    );

    const reopenedPanSurface = within(viewer).getByLabelText("Image pan surface");
    expect(reopenedPanSurface).toHaveAttribute("data-pan-x", "0");
    expect(reopenedPanSurface).toHaveAttribute("data-pan-y", "0");
    expect(reopenedPanSurface).not.toHaveClass("cursor-grabbing");
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).toBeInTheDocument();
  });

  it("ignores stale image loads from an older open request id", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    const { rerender } = render(
      <GlobalImageViewer
        images={[
          {
            filename: "stale.jpg",
            path: "C:/Gallery/stale.jpg",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        openRequestId="load-1"
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const staleImage = within(viewer).getByAltText("Gallery image 1 full size");
    Object.defineProperty(staleImage, "naturalWidth", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(staleImage, "naturalHeight", {
      configurable: true,
      value: 1000,
    });

    rerender(
      <GlobalImageViewer
        images={[
          {
            filename: "stale.jpg",
            path: "C:/Gallery/stale.jpg",
            resolution: "800 x 1200",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
        openRequestId="load-2"
      />,
    );

    fireEvent.load(staleImage);

    expect(within(viewer).getByLabelText("Image aspect ratio"))
      .toHaveTextContent("2:3");
    expect(within(viewer).getByText("800 x 1200")).toBeInTheDocument();
  });

  it("keeps image viewer zoom controls within 1% and 1000% with 1% slider movement and assistive snapping", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "zoom-wide.jpg",
            path: "C:/Gallery/zoom-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const zoomSlider = within(viewer).getByLabelText(
      "Set gallery image zoom percentage",
    );
    expect(zoomSlider).toHaveAttribute("min", "0.01");
    expect(zoomSlider).toHaveAttribute("max", "10");
    expect(zoomSlider).toHaveAttribute("step", "0.01");

    fireEvent.change(zoomSlider, { target: { value: "10" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("1000%");
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Zoom in gallery image" }),
    );
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("1000%");

    fireEvent.change(zoomSlider, { target: { value: "0.01" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("1%");
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Zoom out gallery image" }),
    );
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("1%");

    fireEvent.change(zoomSlider, { target: { value: "0.37" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("37%");
    fireEvent.change(zoomSlider, { target: { value: "0.63" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("63%");
    fireEvent.change(zoomSlider, { target: { value: "0.19" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("19%");
    fireEvent.change(zoomSlider, { target: { value: "0.21" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("25%");
    fireEvent.change(zoomSlider, { target: { value: "0.44" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("44%");
    fireEvent.change(zoomSlider, { target: { value: "0.46" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("50%");
    fireEvent.change(zoomSlider, { target: { value: "0.94" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("94%");
    fireEvent.change(zoomSlider, { target: { value: "0.96" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("100%");
    fireEvent.change(zoomSlider, { target: { value: "1.44" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("144%");
    fireEvent.change(zoomSlider, { target: { value: "1.46" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("150%");
    fireEvent.change(zoomSlider, { target: { value: "2.12" } });
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("212%");

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    );
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Width",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Reset gallery image view" }),
    );
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("100%");
  });

  it("snaps the image viewer rotation slider near supported angles and keeps rotate buttons working", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "rotation-wide.jpg",
            path: "C:/Gallery/rotation-wide.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const rotationSlider = within(viewer).getByLabelText("Set image rotation degrees");
    const rotationValue = within(viewer).getByLabelText("Image rotation value");

    for (const [input, expected] of [
      ["-174", "-180°"],
      ["-129", "-135°"],
      ["-84", "-90°"],
      ["-39", "-45°"],
      ["6", "0°"],
      ["39", "45°"],
      ["84", "90°"],
      ["129", "135°"],
      ["174", "180°"],
    ]) {
      fireEvent.change(rotationSlider, { target: { value: input } });
      expect(rotationValue).toHaveTextContent(expected);
    }

    for (const value of ["12", "33", "77"]) {
      fireEvent.change(rotationSlider, { target: { value } });
      expect(rotationValue).toHaveTextContent(`${value}°`);
    }

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Reset gallery image view" }),
    );
    expect(rotationValue).toHaveTextContent("0°");
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Rotate gallery image right" }),
    );
    expect(rotationValue).toHaveTextContent("15°");
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Rotate gallery image left" }),
    );
    expect(rotationValue).toHaveTextContent("0°");
  });

  it("resets image viewer transforms to 100 percent rotation zero and centered pan", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "reset-wide.jpg",
            path: "C:/Gallery/reset-wide.jpg",
            resolution: "1600 x 900",
          },
          {
            filename: "reset-next.jpg",
            path: "C:/Gallery/reset-next.jpg",
            resolution: "1600 x 900",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const zoomSlider = within(viewer).getByLabelText(
      "Set gallery image zoom percentage",
    );
    const rotationSlider = within(viewer).getByLabelText("Set image rotation degrees");
    const panSurface = within(viewer).getByLabelText("Image pan surface");

    fireEvent.change(zoomSlider, { target: { value: "10" } });
    fireEvent.change(rotationSlider, { target: { value: "84" } });
    fireEvent.pointerDown(panSurface, {
      clientX: 500,
      clientY: 350,
      pointerId: 30,
    });
    fireEvent.pointerMove(panSurface, {
      clientX: 420,
      clientY: 310,
      pointerId: 30,
    });
    expect(panSurface).not.toHaveAttribute("data-pan-x", "0");
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("1000%");
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("90°");

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Reset gallery image view" }),
    );

    expect(within(viewer).getByText("1 / 2")).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("100%");
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("0°");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-x", "0");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-y", "0");
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).not.toHaveClass("bg-sakura-500/85");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("2 / 2")).toBeInTheDocument();

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    );
    fireEvent.change(rotationSlider, { target: { value: "-39" } });
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Reset gallery image view" }),
    );
    expect(within(viewer).getByText("2 / 2")).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("100%");
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("0°");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-x", "0");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-y", "0");
  });

  it("keeps image viewer header dimensions and ratio badge on the same source across formats", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "Alexandrina.jpg",
            path: "C:/Gallery/Alexandrina.jpg",
            resolution: "1200 x 1500",
          },
          {
            filename: "sample.webp",
            path: "C:/Gallery/sample.webp",
            resolution: "1920 x 1080",
          },
          {
            filename: "wide-16-10.jpg",
            path: "C:/Gallery/wide-16-10.jpg",
            resolution: "1600 x 1000",
          },
          {
            filename: "tall-10-16.jpeg",
            path: "C:/Gallery/tall-10-16.jpeg",
            resolution: "1000 x 1600",
          },
          {
            filename: "uncommon.jpg",
            path: "C:/Gallery/uncommon.jpg",
            resolution: "997 x 733",
          },
          {
            filename: "near-square.jpg",
            path: "C:/Gallery/near-square.jpg",
            resolution: "1007 x 1000",
          },
          {
            filename: "unknown.bin",
            path: "C:/Gallery/unknown.bin",
          },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const ratio = within(viewer).getByLabelText("Image aspect ratio");
    expect(within(viewer).getByText("1200 x 1500")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("4:5");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("1920 x 1080")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("16:9");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("1600 x 1000")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("16:10");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("1000 x 1600")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("10:16");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("997 x 733")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("997:733");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(within(viewer).getByText("1007 x 1000")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("1007:1000");
    expect(ratio).not.toHaveTextContent("1:1");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(ratio).toHaveTextContent("-");
  });

  it("updates image viewer png ratio after load without stale or misleading 1:1 fallbacks", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          {
            filename: "Alexandrina.png",
            path: "C:/Gallery/Alexandrina.png",
            resolution: "1842 x 2304",
          },
          { filename: "tall.png", path: "C:/Gallery/tall.png" },
          { filename: "wide.png", path: "C:/Gallery/wide.png", resolution: "1 x 1" },
          { filename: "square.png", path: "C:/Gallery/square.png" },
          { filename: "broken.png", path: "C:/Gallery/broken.png" },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    const ratio = within(viewer).getByLabelText("Image aspect ratio");
    expect(within(viewer).getByText("1842 x 2304")).toBeInTheDocument();
    expect(ratio).toHaveTextContent("4:5");
    expect(ratio).not.toHaveTextContent("307:384");
    expect(ratio).not.toHaveTextContent("1:1");

    const screenshotPngImage = within(viewer).getByAltText("Gallery image 1 full size");
    Object.defineProperty(screenshotPngImage, "naturalWidth", {
      configurable: true,
      value: 1842,
    });
    Object.defineProperty(screenshotPngImage, "naturalHeight", {
      configurable: true,
      value: 2304,
    });
    fireEvent.load(screenshotPngImage);
    expect(ratio).toHaveTextContent("4:5");
    expect(ratio).not.toHaveTextContent("307:384");
    expect(ratio).not.toHaveTextContent("1:1");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(ratio).toHaveTextContent("-");
    const tallImage = within(viewer).getByAltText("Gallery image 2 full size");
    Object.defineProperty(tallImage, "naturalWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(tallImage, "naturalHeight", {
      configurable: true,
      value: 1200,
    });
    fireEvent.load(tallImage);
    expect(ratio).toHaveTextContent("1:2");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(ratio).toHaveTextContent("-");
    const wrongMetadataImage = within(viewer).getByAltText("Gallery image 3 full size");
    Object.defineProperty(wrongMetadataImage, "naturalWidth", {
      configurable: true,
      value: 1842,
    });
    Object.defineProperty(wrongMetadataImage, "naturalHeight", {
      configurable: true,
      value: 2304,
    });
    fireEvent.load(wrongMetadataImage);
    expect(ratio).toHaveTextContent("4:5");
    expect(ratio).not.toHaveTextContent("307:384");
    expect(ratio).not.toHaveTextContent("1:1");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(ratio).toHaveTextContent("-");
    const squareImage = within(viewer).getByAltText("Gallery image 4 full size");
    Object.defineProperty(squareImage, "naturalWidth", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(squareImage, "naturalHeight", {
      configurable: true,
      value: 900,
    });
    fireEvent.load(squareImage);
    expect(ratio).toHaveTextContent("1:1");

    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    expect(ratio).toHaveTextContent("-");
    fireEvent.error(within(viewer).getByAltText("Gallery image 5 full size"));
    expect(ratio).toHaveTextContent("-");
    expect(
      within(viewer).queryByAltText("Gallery image 5 full size"),
    ).not.toBeInTheDocument();
  });

  it("persists and clears remembered viewer fit, zoom, and rotation settings", () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn() as unknown as TestTauriInvoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    const renderViewer = (filename: string) =>
      render(
        <GlobalImageViewer
          images={[
            {
              filename,
              path: `C:/Gallery/${filename}`,
              resolution: "1600 x 900",
            },
          ]}
          initialIndex={0}
          onClose={vi.fn()}
        />,
      );

    const firstRender = renderViewer("remembered-one.jpg");
    let viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    );
    fireEvent.change(
      within(viewer).getByLabelText("Set gallery image zoom percentage"),
      { target: { value: "3" } },
    );
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Rotate gallery image right" }),
    );
    fireEvent.click(
      within(viewer).getByRole("button", { name: "More image actions" }),
    );
    fireEvent.click(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Remember Viewer Settings",
      }),
    );

    const storedSettings = window.localStorage.getItem(
      "sakurava.globalImageViewer.settings.v1",
    );
    expect(storedSettings).toContain('"fitMode":"width"');
    expect(storedSettings).toContain('"isFitMode":false');
    expect(storedSettings).toContain('"zoom":3');
    expect(storedSettings).toContain('"rotation":15');
    firstRender.unmount();

    const rememberedRender = renderViewer("remembered-two.jpg");
    viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Width",
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image zoom value"))
      .toHaveTextContent("300%");
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("15°");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-x", "0");
    const storedBeforeReset = window.localStorage.getItem(
      "sakurava.globalImageViewer.settings.v1",
    );

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Reset gallery image view" }),
    );
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image zoom value"))
      .not.toHaveTextContent("300%");
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("0°");
    expect(within(viewer).getByLabelText("Image pan surface"))
      .toHaveAttribute("data-pan-x", "0");
    expect(window.localStorage.getItem("sakurava.globalImageViewer.settings.v1"))
      .toBe(storedBeforeReset);

    fireEvent.click(
      within(viewer).getByRole("button", { name: "More image actions" }),
    );
    fireEvent.click(
      within(viewer).getByRole("menuitemcheckbox", {
        name: "Remember Viewer Settings",
      }),
    );
    expect(window.localStorage.getItem("sakurava.globalImageViewer.settings.v1"))
      .toBeNull();
    rememberedRender.unmount();

    renderViewer("default-after-clear.jpg");
    viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
    expect(
      within(viewer).getByRole("button", {
        name: "Cycle gallery image fit mode: Fit Window",
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByLabelText("Image rotation value"))
      .toHaveTextContent("0°");
    expect(within(viewer).getByLabelText("Image zoom value"))
      .not.toHaveTextContent("300%");
  });

  it("runs Image Viewer More menu Save As and Open Folder for the current image path", async () => {
    dialogMocks.save.mockResolvedValue("C:/Export/two-copy.jpg");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "detail_source_file_copy_as") {
        return {
          sourcePath: args.sourcePath,
          destinationPath: args.destinationPath,
          success: true,
          message: "Source file saved",
        };
      }
      if (command === "detail_source_folder_reveal") {
        return {
          sourcePath: args.sourcePath,
          folderPath: "C:/Gallery",
          success: true,
          message: "Source folder open request sent",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          { filename: "one.jpg", path: "C:/Gallery/one.jpg", resolution: "800 x 600" },
          { filename: "two.jpg", path: "C:/Gallery/two.jpg", resolution: "800 x 600" },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", { name: "Gallery full-size viewer" });
    fireEvent.click(within(viewer).getByRole("button", { name: "Next gallery image" }));
    fireEvent.click(within(viewer).getByRole("button", { name: "More image actions" }));
    const moreMenu = within(viewer).getByRole("menu", {
      name: "More image actions menu",
    });
    const saveAs = within(moreMenu).getByRole("menuitem", { name: "Save As" });
    const openFolder = within(moreMenu).getByRole("menuitem", { name: "Open Folder" });

    expect(saveAs).toBeEnabled();
    expect(openFolder).toBeEnabled();

    fireEvent.click(saveAs);
    fireEvent.click(saveAs);
    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter(
        ([command]) => command === "detail_source_file_copy_as",
      )).toHaveLength(1);
    });
    expect(invoke).toHaveBeenCalledWith(
      "detail_source_file_copy_as",
      {
        sourcePath: "C:/Gallery/two.jpg",
        destinationPath: "C:/Export/two-copy.jpg",
      },
      undefined,
    );
    expect(await within(moreMenu).findByText("Source file saved"))
      .toBeInTheDocument();

    fireEvent.click(openFolder);
    fireEvent.click(openFolder);
    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.filter(
        ([command]) => command === "detail_source_folder_reveal",
      )).toHaveLength(1);
    });
    expect(invoke).toHaveBeenCalledWith(
      "detail_source_folder_reveal",
      { sourcePath: "C:/Gallery/two.jpg" },
      undefined,
    );
    await waitFor(() => {
      expect(within(moreMenu).queryByText("Source folder open request sent"))
        .not.toBeInTheDocument();
    });
    expect(within(moreMenu).queryByText("Source folder opened"))
      .not.toBeInTheDocument();
  });

  it("keeps Image Viewer More menu helper messages quiet while preserving essential errors", async () => {
    dialogMocks.save.mockResolvedValueOnce(null).mockResolvedValueOnce("C:/Export/error.jpg");
    const invoke = vi.fn(async (command: string) => {
      if (command === "detail_source_file_copy_as") {
        return {
          sourcePath: "C:/Gallery/error.jpg",
          destinationPath: "C:/Export/error.jpg",
          success: false,
          message: "Source file could not be saved",
        };
      }
      if (command === "detail_source_folder_reveal") {
        return {
          sourcePath: "C:/Gallery/error.jpg",
          success: false,
          message: "Source folder could not be opened",
        };
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(
      <GlobalImageViewer
        images={[
          { filename: "error.jpg", path: "C:/Gallery/error.jpg", resolution: "800 x 600" },
        ]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", { name: "Gallery full-size viewer" });
    fireEvent.click(within(viewer).getByRole("button", { name: "More image actions" }));
    const moreMenu = within(viewer).getByRole("menu", {
      name: "More image actions menu",
    });
    const saveAs = within(moreMenu).getByRole("menuitem", { name: "Save As" });
    const openFolder = within(moreMenu).getByRole("menuitem", { name: "Open Folder" });

    fireEvent.click(saveAs);
    await waitFor(() => {
      expect(within(moreMenu).queryByText("Save canceled")).not.toBeInTheDocument();
    });

    fireEvent.click(saveAs);
    expect(await within(moreMenu).findByText("Source file could not be saved"))
      .toBeInTheDocument();

    fireEvent.click(openFolder);
    expect(await within(moreMenu).findByText("Source folder could not be opened"))
      .toBeInTheDocument();
  });

  it("disables Image Viewer More menu file actions when the current image path is missing", () => {
    render(
      <GlobalImageViewer
        images={[{ filename: "missing.jpg", path: "", resolution: "800 x 600" }]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    const viewer = screen.getByRole("dialog", { name: "Gallery full-size viewer" });
    fireEvent.click(within(viewer).getByRole("button", { name: "More image actions" }));
    const moreMenu = within(viewer).getByRole("menu", {
      name: "More image actions menu",
    });

    expect(within(moreMenu).getByRole("menuitem", { name: "Save As" }))
      .toBeDisabled();
    expect(within(moreMenu).getByRole("menuitem", { name: "Open Folder" }))
      .toBeDisabled();
  });

  it("keeps a gallery viewer fallback when the selected full-size image fails", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Viewer Broken Gallery Image",
          galleryImagePathsJson: '["C:/Gallery/broken.jpg"]',
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    expect(
      await screen.findByText("Viewer Broken Gallery Image"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Gallery image 1" }),
    );

    const viewer = await screen.findByRole("dialog", {
      name: "Gallery full-size viewer",
    }, { timeout: 5000 });
    fireEvent.error(within(viewer).getByAltText("Gallery image 1 full size"));

    expect(
      within(viewer).getByRole("img", {
        name: "Gallery image 1 unavailable",
      }),
    ).toBeInTheDocument();
    expect(within(viewer).getByText("Image unavailable")).toBeInTheDocument();
    expect(
      within(viewer).queryByLabelText("Image position overview"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty image detail gallery state for invalid saved gallery data", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Invalid Gallery Image",
          galleryImagePathsJson: '{"path":"C:/Gallery/not-array.jpg"}',
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Invalid Gallery Image")).toBeInTheDocument();
    expect(screen.getByText("No Gallery Images saved.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load More" }),
    ).not.toBeInTheDocument();
  });

  it("hides failed image detail gallery images behind the placeholder state", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Broken Gallery Image",
          galleryImagePathsJson: '["C:/Gallery/broken.jpg"]',
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
    };

    render(<App />);

    const image = await screen.findByAltText("Gallery image 1");
    fireEvent.error(image);

    await waitFor(() => {
      expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByAltText("Gallery image 1")).not.toBeInTheDocument();
  });

  it("shows persisted timestamps on image detail", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Timestamped Image",
          releaseDate: "2026-02-02",
          createdAt: "2026-05-10T01:02:03.000Z",
          updatedAt: "2026-05-12T07:08:09.000Z",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Timestamped Image")).toBeInTheDocument();
    expect(screen.getByText("Release Date")).toBeInTheDocument();
    expect(screen.getByText("Feb 02, 2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-02-02")).not.toBeInTheDocument();
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalTimestamp("2026-05-10T01:02:03.000Z"))).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalTimestamp("2026-05-12T07:08:09.000Z"))).toBeInTheDocument();
    expect(screen.queryByText("2026-05-10T01:02:03.000Z")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-05-12T07:08:09.000Z")).not.toBeInTheDocument();
  });

  it("loads performer collection from the Tauri command boundary when available", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [persistedPerformer({ name: "Persisted Performer" })];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Persisted Performer")).toBeInTheDocument();
    expect(screen.getByText("1 performer")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("performer_list", {}, undefined);
  });

  it("creates a performer through Tauri commands without exposing the internal id", async () => {
    window.history.pushState({}, "", "/performers/new");
    setManagedCategories(["Typed Category"]);
    const created = persistedPerformer({
      name: "Created Performer",
      gender: "Woman",
      aliasesJson: '["Typed Alias"]',
      categoriesJson: '["Typed Category"]',
      ratingJson: '{"attraction":4}',
    });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "performer_create") {
          expect(args.input.name).toBe("Created Performer");
          expect(args.input.aliasesJson).toBe('["Typed Alias"]');
          expect(args.input.categoriesJson).toBe('["Typed Category"]');
          expect(args.input.sourceLinksJson).toBe(
            '[{"title":"Performer source","url":"https://example.invalid/performer"}]',
          );
          expect(args.input.performerThumbnailPathsJson).toBe(
            '["D:/Thumbs/created-1.jpg","D:/Thumbs/created-2.jpg"]',
          );
          expect(args.input.status).toBe("Retired");
          expect(args.input.debutDate).toBe("2020-01-02");
          expect(args.input.retiredDate).toBe("2024-03-04");
          expect(args.input.birthDate).toBe("1998-01-20");
          expect(args.input.gender).toBe("Woman");
          expect(args.input.birthplace).toBe("Tokyo");
          expect(args.input.nationality).toBe("Japanese");
          expect(args.input.bloodType).toBe("A");
          expect(args.input.heightCm).toBe(160);
          expect(args.input.weightKg).toBe(48);
          expect(args.input.measurements).toBe("11 / 22 / 33 cm");
          expect(args.input.cupSize).toBe("C");
          expect(args.input.filmographyCount).toBe(1);
          expect(args.input.pictorialsCount).toBe(1);
          expect(args.input.relatedVideosJson).toBe(
            '[{"recordId":"video_picker_1","titleSnapshot":"Related Video"}]',
          );
          expect(args.input.relatedImagesJson).toBe(
            '[{"recordId":"image_picker_1","titleSnapshot":"Related Image"}]',
          );
          return created;
        }
        if (command === "video_list") {
          return [
            persistedVideo({
              id: "video_picker_1",
              title: "Related Video",
              code: "VID-REL",
            }),
          ];
        }
        if (command === "image_list") {
          return [
            persistedImage({
              id: "image_picker_1",
              title: "Related Image",
              code: "IMG-REL",
            }),
          ];
        }
        if (command === "managed_category_list") {
          return [];
        }
        if (command === "performer_get") {
          return created;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Created Performer" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Typed Alias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.change(screen.getByLabelText("Debut Date"), {
      target: { value: "2020-01-02" },
    });
    fireEvent.change(screen.getByLabelText("Retired Date"), {
      target: { value: "2024-03-04" },
    });
    fireEvent.change(screen.getByLabelText("Birth Date"), {
      target: { value: "1998-01-20" },
    });
    fireEvent.change(screen.getByLabelText("Gender"), {
      target: { value: "Woman" },
    });
    fireEvent.change(screen.getByLabelText("Birthplace"), {
      target: { value: "Tokyo" },
    });
    fireEvent.change(screen.getByLabelText("Nationality"), {
      target: { value: "Japanese" },
    });
    fireEvent.change(screen.getByLabelText("Blood Type"), {
      target: { value: "A" },
    });
    fireEvent.change(screen.getByLabelText("Height"), {
      target: { value: "160" },
    });
    fireEvent.change(screen.getByLabelText("Weight"), {
      target: { value: "48" },
    });
    fireEvent.change(screen.getByLabelText("Measurements"), {
      target: { value: "112233" },
    });
    fireEvent.change(screen.getByLabelText("Cup Size"), {
      target: { value: "C" },
    });
    fireEvent.change(await screen.findByLabelText("Search related videos"), {
      target: { value: "related video" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add related video Related Video" }));
    fireEvent.change(await screen.findByLabelText("Search related images"), {
      target: { value: "related image" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add related image Related Image" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "Performer source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/performer" },
    });
    dialogMocks.open.mockResolvedValueOnce([
      "D:/Thumbs/created-1-placeholder.jpg",
      "D:/Thumbs/created-2-placeholder.jpg",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Mini Thumbnail Path 2")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Mini Thumbnail Path 1"), {
      target: { value: " D:/Thumbs/created-1.jpg " },
    });
    fireEvent.change(screen.getByLabelText("Mini Thumbnail Path 2"), {
      target: { value: "D:/Thumbs/created-2.jpg" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Created Performer")).toBeInTheDocument();
    expect(screen.getByText("Woman")).toBeInTheDocument();
    expect(screen.getByText("Typed Alias")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  }, 10000);

  it("renders the Performer form category picker", () => {
    window.history.pushState({}, "", "/performers/new");
    setManagedCategories(["Featured"]);

    render(<App />);

    expect(screen.getByTestId("category-picker-field")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText(
      "Search categories, face, body, specialty, attribute...",
    )).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "feat" },
    });
    expect(screen.getByRole("button", { name: "Add Featured" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Category" })).toHaveAttribute(
      "href",
      "/settings/category-management",
    );
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
  });

  it("renders Gender as a Performer direct field only", () => {
    window.history.pushState({}, "", "/videos/new");
    const { unmount } = render(<App />);

    expect(screen.queryByLabelText("Gender")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();
    unmount();

    window.history.pushState({}, "", "/images/new");
    const imageRender = render(<App />);

    expect(screen.queryByLabelText("Gender")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();
    imageRender.unmount();

    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    expect(screen.getByLabelText("Gender")).toBeInTheDocument();
    expect(screen.queryByText("No Gender categories found")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();
    expect(screen.queryByText("No Body Type categories found")).not.toBeInTheDocument();
  });

  it("shows Gender as a recent-only direct field without defaults or Category Management taxonomy", async () => {
    window.history.pushState({}, "", "/performers/new");
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }
      if (
        command === "performer_list" ||
        command === "video_list" ||
        command === "image_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    const gender = await screen.findByLabelText("Gender");
    expect(gender).toHaveValue("");
    fireEvent.focus(gender);
    expect(screen.queryByRole("listbox", { name: "Gender suggestions" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Standard")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Woman" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Man" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Non-binary" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unknown" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();

    fireEvent.change(gender, { target: { value: "Woman" } });
    expect(gender).toHaveValue("Woman");
  });

  it.each(["bodytype", "body-type", "body_type"])(
    "does not render Body Type form field from parent variant %s",
    async (bodyTypeParentName) => {
      window.history.pushState({}, "", "/performers/new");
      const invoke = vi.fn(async (command: string) => {
        if (command === "managed_category_list") {
          return performerTaxonomyFixtures(bodyTypeParentName);
        }
        if (
          command === "performer_list" ||
          command === "video_list" ||
          command === "image_list"
        ) {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = { invoke };

      render(<App />);

      const gender = await screen.findByLabelText("Gender");
      expect(gender).toHaveValue("");
      expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();
      expect(screen.queryByText("Athletic")).not.toBeInTheDocument();
    },
  );

  it("shows discard confirmation after changing Performer Gender direct field", async () => {
    window.history.pushState({}, "", "/performers/new");
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }
      if (
        command === "performer_list" ||
        command === "video_list" ||
        command === "image_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Gender"), {
      target: { value: "Woman" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("dialog", { name: "Discard changes?" }))
      .toBeInTheDocument();
  });

  it("saves Performer Gender through the real performer field", async () => {
    window.history.pushState({}, "", "/performers/new");
    const created = persistedPerformer({
      name: "Gender Performer",
      gender: "Woman",
      categoriesJson: "[]",
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }
      if (command === "performer_create") {
        expect(args.input.categoriesJson).toBe("[]");
        expect(args.input.gender).toBe("Woman");
        expect(args.input.measurements).toBe("");
        expect(args.input.cupSize).toBe("");
        return created;
      }
      if (command === "performer_get") {
        return created;
      }
      if (
        command === "performer_list" ||
        command === "video_list" ||
        command === "image_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Gender"), {
      target: { value: "Woman" },
    });
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Gender Performer" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Gender Performer")).toBeInTheDocument();
    expect(screen.getByText("Woman")).toBeInTheDocument();
  });

  it("loads Gender from performer.gender and not saved performer taxonomy categories", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    const existing = persistedPerformer({
      name: "Saved Gender Performer",
      gender: "Non-binary",
      categoriesJson: '["Woman","Athletic","Classic"]',
    });
    const invoke = vi.fn(async (command: string) => {
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }
      if (command === "performer_get") {
        return existing;
      }
      if (
        command === "performer_list" ||
        command === "video_list" ||
        command === "image_list"
      ) {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Saved Gender Performer"))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Gender")).toHaveValue("Non-binary");
      expect(screen.queryByLabelText("Body Type")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Classic")).toBeInTheDocument();
  });

  it("saves empty performer mini thumbnail fields safely", async () => {
    window.history.pushState({}, "", "/performers/new");
    const created = persistedPerformer({ name: "Empty Thumbnail Performer" });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "performer_create") {
          expect(args.input.name).toBe("Empty Thumbnail Performer");
          expect(args.input.performerThumbnailPathsJson).toBe("[]");
          return created;
        }
        if (command === "performer_get") {
          return created;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Empty Thumbnail Performer" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Empty Thumbnail Performer")).toBeInTheDocument();
  });

  it("adds performer mini thumbnail images up to four rows without Add Folder", async () => {
    window.history.pushState({}, "", "/performers/new");
    const created = persistedPerformer({ name: "Mini Thumbnail Performer" });
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "performer_create") {
          expect(args.input.performerThumbnailPathsJson).toBe(
            '["D:/Thumbs/one.jpg","D:/Thumbs/two.jpg","D:/Thumbs/three.jpg","D:/Thumbs/four.jpg"]',
          );
          return created;
        }
        if (command === "performer_get") {
          return created;
        }
        if (
          command === "performer_list" ||
          command === "video_list" ||
          command === "image_list"
        ) {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };
    dialogMocks.open.mockResolvedValueOnce([
      "D:/Thumbs/one.jpg",
      "D:/Thumbs/two.jpg",
      "D:/Thumbs/three.jpg",
      "D:/Thumbs/four.jpg",
      "D:/Thumbs/five.jpg",
    ]);

    render(<App />);

    const filesSection = screen.getByRole("heading", { name: "File" }).closest("section");
    expect(filesSection).not.toBeNull();
    expect(within(filesSection as HTMLElement).getByText("Mini Thumbnail Paths"))
      .toBeInTheDocument();
    expect(within(filesSection as HTMLElement).getByRole("button", { name: "Add Images" }))
      .toBeInTheDocument();
    expect(within(filesSection as HTMLElement).queryByRole("button", { name: "Add Folder" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(filesSection as HTMLElement).getByRole("button", { name: "Add Images" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Mini Thumbnail Path 1")).toHaveValue("D:/Thumbs/one.jpg");
      expect(screen.getByLabelText("Mini Thumbnail Path 4")).toHaveValue("D:/Thumbs/four.jpg");
    });
    expect(screen.queryByLabelText("Mini Thumbnail Path 5")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Mini Thumbnail Performer" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Mini Thumbnail Performer")).toBeInTheDocument();
  });

  it("loads and updates a performer through Tauri commands", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedPerformer({
      name: "Existing Performer",
      aliasesJson: '["Alias One"]',
      gender: "Woman",
      debutDate: "2020-01-02",
      retiredDate: "",
      birthplace: "Tokyo",
      nationality: "Japanese",
      bloodType: "A",
      heightCm: 160,
      weightKg: 48,
      measurements: "11 / 22 / 33 cm",
      cupSize: "C",
      relatedVideosJson:
        '[{"recordId":"video_existing","titleSnapshot":"Existing Video"}]',
      relatedImagesJson:
        '[{"recordId":"image_existing","titleSnapshot":"Existing Image"}]',
      performerThumbnailPathsJson:
        '["D:/Thumbs/existing-1.jpg","D:/Thumbs/existing-2.jpg"]',
      categoriesJson: '["Classic"]',
      ratingJson: '{"attraction":3}',
      sourceLinksJson:
        '[{"title":"Existing performer source","url":"https://example.invalid/old-performer"}]',
    });
    const updated = persistedPerformer({
      name: "Updated Performer",
      gender: "Non-binary",
      aliasesJson: '["Alias One","Alias Two"]',
      categoriesJson: '["Classic","Updated"]',
      ratingJson: '{"attraction":5}',
      sourceLinksJson:
        '[{"title":"Updated performer source","url":"https://example.invalid/new-performer"}]',
    });
    let currentPerformer = existing;
    const invoke = vi.fn(
      async (command: string, args: Record<string, any>) => {
        if (command === "performer_get") {
          expect(args.id).toBe("performer_test_001");
          return currentPerformer;
        }
        if (command === "performer_update") {
          expect(args.id).toBe("performer_test_001");
          expect(args.patch.name).toBe("Updated Performer");
          expect(args.patch.aliasesJson).toBe('["Alias One","Alias Two"]');
          expect(args.patch.performerThumbnailPathsJson).toBe(
            '["D:/Thumbs/existing-1.jpg","D:/Thumbs/updated-3.jpg"]',
          );
          expect(args.patch.categoriesJson).toBe('["Classic","Updated"]');
          expect(args.patch.ratingJson).toContain('"attraction":5');
          expect(args.patch.debutDate).toBe("2021-02-03");
          expect(args.patch.retiredDate).toBe("2024-05-06");
          expect(args.patch.gender).toBe("Non-binary");
          expect(args.patch.birthplace).toBe("Osaka");
          expect(args.patch.nationality).toBe("Japanese");
          expect(args.patch.bloodType).toBe("B");
          expect(args.patch.heightCm).toBe(161);
          expect(args.patch.weightKg).toBe(49);
          expect(args.patch.measurements).toBe("81 / 59 / 85 cm");
          expect(args.patch.cupSize).toBe("D");
          expect(args.patch.filmographyCount).toBe(1);
          expect(args.patch.pictorialsCount).toBe(1);
          expect(args.patch.relatedVideosJson).toBe(
            '[{"recordId":"video_existing","titleSnapshot":"Existing Video"}]',
          );
          expect(args.patch.relatedImagesJson).toBe(
            '[{"recordId":"image_existing","titleSnapshot":"Existing Image"}]',
          );
          expect(args.patch.sourceLinksJson).toBe(
            '[{"title":"Updated performer source","url":"https://example.invalid/new-performer"}]',
          );
          currentPerformer = updated;
          return updated;
        }
        if (command === "video_list") {
          return [
            persistedVideo({
              id: "video_existing",
              title: "Existing Video",
              code: "VID-EX",
            }),
          ];
        }
        if (command === "image_list") {
          return [
            persistedImage({
              id: "image_existing",
              title: "Existing Image",
              code: "IMG-EX",
            }),
          ];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Performer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing performer source")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.invalid/old-performer"))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Mini Thumbnail Path 1")).toHaveValue(
      "D:/Thumbs/existing-1.jpg",
    );
    expect(screen.getByLabelText("Mini Thumbnail Path 2")).toHaveValue(
      "D:/Thumbs/existing-2.jpg",
    );
    expect(screen.queryByLabelText("Mini Thumbnail Path 3")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mini Thumbnail Path 4")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Debut Date")).toHaveValue("2020-01-02");
    expect(screen.getByLabelText("Gender")).toHaveValue("Woman");
    expect(screen.getByLabelText("Birthplace")).toHaveValue("Tokyo");
    expect(screen.getByLabelText("Height")).toHaveValue(160);
    expect(screen.getByLabelText("Measurements")).toHaveValue("11 / 22 / 33");
    expect(screen.getByLabelText("Filmography")).toHaveValue("1");
    expect(screen.getByLabelText("Pictorials")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Updated Performer" },
    });
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "Updated performer source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/new-performer" },
    });
    fireEvent.change(screen.getByLabelText("Debut Date"), {
      target: { value: "2021-02-03" },
    });
    fireEvent.change(screen.getByLabelText("Retired Date"), {
      target: { value: "2024-05-06" },
    });
    fireEvent.change(screen.getByLabelText("Gender"), {
      target: { value: "Non-binary" },
    });
    fireEvent.change(screen.getByLabelText("Birthplace"), {
      target: { value: "Osaka" },
    });
    fireEvent.change(screen.getByLabelText("Blood Type"), {
      target: { value: "B" },
    });
    fireEvent.change(screen.getByLabelText("Height"), {
      target: { value: "161" },
    });
    fireEvent.change(screen.getByLabelText("Weight"), {
      target: { value: "49" },
    });
    fireEvent.change(screen.getByLabelText("Measurements"), {
      target: { value: "81/59/85" },
    });
    fireEvent.change(screen.getByLabelText("Cup Size"), {
      target: { value: "D" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Alias Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fillPerformerRatingFields({ Attraction: "5" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Mini Thumbnail Path 2" }));
    dialogMocks.open.mockResolvedValueOnce(["D:/Thumbs/updated-3.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Mini Thumbnail Path 2")).toHaveValue(
        "D:/Thumbs/updated-3.jpg",
      ),
    );
    clickSaveAndConfirm();

    expect(
      await screen.findByText("Updated Performer", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alias Two")).toBeInTheDocument();
    expect(screen.getByText("Non-binary")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  }, 10000);

  it("shows credit Role Names as display-only performer aliases without saving them", async () => {
    window.history.pushState({}, "", "/performers/performer_known_names/edit");
    const performer = persistedPerformer({
      id: "performer_known_names",
      name: "Known Name Performer",
      aliasesJson: '["Manual Alias","Traveler"]',
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        return performer;
      }
      if (command === "credit_list_by_performer") {
        expect(args).toEqual({ performerId: performer.id });
        return [
          persistedCredit({
            id: "credit_traveler",
            performerId: performer.id,
            characterName: " traveler ",
          }),
          persistedCredit({
            id: "credit_narrator",
            performerId: performer.id,
            characterName: "Narrator",
          }),
          persistedCredit({
            id: "credit_invalid",
            performerId: performer.id,
            characterName: "N/A",
          }),
        ];
      }
      if (
        command === "managed_category_list" ||
        command === "video_list" ||
        command === "image_list"
      ) {
        return [];
      }
      if (command === "performer_update") {
        expect(args.patch.aliasesJson).toBe('["Manual Alias","Narrator"]');
        return {
          ...performer,
          ...args.patch,
          aliasesJson: args.patch.aliasesJson,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Manual Alias")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Traveler" }))
      .toBeInTheDocument();
    expect(screen.getByText("Narrator").closest("[data-known-name-source]"))
      .toHaveAttribute("title", "From role name");
    expect(screen.queryByRole("button", { name: "Remove Narrator" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("N/A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Traveler" }));
    expect(screen.getByText("traveler").closest("[data-known-name-source]"))
      .toHaveAttribute("title", "From role name");

    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Narrator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    expect(screen.getByRole("button", { name: "Add Aliases" }))
      .toHaveClass("rounded-lg", "h-8");
    expect(screen.getByRole("button", { name: "Add Aliases" }))
      .not.toHaveClass("rounded-full");
    expect(screen.getByRole("button", { name: "Remove Narrator" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("Narrator")).toHaveLength(1);

    fillPerformerRatingFields();
    clickSaveAndConfirm();
    expect(await screen.findByText("Known Name Performer")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "credit_update",
      expect.anything(),
      expect.anything(),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "credit_delete",
      expect.anything(),
      expect.anything(),
    );
  }, 15_000);

  it("shows persisted timestamps on performer detail", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Timestamped Performer",
          status: "Active",
          debutDate: "2020-01-02",
          retiredDate: "2024-03-04",
          birthDate: "1998-01-20",
          birthplace: "Tokyo",
          nationality: "Japanese",
          bloodType: "A",
          heightCm: 160,
          weightKg: 48,
          measurements: "11 / 22 / 33 cm",
          cupSize: "C",
          filmographyCount: 99,
          pictorialsCount: 88,
          relatedVideosJson: relatedCatalogJson("detail_video", 2),
          relatedImagesJson: relatedCatalogJson("detail_image", 1),
          createdAt: "2026-05-09T01:02:03.000Z",
          updatedAt: "2026-05-12T10:11:12.000Z",
        });
      }
      if (command === "video_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Timestamped Performer")).toBeInTheDocument();
    expect(screen.getAllByText("Retired").length).toBeGreaterThan(0);
    expect(
      within(screen.getByText("Filmography").closest("div") as HTMLElement).getByText(
        "2",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Pictorials").closest("div") as HTMLElement).getByText(
        "1",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalTimestamp("2026-05-09T01:02:03.000Z"))).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalTimestamp("2026-05-12T10:11:12.000Z"))).toBeInTheDocument();
    expect(screen.queryByText("2026-05-09T01:02:03.000Z")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-05-12T10:11:12.000Z")).not.toBeInTheDocument();
    expect(screen.getByText("Years Active")).toBeInTheDocument();
    expect(screen.getByText("2020 - 2024")).toBeInTheDocument();
    expect(screen.getByText("(22 - 26 y)")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile Metadata" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Metadata" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
    const personalSection = screen
      .getByRole("heading", { name: "Personal" })
      .closest("section") as HTMLElement;
    expect(within(personalSection).getByText("Gender")).toBeInTheDocument();
    expect(within(personalSection).getByText("Birth Date")).toBeInTheDocument();
    expect(within(personalSection).getByText("Jan 20, 1998")).toBeInTheDocument();
    expect(within(personalSection).getByText("Debut Date")).toBeInTheDocument();
    expect(within(personalSection).getByText("Jan 02, 2020")).toBeInTheDocument();
    expect(within(personalSection).getByText("Retired Date")).toBeInTheDocument();
    expect(within(personalSection).getByText("Mar 04, 2024")).toBeInTheDocument();
    expect(within(personalSection).queryByText("1998-01-20")).not.toBeInTheDocument();
    expect(within(personalSection).queryByText("2020-01-02")).not.toBeInTheDocument();
    expect(within(personalSection).queryByText("2024-03-04")).not.toBeInTheDocument();
    expect(within(personalSection).getByText("Birthplace")).toBeInTheDocument();
    expect(within(personalSection).getByText("Tokyo")).toBeInTheDocument();
    expect(within(personalSection).getByText("Nationality")).toBeInTheDocument();
    expect(within(personalSection).getByText("Japanese")).toBeInTheDocument();
    expect(within(personalSection).getByText("Astrological Sign / Zodiac")).toBeInTheDocument();
    expect(within(personalSection).getByText("Aquarius")).toBeInTheDocument();
    expect(within(personalSection).queryByText("Blood Type")).not.toBeInTheDocument();
    expectPrecedes(personalSection, "Gender", "Birth Date");
    expectPrecedes(personalSection, "Birth Date", "Birthplace");
    expectPrecedes(personalSection, "Birthplace", "Nationality");
    expectPrecedes(personalSection, "Nationality", "Astrological Sign / Zodiac");
    expectPrecedes(personalSection, "Astrological Sign / Zodiac", "Debut Date");
    expectPrecedes(personalSection, "Debut Date", "Retired Date");
    const physicalSection = screen
      .getByRole("heading", { name: "Physical" })
      .closest("section") as HTMLElement;
    expect(within(physicalSection).getByText("Body Type")).toBeInTheDocument();
    expect(within(physicalSection).getByText("Height")).toBeInTheDocument();
    expect(within(physicalSection).getByText("160 cm")).toBeInTheDocument();
    expect(within(physicalSection).getByText("Weight")).toBeInTheDocument();
    expect(within(physicalSection).getByText("48 kg")).toBeInTheDocument();
    expect(within(physicalSection).getByText("Measurement")).toBeInTheDocument();
    expect(within(physicalSection).getByText("11 / 22 / 33 cm")).toBeInTheDocument();
    expect(within(physicalSection).getByText("Cup Size")).toBeInTheDocument();
    expect(within(physicalSection).getByText("Blood Type")).toBeInTheDocument();
    expect(within(physicalSection).getByText("A")).toBeInTheDocument();
    expectPrecedes(physicalSection, "Body Type", "Height");
    expectPrecedes(physicalSection, "Height", "Weight");
    expectPrecedes(physicalSection, "Weight", "Measurement");
    expectPrecedes(physicalSection, "Measurement", "Cup Size");
    expectPrecedes(physicalSection, "Cup Size", "Blood Type");
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it.each([
    ["/videos/new", "Related Performers", "Related Images"],
    ["/videos/sample-id/edit", "Related Performers", "Related Images"],
    ["/images/new", "Related Performers", "Related Videos"],
    ["/images/sample-id/edit", "Related Performers", "Related Videos"],
    ["/performers/new", "Related Videos", "Related Images"],
    ["/performers/sample-id/edit", "Related Videos", "Related Images"],
  ])("renders separate related sections for %s", (path, first, second) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("heading", { name: first })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: second })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Related Content" }))
      .not.toBeInTheDocument();
  });

  it.each(["/performers/new", "/performers/sample-id/edit"])(
    "renders only functional Performer related sections for %s",
    (path) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getAllByRole("heading", { name: "Related Videos" }))
        .toHaveLength(1);
      expect(screen.getAllByRole("heading", { name: "Related Images" }))
        .toHaveLength(1);
      expect(
        screen.queryByText("Available after relation features are added."),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("Search related videos")).toBeInTheDocument();
      expect(screen.getByLabelText("Search related images")).toBeInTheDocument();
    },
  );

  it.each([
    "/videos/new",
    "/videos/sample-id/edit",
    "/images/new",
    "/images/sample-id/edit",
    "/performers/new",
    "/performers/sample-id/edit",
  ])("renders Save and Cancel controls on form page %s", (path) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it.each([
    ["/videos/new", false],
    ["/images/new", false],
    ["/performers/new", false],
  ])(
    "favorite checkbox reflects initial value and can be toggled on %s",
    (path, initialChecked) => {
      window.history.pushState({}, "", path);
      render(<App />);

      const checkbox = screen.getByRole("checkbox", { name: "Favorite" });
      expect(checkbox).toBeInTheDocument();
      expect((checkbox as HTMLInputElement).checked).toBe(initialChecked);

      fireEvent.click(checkbox);
      expect((checkbox as HTMLInputElement).checked).toBe(!initialChecked);
    },
  );

  it.each([
    "/videos/new",
    "/images/new",
    "/performers/new",
  ])(
    "source links section shows functional row controls on %s",
    (path) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByText("Source Links")).toBeInTheDocument();
      expect(screen.getByText("No source links added.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));

      expect(screen.getByLabelText("Source Link Title 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Source Link URL 1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Source Link" }))
        .toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Source Link 1" }))
        .toBeInTheDocument();
    },
  );

  it("blocks invalid Source Link URLs before saving", async () => {
    window.history.pushState({}, "", "/videos/new");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list" || command === "image_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Invalid Source Video" },
    });
    fillVideoRatingFields();
    fireEvent.click(screen.getByRole("button", { name: "Add Source Link" }));
    fireEvent.change(screen.getByLabelText("Source Link Title 1"), {
      target: { value: "Invalid source" },
    });
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "example.invalid/source" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Source URL must start with http:// or https://."),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_create",
      expect.anything(),
      expect.anything(),
    );
  });

  it("marks Source Link edits dirty and confirms discard", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    const invoke = vi.fn(async (command: string) => {
      if (command === "image_get") {
        return persistedImage({
          title: "Dirty Source Image",
          sourceLinksJson:
            '[{"title":"Existing source","url":"https://example.invalid/source"}]',
        });
      }
      if (command === "performer_list" || command === "video_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing source")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Source Link URL 1"), {
      target: { value: "https://example.invalid/changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("dialog", { name: "Discard changes?" }))
      .toBeInTheDocument();
  });

  it("renders read-only Tech Info fields on Video and Image forms", async () => {
    // 1. Video Form Tech Info Check
    window.history.pushState({}, "", "/videos/sample-id/edit");

    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_get") {
        return persistedVideo({
          durationMinutes: 120,
          resolution: "1920x1080",
          fileSizeBytes: 1048576,
          fileType: "mp4",
        });
      }
      return [];
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
      convertFileSrc: vi.fn(),
    };

    const { unmount } = render(<App />);

    // Verify fields are read-only and contain the loaded data
    const durationInput = await screen.findByLabelText("Duration");
    const resolutionInput = await screen.findByLabelText("Resolution");
    const sizeInput = await screen.findByLabelText("File Size");
    const typeInput = await screen.findByLabelText("File Type");

    // Detect button should exist
    expect(screen.getByRole("button", { name: "Detect" })).toBeInTheDocument();

    expect(durationInput).toHaveAttribute("readonly");
    expect(resolutionInput).toHaveAttribute("readonly");
    expect(sizeInput).toHaveAttribute("readonly");
    expect(typeInput).toHaveAttribute("readonly");

    expect(durationInput).toHaveValue("120");
    expect(resolutionInput).toHaveValue("1920x1080");
    expect(sizeInput).toHaveValue("1048576");
    expect(typeInput).toHaveValue("mp4");

    unmount();

    // 2. Image Form Tech Info Check
    window.history.pushState({}, "", "/images/sample-id/edit");
    const invokeImage = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        return persistedImage({
          imageCount: 15,
          mainResolution: "3840x2160",
          totalFileSizeBytes: 5242880,
          mainFileType: "jpg",
        });
      }
      return [];
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke: invokeImage,
      convertFileSrc: vi.fn(),
    };

    render(<App />);

    // Verify fields are read-only and contain the loaded data
    const countInput = await screen.findByLabelText("Image Count");
    const mainResInput = await screen.findByLabelText("Main Resolution");
    const totalSizeInput = await screen.findByLabelText("Total File Size");
    const mainTypeInput = await screen.findByLabelText("Main File Type");

    // Detect button should exist
    expect(screen.getByRole("button", { name: "Detect" })).toBeInTheDocument();

    expect(countInput).toHaveAttribute("readonly");
    expect(mainResInput).toHaveAttribute("readonly");
    expect(totalSizeInput).toHaveAttribute("readonly");
    expect(mainTypeInput).toHaveAttribute("readonly");

    expect(countInput).toHaveValue("15");
    expect(mainResInput).toHaveValue("3840x2160");
    expect(totalSizeInput).toHaveValue("5242880");
    expect(mainTypeInput).toHaveValue("jpg");
  });

  it("verifies Performer derived/auto fields are read-only", async () => {
    window.history.pushState({}, "", "/performers/sample-id/edit");
    const invokePerformer = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        return persistedPerformer({
          debutDate: "2020-01-01",
          retiredDate: "",
          birthDate: "2000-01-01",
          relatedVideosJson: relatedCatalogJson("vid", 5),
          relatedImagesJson: relatedCatalogJson("img", 3),
        });
      }
      return [];
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke: invokePerformer,
      convertFileSrc: vi.fn(),
    };

    render(<App />);

    // Performer Auto fields
    const statusInput = await screen.findByLabelText("Availability");
    const filmographyInput = await screen.findByLabelText("Filmography");
    const pictorialsInput = await screen.findByLabelText("Pictorials");
    const signInput = await screen.findByLabelText("Astrological Sign");

    expect(statusInput).toHaveAttribute("readonly");
    expect(filmographyInput).toHaveAttribute("readonly");
    expect(pictorialsInput).toHaveAttribute("readonly");
    expect(signInput).toHaveAttribute("readonly");

    expect(statusInput).toHaveValue("Active");
    expect(filmographyInput).toHaveValue("5");
    expect(pictorialsInput).toHaveValue("3");
    expect(signInput).toHaveValue("Capricorn");
  });

  describe("Rating defaults, average, and full card sync", () => {
    it.each([
      ["/videos/new", ["Rewatch", "Performance", "Visual", "Intensity", "Story", "Chemistry"]],
      ["/images/new", ["Memorability", "Visual", "Posing", "Atmosphere", "Flow", "Signature"]],
      ["/performers/new", ["Attraction", "Visual", "Performance", "Popularity", "Exceptional", "Versatility"]],
    ])("renders all six default rating criteria at %s", async (path, labels) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (command: string) => {
        if (
          command === "performer_list" ||
          command === "image_list" ||
          command === "video_list"
        ) {
          return [];
        }
        return [];
      }) as any;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      for (const label of labels) {
        expect(screen.getByLabelText(label)).toHaveValue(1);
        expect(
          screen.getByRole("button", { name: `Rate ${label} 1 out of 5` }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: `Rate ${label} 5 out of 5` }),
        ).toBeInTheDocument();
      }
      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("1.0");
    });

    it.each([
      {
        path: "/videos/new",
        titleLabel: /^Title/,
        title: "Default Rating Video",
        createCommand: "video_create",
        getCommand: "video_get",
        created: persistedVideo({
          title: "Default Rating Video",
          ratingJson:
            '{"rewatch":1,"performance":1,"visual":1,"intensity":1,"story":1,"chemistry":1}',
        }),
        expectedRatingJson:
          '{"rewatch":1,"performance":1,"visual":1,"intensity":1,"story":1,"chemistry":1}',
      },
      {
        path: "/images/new",
        titleLabel: /^Title/,
        title: "Default Rating Image",
        createCommand: "image_create",
        getCommand: "image_get",
        created: persistedImage({
          title: "Default Rating Image",
          ratingJson:
            '{"memorability":1,"visual":1,"posing":1,"atmosphere":1,"flow":1,"signature":1}',
        }),
        expectedRatingJson:
          '{"memorability":1,"visual":1,"posing":1,"atmosphere":1,"flow":1,"signature":1}',
      },
      {
        path: "/performers/new",
        titleLabel: /^Name/,
        title: "Default Rating Performer",
        createCommand: "performer_create",
        getCommand: "performer_get",
        created: persistedPerformer({
          name: "Default Rating Performer",
          ratingJson:
            '{"attraction":1,"visual":1,"performance":1,"popularity":1,"exceptional":1,"versatility":1}',
        }),
        expectedRatingJson:
          '{"attraction":1,"visual":1,"performance":1,"popularity":1,"exceptional":1,"versatility":1}',
      },
    ])("saves new default rating criteria of 1 at $path", async ({
      path,
      titleLabel,
      title,
      createCommand,
      getCommand,
      created,
      expectedRatingJson,
    }) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (command: string, args?: any) => {
        if (
          command === "performer_list" ||
          command === "image_list" ||
          command === "video_list" ||
          command === "managed_category_list"
        ) {
          return [];
        }
        if (command === createCommand) {
          expect(args.input.ratingJson).toBe(expectedRatingJson);
          return created;
        }
        if (command === getCommand) return created;
        return [];
      }) as any;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      fireEvent.change(screen.getByLabelText(titleLabel), {
        target: { value: title },
      });
      clickSaveAndConfirm();

      expect(await screen.findByText(title)).toBeInTheDocument();
    });

    it("saves when all rating criteria are filled", async () => {
      window.history.pushState({}, "", "/videos/new");
      const created = persistedVideo({
        title: "Complete Rating Video",
        ratingJson:
          '{"rewatch":5,"performance":4,"visual":4,"intensity":3,"story":4,"chemistry":5}',
      });
      const invoke = vi.fn(async (command: string) => {
        if (command === "performer_list") return [];
        if (command === "image_list") return [];
        if (command === "video_create") return created;
        if (command === "video_get") return created;
        return [];
      }) as any;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      fireEvent.change(screen.getByLabelText(/^Title/), {
        target: { value: "Complete Rating Video" },
      });
      fillVideoRatingFields({
        Rewatch: "5",
        Performance: "4",
        Visual: "4",
        Intensity: "3",
        Story: "4",
        Chemistry: "5",
      });
      clickSaveAndConfirm();

      await waitFor(() => {
        expect(
          invoke.mock.calls.some(
            ([command, args]: [string, any]) =>
              command === "video_create" &&
              args.input.ratingJson ===
                '{"rewatch":5,"performance":4,"visual":4,"intensity":3,"story":4,"chemistry":5}',
      ),
    ).toBe(true);
  });
      expect(screen.queryByTestId("rating-validation-error")).not.toBeInTheDocument();
    });

    it("calculates the read-only average from all six criteria", async () => {
      window.history.pushState({}, "", "/videos/new");
      const invoke = vi.fn(async (command: string, args?: any) => {
        if (command === "performer_list") return [];
        if (command === "image_list") return [];
        return [];
      }) as any;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("1.0");
      fillVideoRatingFields({
        Rewatch: "5",
        Performance: "4",
        Visual: "4",
        Intensity: "3",
        Story: "4",
        Chemistry: "5",
      });

      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("4.2");
    });

    it("opens old invalid edit rating data as the default instead of 0", async () => {
      window.history.pushState({}, "", "/videos/video_test_001/edit");
      const invoke = vi.fn(async (command: string) => {
        if (command === "video_get") {
          return persistedVideo({
            title: "Old Rating Video",
            ratingJson: '{"rewatch":0,"performance":"bad","visual":6}',
          });
        }
        if (command === "performer_list" || command === "image_list") return [];
        return [];
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(await screen.findByDisplayValue("Old Rating Video")).toBeInTheDocument();
      for (const label of ["Rewatch", "Performance", "Visual", "Intensity", "Story", "Chemistry"]) {
        expect(screen.getByLabelText(label)).toHaveValue(1);
      }
      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("1.0");
      expect(screen.queryByDisplayValue("0")).not.toBeInTheDocument();
    });

    it("previews stars on hover without locking the value until click", async () => {
      window.history.pushState({}, "", "/videos/new");
      const invoke = vi.fn(async (command: string) => {
        if (command === "performer_list" || command === "image_list") return [];
        return [];
      }) as any;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      const rewatchInput = screen.getByLabelText("Rewatch");
      const starFour = screen.getByRole("button", { name: "Rate Rewatch 4 out of 5" });

      expect(rewatchInput).toHaveValue(1);
      fireEvent.mouseEnter(starFour);
      expect(rewatchInput).toHaveValue(1);
      fireEvent.mouseLeave(starFour.parentElement as HTMLElement);
      expect(rewatchInput).toHaveValue(1);

      fireEvent.mouseEnter(starFour);
      fireEvent.click(starFour);
      expect(rewatchInput).toHaveValue(4);
    });

    it.each([
      [
        "/videos",
        "video_list",
        persistedVideo({
          title: "Average Video",
          ratingJson:
            '{"rewatch":5,"performance":4,"visual":4,"intensity":3,"story":4,"chemistry":5}',
        }),
        "Rating 4.2",
      ],
      [
        "/images",
        "image_list",
        persistedImage({
          title: "Average Image",
          ratingJson:
            '{"memorability":5,"visual":4,"posing":4,"atmosphere":4,"flow":3,"signature":3}',
        }),
        "Rating 3.8",
      ],
      [
        "/performers",
        "performer_list",
        persistedPerformer({
          name: "Average Performer",
          ratingJson:
            '{"attraction":5,"visual":4,"performance":3,"popularity":3,"exceptional":3,"versatility":3}',
        }),
        "Rating 3.5",
      ],
    ])("renders full-card average rating from saved criteria at %s", async (path, command, record, label) => {
      window.history.pushState({}, "", path);
      const invoke = vi.fn(async (incomingCommand: string) => {
        if (incomingCommand === command) return [record];
        return [];
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    });

    it("does not show fake zero for old invalid card rating data", async () => {
      window.history.pushState({}, "", "/videos");
      const invoke = vi.fn(async (command: string) => {
        if (command === "video_list") {
          return [persistedVideo({ title: "Invalid Rating Video", ratingJson: '{"rewatch":0}' })];
        }
        return [];
      }) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(await screen.findByText("Invalid Rating Video")).toBeInTheDocument();
      expect(screen.getByLabelText("Rating n/a")).toBeInTheDocument();
      expect(screen.queryByLabelText("Rating 0.0")).not.toBeInTheDocument();
    });
  }, 10000);
});

function expectSectionOrder(sections: Array<HTMLElement | null>) {
  for (const section of sections) {
    expect(section).not.toBeNull();
  }

  const resolvedSections = sections as HTMLElement[];

  for (let index = 0; index < resolvedSections.length - 1; index += 1) {
    expect(
      resolvedSections[index].compareDocumentPosition(resolvedSections[index + 1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
}

function expectPrecedes(container: HTMLElement, firstText: string, secondText: string) {
  const first = within(container).getByText(firstText);
  const second = within(container).getByText(secondText);

  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

function selectRelatedSort(scope: ReturnType<typeof within>, optionName: string) {
  fireEvent.click(scope.getByTestId("performer-related-sort-control"));
  fireEvent.click(
    within(scope.getByRole("listbox", { name: "Related sort options" }))
      .getByRole("option", { name: optionName }),
  );
}

function formatExpectedLocalTimestamp(value: string | number) {
  return formatLocalTimestampDisplay(value);
}

function setManagedCategories(categories: string[]) {
  window.localStorage.setItem(
    "sakurava.managedCategories.v1",
    JSON.stringify(categories),
  );
}

function seedPerformerSuggestionCache(cache: Record<string, string[]>) {
  window.localStorage.setItem(
    "sakurava.performerSuggestionCache.v1",
    JSON.stringify(cache),
  );
  window.localStorage.setItem(
    "sakurava.performerSuggestionsCacheVersion",
    "batch-38-9-4-direct-field-history-v1",
  );
}

function managedCategoryFixture(overrides: Record<string, unknown> = {}) {
  return {
    key: "cat_test",
    name: "Managed Category",
    parentKey: null,
    description: "",
    thumbnailPath: "",
    showInVideos: true,
    showInImages: true,
    showInPerformers: true,
    showInCredits: false,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

function performerTaxonomyFixtures(bodyTypeParentName: string) {
  return [
    managedCategoryFixture({
      key: "cat_gender",
      name: "Gender",
    }),
    managedCategoryFixture({
      key: "cat_gender_woman",
      name: "Woman",
      parentKey: "cat_gender",
      showInVideos: false,
      showInImages: false,
      showInPerformers: true,
    }),
    managedCategoryFixture({
      key: "cat_body_type",
      name: bodyTypeParentName,
    }),
    managedCategoryFixture({
      key: "cat_body_type_athletic",
      name: "Athletic",
      parentKey: "cat_body_type",
      showInVideos: false,
      showInImages: false,
      showInPerformers: true,
    }),
  ];
}

function persistedGlossaryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "glossary_test_001",
    term: "Persisted Term",
    definition: "Persisted glossary definition.",
    synonymsJson: '["Persisted synonym"]',
    category: "Concepts",
    parentId: "",
    thumbnailPath: "",
    favorite: false,
    sourceTitle: "Persisted source",
    sourceUrl: "https://example.invalid/persisted",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function fillVideoRatingFields(overrides: Record<string, string> = {}) {
  fillRatingFields(
    ["Rewatch", "Performance", "Visual", "Intensity", "Story", "Chemistry"],
    overrides,
  );
}

function fillImageRatingFields(overrides: Record<string, string> = {}) {
  fillRatingFields(
    ["Memorability", "Visual", "Posing", "Atmosphere", "Flow", "Signature"],
    overrides,
  );
}

function fillPerformerRatingFields(overrides: Record<string, string> = {}) {
  fillRatingFields(
    ["Attraction", "Visual", "Performance", "Popularity", "Exceptional", "Versatility"],
    overrides,
  );
}

function fillRatingFields(labels: string[], overrides: Record<string, string>) {
  for (const label of labels) {
    const rating = overrides[label] ?? "4";
    fireEvent.click(
      screen.getByRole("button", {
        name: `Rate ${label} ${rating} out of 5`,
      }),
    );
  }
}

function persistedVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "video_test_001",
    title: "Persisted Video",
    originalTitle: "Original Persisted",
    code: "VID-001",
    censorship: "Censored",
    availability: "Owned",
    releaseDate: "2026-05-11",
    durationMinutes: 120,
    resolution: "",
    fileSizeBytes: null,
    fileType: "",
    publisherLabel: "Sakura Label",
    coverPath: "",
    mediaPath: "",
    categoriesJson: '["Classic"]',
    relatedPerformersJson: "[]",
    relatedImagesJson: "[]",
    sourceLinksJson: "[]",
    ratingJson: '{"rewatch":4,"performance":3}',
    notes: "Persisted notes",
    favorite: true,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

function persistedImage(overrides: Record<string, unknown> = {}) {
  return {
    id: "image_test_001",
    title: "Persisted Image",
    originalTitle: "Original Persisted Image",
    code: "IMG-001",
    censorship: "Censored",
    availability: "Owned",
    releaseDate: "2026-05-11",
    publisherLabel: "Sakura Label",
    coverPath: "",
    folderPath: "",
    imageCount: 24,
    mainResolution: "",
    totalFileSizeBytes: null,
    mainFileType: "",
    galleryImagePathsJson: "[]",
    categoriesJson: '["Portrait"]',
    relatedPerformersJson: "[]",
    relatedVideosJson: "[]",
    sourceLinksJson: "[]",
    ratingJson: '{"memorability":4,"visual":3}',
    notes: "Persisted image notes",
    favorite: true,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

function persistedPerformer(overrides: Record<string, unknown> = {}) {
  return {
    id: "performer_test_001",
    name: "Persisted Performer",
    originalName: "Original Persisted",
    aliasesJson: '["Alias One"]',
    status: "Active",
    debutDate: "",
    retiredDate: "",
    birthDate: "2026-05-11",
    gender: "",
    birthplace: "",
    nationality: "",
    bloodType: "",
    heightCm: null,
    weightKg: null,
    measurements: "",
    cupSize: "",
    coverPath: "",
    performerThumbnailPathsJson: "[]",
    filmographyCount: 12,
    pictorialsCount: 8,
    relatedVideosJson: "[]",
    relatedImagesJson: "[]",
    sourceLinksJson: "[]",
    categoriesJson: '["Classic"]',
    ratingJson: '{"attraction":4,"visual":3}',
    notes: "Persisted performer notes",
    favorite: true,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

function persistedCredit(overrides: Record<string, unknown> = {}) {
  return {
    id: "credit_test_001",
    workType: "video",
    workId: "video_test_001",
    performerId: "performer_test_001",
    characterName: "",
    characterOriginalName: null,
    creditedAs: null,
    creditedAsMode: "auto",
    creditTypeCategoryId: null,
    roleImportanceCategoryId: null,
    characterMode: "text",
    characterId: null,
    billingOrder: null,
    note: null,
    legacySourceKey: null,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}

function relatedCatalogJson(prefix: string, count: number) {
  return JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      recordId: `${prefix}_${index + 1}`,
      titleSnapshot: `${prefix} ${index + 1}`,
    })),
  );
}
