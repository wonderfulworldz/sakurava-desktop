import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "./App";
import StickyHorizontalScroll from "./components/StickyHorizontalScroll";
import GlobalImageViewer from "./components/gallery/GlobalImageViewer";
import GlobalImageViewerWindow from "./components/gallery/GlobalImageViewerWindow";
import CategoriesPage from "./pages/CategoriesPage";
import { appearanceThemeStorageKey } from "./lib/appearanceTheme";
import { formatDateOnlyDisplay, formatLocalTimestampDisplay } from "./lib/dateDisplay";
import { sakuravaRef } from "./lib/exportCsv";
import { languageStorageKey } from "./lib/language";
import { rankPickerSearchResults } from "./lib/relatedPicker";
import { clearAllSessionFilterStateForTests } from "./lib/sessionFilterState";

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

describe("App", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.history.pushState({}, "", "/");
    delete window.__TAURI_INTERNALS__;
    delete (window as Partial<Window>).__TAURI_EVENT_PLUGIN_INTERNALS__;
    window.localStorage.clear();
    clearAllSessionFilterStateForTests();
    delete document.documentElement.dataset.theme;
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
    expect(
      screen.getByText(
        "Glossary entries are independent from Video, Image, Performer, and Category catalog metadata.",
      ),
    ).toBeInTheDocument();
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

    for (const column of ["Term", "Synonyms", "Categories", "Definition", "Source"]) {
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
    ).toEqual(["All", "Parent Only", "Child Only"]);
    expect(
      within(screen.getByRole("listbox", { name: "Category filter options" })).queryByRole(
        "searchbox",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Parent Only" }));

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
      screen.getByRole("button", { name: "Remove filter Filter: Parent Only" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove filter Filter: Parent Only" }),
    ).toHaveTextContent("Filter: Parent Only");
    expect(
      screen.getByRole("row", { name: "Edit glossary entry Category Drift" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: "Edit glossary entry Source Citation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove filter Filter: Parent Only" }));
    fireEvent.click(glossaryFilterControl);
    fireEvent.click(
      screen.getByRole("option", { name: "Child Only" }),
    );

    expect(within(glossaryFilterControl).queryByText("Categories")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 active filters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter Filter: Child Only" }))
      .toHaveTextContent("Filter: Child Only");
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
      screen.getByRole("option", { name: "Parent Only" }),
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
      screen.getByRole("button", { name: "Remove filter Filter: Parent Only" }),
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

    for (const option of ["Term A-Z", "Term Z-A", "Last Added", "Last Updated"]) {
      fireEvent.focus(screen.getByLabelText("Sort"));
      expect(screen.getByRole("button", { name: `Select sort ${option}` }))
        .toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Sort by Term" }));
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
      screen.getByRole("button", { name: "Sort by Term" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Term" }));
    expect(
      screen.getByRole("button", { name: "Sort by Term" }).closest("th"),
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("truncates long Glossary table values without widening columns", async () => {
    window.history.pushState({}, "", "/glossary");
    const invoke = vi.fn(async (command: string) => {
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

    selectCategoryFilter("Performer Used");
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
  });

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
      filters: ["Status", "Age", "Body Height", "Nationality", "Body Type", "Debut Years", "Cup Size", "Rating", "Filmography Count", "Category", "Pictorials Count", "Gender"],
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

  it("filters Performer Catalog by Gender and Body Type taxonomy labels", async () => {
    window.history.pushState({}, "", "/performers");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_alpha",
            name: "Alpha Performer",
            categoriesJson: '["Woman","Athletic","Featured"]',
          }),
          persistedPerformer({
            id: "performer_beta",
            name: "Beta Performer",
            categoriesJson: '["Man","Slim","Featured"]',
          }),
          persistedPerformer({
            id: "performer_gamma",
            name: "Gamma Performer",
            categoriesJson: '["Woman","Slim"]',
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
    fireEvent.click(genderOptions.getByText("Woman"));

    expect(screen.getByText("Alpha Performer")).toBeInTheDocument();
    expect(screen.getByText("Gamma Performer")).toBeInTheDocument();
    expect(screen.queryByText("Beta Performer")).not.toBeInTheDocument();
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

    expect(panel.getByText("No Gender categories found")).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "Profile Metadata" }).closest("section"),
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
      heading: "Profile Metadata",
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
    expect(
      screen.getByText(
        "Manage application preferences, optimization, data safety, and app information.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Appearance" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Language" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Optimization" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data Safety & Migration" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "App Information" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByText("Accent Style")).toBeInTheDocument();
    expect(screen.getByText("UI Density")).toBeInTheDocument();
    expect(screen.getAllByText("App Language").length).toBeGreaterThan(0);
    expect(screen.getByText("Installed Languages")).toBeInTheDocument();
    expect(screen.getByText("Language CSV Tools")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Media & Library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cache" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catalog Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scanning & Updates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backup & Restore" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Import & Export" })).toBeInTheDocument();
    expect(screen.getByText("App Version")).toBeInTheDocument();
    expect(screen.getByText("Database Status")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Category Management" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Category Management" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Catalog Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Categories Audit")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sakurava").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1.0.0 MVP")).toBeInTheDocument();
    expect(screen.getByText("Local / Offline")).toBeInTheDocument();
    expect(screen.getByText("Windows Desktop")).toBeInTheDocument();
    expect(screen.getAllByText("Browser preview").length).toBeGreaterThan(0);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Local SQLite database")).toBeInTheDocument();
    expect(screen.getByText("All data is stored locally on this device.")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Not tracked yet")).toBeInTheDocument();
    expect(screen.getByText("Manual thumbnail rendering")).toBeInTheDocument();
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Pictures, Videos, Documents, and Downloads/),
    ).toBeInTheDocument();
    expect(screen.getByText("Media Loading")).toBeInTheDocument();
    expect(screen.getByText("Hardware Acceleration")).toBeInTheDocument();
    expect(screen.getByText("Parallel Processing")).toBeInTheDocument();
    expect(screen.getByText("Default View")).toBeInTheDocument();
    expect(screen.getByText("Default Sort")).toBeInTheDocument();
    expect(screen.getByText("Items per Page")).toBeInTheDocument();
    expect(screen.getByText("Auto Scan New Folders")).toBeInTheDocument();
    expect(screen.getByText("Scan Interval")).toBeInTheDocument();
    expect(screen.getByText("Ignore Short Videos")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Category name")).not.toBeInTheDocument();
    expect(screen.queryByText("Apply Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Apply Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Runtime CRUD enabled")).not.toBeInTheDocument();
    expect(screen.getByText("Cache Size")).toBeInTheDocument();
    expect(screen.getByText("Thumbnail Cache")).toBeInTheDocument();
    expect(screen.getByText("Batch 35 planning")).toBeInTheDocument();
    expect(screen.getByText("Preview Cache")).toBeInTheDocument();
    expect(screen.getByText("CSV data exchange for Videos, Images, Performers, and Categories. Export, Import Preview, and confirmed Apply are available now. No media files are included.")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getAllByText("Planned / disabled").length).toBeGreaterThan(0);
    expect(screen.getByText(/Sakura Pink/)).toBeInTheDocument();
    expect(screen.getByText("Compact")).toBeInTheDocument();
    expect(screen.getByText("Comfortable")).toBeInTheDocument();
    expect(screen.getByText("Spacious")).toBeInTheDocument();
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Indonesian").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Changes apply to app UI only. Catalog data is not translated."),
    ).toBeInTheDocument();
    expect(screen.getByText("Export Starter CSV")).toBeInTheDocument();
    expect(screen.getByText("Import Custom Language")).toBeInTheDocument();
    expect(screen.getByText("Remove Custom Language")).toBeInTheDocument();
    expect(screen.getByText("Reset Custom Language")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Clearing cache does not delete your source media.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Full app data safety for database/sql-like backups. Generated thumbnails/cache-like app data may be included later; original media files are not included.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sakurava works completely offline. Back up your database regularly to prevent data loss. Clearing cache will not delete your source media or catalog data.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Keep your data safe")).toBeInTheDocument();
    expect(screen.queryByText("Welcome Slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to Defaults" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Backup Database" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Database" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear Cache" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import Data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Data" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Export Videos CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Images CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Performers CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Categories CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Import CSV preview" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Dark$/ })).toBeEnabled();
    // Language Editor UI is removed — no editor table, search, or region
    expect(screen.queryByRole("region", { name: "Language Editor" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search translation keys")).not.toBeInTheDocument();
    // English shown as primary/not removable
    expect(screen.getByText("Not removable")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    // Indonesian shown as custom/removable
    expect(screen.getByText("Removable")).toBeInTheDocument();
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
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText("App Language"), {
      target: { value: "id" },
    });

    expect(window.localStorage.getItem(languageStorageKey)).toBe("id");
    expect(screen.getByRole("heading", { name: "Pengaturan" }))
      .toBeInTheDocument();
    expect(screen.getByText("Bahasa Aplikasi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Keamanan Data & Migrasi" }))
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

  it("does not translate user catalog data", () => {
    window.localStorage.setItem(languageStorageKey, "id");
    setManagedCategories(["Settings"]);
    window.history.pushState({}, "", "/categories");

    render(<App />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows desktop runtime database status when Tauri is available", () => {
    window.history.pushState({}, "", "/settings");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    render(<App />);

    expect(screen.getAllByText("Desktop runtime").length).toBeGreaterThan(0);
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Runtime Status")).toBeInTheDocument();
  });

  it("renders Data Safety actions and reveals Export CSV actions progressively", () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list" || command === "image_list" || command === "performer_list") {
        return [];
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(screen.getByRole("button", { name: "Import Data" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Data" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Backup Database" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Restore Database" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Export Videos CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Images CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Performers CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export Categories CSV" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Import CSV preview" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/confirmed Apply are available now/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export Data" }));

    expect(screen.getByRole("button", { name: "Export Videos CSV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Images CSV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Performers CSV" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Categories CSV" })).toBeEnabled();
  });

  it("previews Video CSV import without mutating records", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-videos.csv";
    const existingVideo = persistedVideo({
      id: "video-import-1",
      title: "Original Video",
      categoriesJson: '["Favorite"]',
    });
    const csvContent = [
      "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label,Censorship,Categories,Rating - Visual,Rating - Story,Rating - Performance,Rating - Chemistry,Rating - Intensity,Rating - Rewatch,Media Path,Cover Path,Related Performers,Related Images,Notes",
      `Auto,${sakuravaRef("VID", "video-import-1")},,Changed Video,,,,,Favorite; Unknown,,,,,,,,,,,`,
      "Add,,,New Video,,,,,Favorite,,,,,,,,,,,",
      `Delete,${sakuravaRef("VID", "video-import-1")},,Original Video,,,,,Favorite,,,,,,,,,,,`,
      "Skip,,,Ignored Video,,,,,,,,,,,,,,,",
    ].join("\r\n");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "video_list") {
        return [existingVideo];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }
      if (command === "managed_category_list") {
        return [managedCategoryFixture({ name: "Favorite" })];
      }
      if (command === "import_csv_read") {
        expect(args.sourcePath).toBe(sourcePath);
        return {
          sourcePath,
          csvContent,
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

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));

    expect(await screen.findByRole("region", { name: "Import CSV preview" }))
      .toBeInTheDocument();
    expect(screen.getByText("sakurava-videos.csv")).toBeInTheDocument();
    expect(screen.getByText("Videos CSV - 4 rows")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Preview only. No data has been changed.")).toBeInTheDocument();
    expect(screen.getByText("Apply changes database records only after confirmation.")).toBeInTheDocument();
    expect(screen.getByText("Delete affects catalog records only. Original media files are not deleted.")).toBeInTheDocument();
    const previewTable = screen.getByRole("table");
    for (const column of ["Row", "Action", "Result", "Target", "Changes", "Status"]) {
      expect(within(previewTable).getByRole("columnheader", { name: column }))
        .toBeInTheDocument();
    }
    expect(screen.getAllByText("Modified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Added").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deleted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.getByText("Will create record")).toBeInTheDocument();
    expect(screen.getByText("Will delete catalog record only")).toBeInTheDocument();
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.getByText(/Unknown category: Unknown/)).toBeInTheDocument();
    expect(screen.getAllByText(/Original media files are not deleted/).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Apply Valid Rows" }))
      .toBeEnabled();
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

  it("applies valid CSV rows only after explicit confirmation and shows report", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-videos-apply.csv";
    const csvContent = [
      "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label,Censorship,Categories,Rating - Visual,Rating - Story,Rating - Performance,Rating - Chemistry,Rating - Intensity,Rating - Rewatch,Media Path,Cover Path,Related Performers,Related Images,Notes",
      "Add,,,New Applied Video,,,,,Favorite,,,,,,4,D:/media/new.mp4,,,,Created from CSV",
    ].join("\r\n");
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
      if (command === "import_csv_read") {
        return {
          sourcePath,
          csvContent,
          bytesRead: csvContent.length,
          success: true,
        };
      }
      if (command === "video_create") {
        expect(args.input).toEqual(
          expect.objectContaining({
            title: "New Applied Video",
            categoriesJson: '["Favorite"]',
            mediaPath: "D:/media/new.mp4",
            ratingJson: '{"rewatch":4}',
            notes: "Created from CSV",
          }),
        );
        return persistedVideo({ id: "video_created", ...args.input });
      }

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    expect(screen.queryByRole("button", { name: "Apply Valid Rows" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));
    expect(await screen.findByRole("region", { name: "Import CSV preview" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Valid Rows" }));

    expect(screen.getByText("Confirm CSV import apply")).toBeInTheDocument();
    expect(screen.getByText(/Create a Backup Database before applying imports/))
      .toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_create",
      expect.anything(),
      undefined,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply Valid Rows" })[1]);

    expect(await screen.findByRole("region", { name: "Import apply report" }))
      .toBeInTheDocument();
    expect(screen.getByText("Import apply completed.")).toBeInTheDocument();
    expect(screen.getByText("Original media files were not modified or deleted."))
      .toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith(
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

  it("keeps Category CSV apply consistent between Categories Catalog and Manage Category", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Imports/sakurava-categories-apply.csv";
    let categories = [
      managedCategoryFixture({ key: "cat_old", name: "Old Category" }),
    ];
    const csvContent = [
      "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Visibility,Notes",
      `Delete,${sakuravaRef("CAT", "cat_old")},,Old Category,,,,`,
      "Add,,,New Category,Imported,,,",
    ].join("\r\n");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
        return [];
      }
      if (command === "managed_category_list") {
        return categories;
      }
      if (command === "import_csv_read") {
        return {
          sourcePath,
          csvContent,
          bytesRead: csvContent.length,
          success: true,
        };
      }
      if (command === "managed_category_delete") {
        categories = categories.filter((category) => category.key !== args.key);
        return { key: args.key, deleted: true };
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

      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));
    expect(await screen.findByRole("region", { name: "Import CSV preview" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Valid Rows" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Apply Valid Rows" })[1]);
    expect(await screen.findByRole("region", { name: "Import apply report" }))
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
      if (command === "export_csv_write") {
        expect(args.destinationPath).toBe(destinationPath);
        expect(args.csvContent).toContain(
          "Action,Sakurava Ref,Code,Title,Original Title,Release Date,Publisher / Label",
        );
        expect(args.csvContent).toContain("V-EXPORT-001");
        expect(args.csvContent).toContain("2026-05-20");
        expect(args.csvContent).not.toContain("5/20/2026");
        expect(args.csvContent).toContain("Auto,VID-");
        expect(args.csvContent).not.toContain("sakuravaUpdateKey");
        expect(args.csvContent).not.toContain("video-export-1");
        expect(args.csvContent).not.toContain("ratingJson");
        expect(args.csvContent).not.toContain("categoriesJson");
        expect(args.csvContent).toContain('"Video, ""Export"""');
        expect(args.csvContent).toContain("Drama; Favorite");
        expect(args.csvContent).toContain(",,5,,,,");
        expect(args.csvContent).toMatch(/PER-[0-9A-Z]{7} \| Performer One/);
        expect(args.csvContent).toContain("D:/Videos/export.mp4");
        expect(args.csvContent).not.toContain("Duration");
        expect(args.csvContent).not.toContain("Availability");
        expect(args.csvContent).not.toContain("mediaBinary");
        return {
          destinationPath: args.destinationPath,
          bytesWritten: args.csvContent.length,
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

    fireEvent.click(screen.getByRole("button", { name: "Export Data" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Videos CSV" }));

    await screen.findByText(
      `${destinationPath}. 1 record exported. Media files were not copied.`,
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
      if (command === "export_csv_write") {
        expect(args.destinationPath).toBe(destinationPath);
        expect(args.csvContent).toContain(
          "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Show in Videos,Show in Images,Show in Performers,Visibility,Notes",
        );
        expect(args.csvContent).toContain("Auto,CAT-");
        expect(args.csvContent).toContain(",Genre,Drama,");
        expect(args.csvContent).not.toContain("cat_parent");
        expect(args.csvContent).not.toContain("cat_child");
        return {
          destinationPath: args.destinationPath,
          bytesWritten: args.csvContent.length,
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

    fireEvent.click(screen.getByRole("button", { name: "Export Data" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Categories CSV" }));

    await screen.findByText(
      `${destinationPath}. 2 records exported. Media files were not copied.`,
      { exact: false },
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "managed_category_update",
      expect.anything(),
      undefined,
    );
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
    for (const column of ["Name", "Parent", "Description", "Usage", "Total Usage"]) {
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
    expect(screen.getByLabelText("Categories per page")).toHaveClass(
      "h-9",
      "rounded-lg",
      "border-slate-200",
      "px-3",
    );
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
      "Last Updated",
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
    expect(usedInControls).toHaveClass("grid", "w-full", "grid-cols-3");
    for (const label of ["Videos", "Images", "Performers"]) {
      const toggle = within(usedInControls).getByRole("button", {
        name: `Show in ${label}`,
      });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveClass("bg-slate-50", "text-slate-500");
    }
    fireEvent.click(
      within(usedInControls).getByRole("button", { name: "Show in Images" }),
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
    expect(cardPlaceholder.parentElement?.className).toContain("bg-[radial-gradient");
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

    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("Parent Category");
    expect(bodyRows[1]).toHaveTextContent("Child Category");
    expect(
      screen.getByRole("button", { name: "Sort by Name" }).closest("th"),
    ).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(
      screen.getByRole("button", { name: "Sort by Name" }).closest("th"),
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

    selectCategoryFilter("Childs Only");

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
    expect(screen.getByRole("button", { name: "Remove Filter: Childs Only filter" }))
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
    expect(screen.getByRole("button", { name: "Remove Filter: Childs Only filter" }))
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
    expect(screen.getByText("1 configured")).toBeInTheDocument();
    expect(screen.getByText(/choose a folder, not a drive root/i)).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByText(displayRoot)).not.toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.mediaAssetRoots.v1")).toBe(
      JSON.stringify([]),
    );
    expect(
      screen.getByText("Removed roots stop being restored after restart."),
    ).toBeInTheDocument();
  });

  it("cancels database backup without calling the backup command", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn();
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.save.mockResolvedValue(null);

    render(<App />);

    const backupButton = screen.getByRole("button", { name: "Backup Database" });
    expect(backupButton).toBeEnabled();
    fireEvent.click(backupButton);

    await waitFor(() => expect(dialogMocks.save).toHaveBeenCalledTimes(1));
    expect(invoke).not.toHaveBeenCalledWith(
      "database_backup",
      expect.anything(),
      undefined,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Database" })).toBeEnabled();
  });

  it("backs up the database to the selected destination", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Backups/sakurava-backup-2026-05-13.sqlite";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "database_backup") {
        return {
          destinationPath: args.destinationPath,
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

    fireEvent.click(screen.getByRole("button", { name: "Backup Database" }));

    await screen.findByText(`Backup created at ${destinationPath}`);
    expect(dialogMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(
          /^skv-backup-\d{8}-\d{6}\.sqlite$/,
        ),
        filters: [
          {
            name: "SQLite database",
            extensions: ["sqlite"],
          },
        ],
      }),
    );
    expect(invoke).toHaveBeenCalledWith(
      "database_backup",
      { destinationPath },
      undefined,
    );
  });

  it("prevents duplicate backup submits while pending", async () => {
    window.history.pushState({}, "", "/settings");
    let resolveDestination: (destinationPath: string) => void = () => {};
    const destinationPathPromise = new Promise<string>((resolve) => {
      resolveDestination = resolve;
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "database_backup") {
        return {
          destinationPath: args.destinationPath,
          success: true,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.save.mockReturnValue(destinationPathPromise);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Database" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Backing Up...",
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(dialogMocks.save).toHaveBeenCalledTimes(1);

    resolveDestination("D:/Backups/sakurava-backup.sqlite");
    await screen.findByText("Backup created at D:/Backups/sakurava-backup.sqlite");
    expect(
      invoke.mock.calls.filter(([command]) => command === "database_backup"),
    ).toHaveLength(1);
  });

  it("shows an error when database backup fails", async () => {
    window.history.pushState({}, "", "/settings");
    const destinationPath = "D:/Backups/sakurava-backup.sqlite";
    const invoke = vi.fn(async (command: string) => {
      if (command === "database_backup") {
        throw new Error("Unable to back up SQLite database");
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.save.mockResolvedValue(destinationPath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Backup Database" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to back up SQLite database",
    );
    expect(screen.getByRole("button", { name: "Backup Database" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Restore Database" })).toBeEnabled();
  });

  it("cancels restore source selection without calling the restore command", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn();
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue(null);

    render(<App />);

    const restoreButton = screen.getByRole("button", { name: "Restore Database" });
    expect(restoreButton).toBeEnabled();
    fireEvent.click(restoreButton);

    await waitFor(() => expect(dialogMocks.open).toHaveBeenCalledTimes(1));
    expect(dialogMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "SQLite database",
            extensions: ["sqlite"],
          },
        ],
      }),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "database_restore",
      expect.anything(),
      undefined,
    );
    expect(screen.queryByText("Confirm database restore")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires confirmation before restoring a selected database", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn();
    const sourcePath = "D:/Backups/sakurava-backup.sqlite";
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));

    expect(await screen.findByText("Confirm database restore")).toBeInTheDocument();
    expect(
      screen.getByText("Current Sakurava database will be replaced."),
    ).toBeInTheDocument();
    expect(screen.getByText("Only records are restored.")).toBeInTheDocument();
    expect(
      screen.getByText("Local media files are not restored or deleted."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A safety backup will be created first."),
    ).toBeInTheDocument();
    expect(screen.getByText(`Source: ${sourcePath}`)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "database_restore",
      expect.anything(),
      undefined,
    );
  });

  it("cancels restore confirmation without calling the restore command", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn();
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue("D:/Backups/sakurava-backup.sqlite");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Confirm database restore")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "database_restore",
      expect.anything(),
      undefined,
    );
  });

  it("restores the selected database after confirmation", async () => {
    window.history.pushState({}, "", "/settings");
    const sourcePath = "D:/Backups/sakurava-backup.sqlite";
    const safetyBackupPath =
      "C:/Users/Example/AppData/Roaming/app.sakurava.desktop/sakurava-before-restore.sqlite";
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "database_restore") {
        return {
          sourcePath: args.sourcePath,
          success: true,
          safetyBackupPath,
          restartRequired: false,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Restore database" }));

    await screen.findByText(
      `Restored database from ${sourcePath}. Safety backup: ${safetyBackupPath}.`,
    );
    expect(invoke).toHaveBeenCalledWith(
      "database_restore",
      { sourcePath },
      undefined,
    );
  });

  it("shows restart guidance when restore reports restartRequired", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "database_restore") {
        return {
          sourcePath: args.sourcePath,
          success: true,
          safetyBackupPath: "C:/Safety/sakurava-before-restore.sqlite",
          restartRequired: true,
        };
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue("D:/Backups/sakurava-backup.sqlite");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Restore database" }));

    expect(
      await screen.findByText(/Restart Sakurava to use the restored database\./),
    ).toBeInTheDocument();
  });

  it("prevents duplicate restore submits while pending", async () => {
    window.history.pushState({}, "", "/settings");
    let resolveRestore: (result: {
      sourcePath: string;
      success: boolean;
      safetyBackupPath: string;
      restartRequired: boolean;
    }) => void = () => {};
    const restorePromise = new Promise<{
      sourcePath: string;
      success: boolean;
      safetyBackupPath: string;
      restartRequired: boolean;
    }>((resolve) => {
      resolveRestore = resolve;
    });
    const sourcePath = "D:/Backups/sakurava-backup.sqlite";
    const invoke = vi.fn(async (command: string) => {
      if (command === "database_restore") {
        return restorePromise;
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke: invoke as unknown as TestTauriInvoke,
    };
    dialogMocks.open.mockResolvedValue(sourcePath);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Restore database" }));

    const pendingButton = await screen.findByRole("button", {
      name: "Restoring...",
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(
      invoke.mock.calls.filter(([command]) => command === "database_restore"),
    ).toHaveLength(1);

    resolveRestore({
      sourcePath,
      success: true,
      safetyBackupPath: "C:/Safety/sakurava-before-restore.sqlite",
      restartRequired: false,
    });
    await screen.findByText(
      "Restored database from D:/Backups/sakurava-backup.sqlite. Safety backup: C:/Safety/sakurava-before-restore.sqlite.",
    );
  });

  it("shows an error when database restore fails", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (command === "database_restore") {
        throw new Error("Restore source failed SQLite integrity check");
      }
      throw new Error(`Unexpected command ${command}`);
    });
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue("D:/Backups/broken.sqlite");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Restore Database" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Restore database" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Restore source failed SQLite integrity check",
    );
    expect(screen.getByRole("button", { name: "Restore Database" })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Import Data" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export Data" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Export Videos CSV" }))
      .not.toBeInTheDocument();
  });

  it("shows an error when cache cleanup fails safely", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (["video_list", "image_list", "performer_list"].includes(command)) {
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
    expect(categoriesRow).toHaveClass(
      "lg:grid-cols-[180px_minmax(0,1fr)]",
      "lg:items-start",
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

    const statusSection = screen.getByText("Status").closest("div") as HTMLElement;
    for (const label of ["Active", "Retired", "Unknown"]) {
      const chip = within(statusSection)
        .getAllByText(label)
        .find((element) => element.tagName === "SPAN") as HTMLElement;
      expect(chip).toHaveClass("rounded-md");
      expect(chip).not.toHaveClass("rounded-full");
    }
    expect(screen.getByLabelText("Status")).toHaveValue("Unknown");
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
      screen.getByRole("heading", { name: "Files" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Categories" }).closest("section"),
      screen.getByRole("heading", { name: "Rating" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performer" }).closest("section"),
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
      "Not detected yet",
    );
    expect(techInfo.getByText("Resolution")).toBeInTheDocument();
    expect(techInfo.getByLabelText("Resolution")).toHaveAttribute(
      "placeholder",
      "Not detected yet",
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
      screen.getByRole("heading", { name: "Files" }).closest("section"),
      screen.getByRole("heading", { name: "Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "Categories" }).closest("section"),
      screen.getByRole("heading", { name: "Rating" }).closest("section"),
      screen.getByRole("heading", { name: "Related Performer" }).closest("section"),
      screen.getByRole("heading", { name: "Related Video" }).closest("section"),
      screen.getByRole("heading", { name: "Notes" }).closest("section"),
    ]);

    const metadata = within(
      screen.getByRole("heading", { name: "Metadata" }).closest("section") as HTMLElement,
    );
    const techInfo = within(
      screen.getByRole("heading", { name: "Tech Info" }).closest("section") as HTMLElement,
    );

    expect(screen.queryByLabelText("Gallery Folder Path")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Related Performer" }))
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

    expect(screen.getByRole("heading", { name: "Related Video" }))
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

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

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
    expect(screen.getByLabelText("Search related performers")).toHaveValue("cherry");
    const selectedPerformerChipText = screen.getByText("Aoi Sakura");
    expect(selectedPerformerChipText).toHaveClass(
      "min-w-0",
      "truncate",
      "whitespace-nowrap",
    );
    expect(screen.queryByText("performer_aoi")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear related performer search" }));
    expect(screen.getByLabelText("Search related performers")).toHaveValue("");

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
  });

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
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
    expect(screen.queryByText("missing_performer")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove related performer Former Performer",
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

  it("expands, collapses, removes, and clears related performer chips", async () => {
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
      name: "Related Performer",
    })).closest("section") as HTMLElement;
    const relatedPerformers = within(performerSection);

    expect(relatedPerformers.getByText("Performer 1")).toBeInTheDocument();
    expect(relatedPerformers.queryByText("Performer 5")).not.toBeInTheDocument();
    fireEvent.click(relatedPerformers.getByRole("button", { name: "+2 more" }));
    expect(relatedPerformers.getByText("Performer 5")).toBeInTheDocument();
    fireEvent.click(relatedPerformers.getByRole("button", { name: "Show less" }));
    expect(relatedPerformers.queryByText("Performer 5")).not.toBeInTheDocument();
    fireEvent.click(relatedPerformers.getByRole("button", { name: "+2 more" }));
    fireEvent.click(
      relatedPerformers.getByRole("button", {
        name: "Remove related performer Performer 5",
      }),
    );
    expect(relatedPerformers.queryByText("Performer 5")).not.toBeInTheDocument();
    expect(relatedPerformers.getByText("4 performers selected")).toBeInTheDocument();
    fireEvent.click(relatedPerformers.getByRole("button", { name: "Clear all" }));
    expect(relatedPerformers.getByText("No related performers selected.")).toBeInTheDocument();
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
    {
      path: "/performers/new",
      buttonName: "Browse",
      buttonIndex: 2,
      inputLabel: "Thumbnail 2",
      selectedPath: "D:/Sakurava/Performers/performer-thumb-2.webp",
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
      dataFilterLabel: "Status",
      dataFilterValue: "Active",
      dataChip: "Status: Active",
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
      sectionLabels: ["Status", "Cup Size", "Gender", "Body Height", "Age", "Body Type", "Nationality", "Debut Years", "Rating", "Filmography Count", "Category", "Pictorials Count"],
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
        expect(panel.getByText("No Gender categories found")).toBeInTheDocument();
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

    fireEvent.click(panel.getByRole("button", { name: "Status: Active" }));
    expect(screen.queryByRole("listbox", { name: "Category options" })).not.toBeInTheDocument();

    fireEvent.focus(panel.getByLabelText("Cup Size"));
    expect(panel.getByRole("listbox", { name: "Cup Size options" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Cup Size options" })).not.toBeInTheDocument();
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

    expect(screen.getByLabelText("Status")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Status")).toHaveValue("Unknown");
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Thumbnail 1")).not.toBeDisabled();
    expect(screen.getByLabelText("Thumbnail 2")).not.toBeDisabled();
    expect(screen.getByLabelText("Thumbnail 3")).not.toBeDisabled();
    expect(screen.getByLabelText("Thumbnail 4")).not.toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Browse" })).toHaveLength(5);
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

  it("derives non-editable Performer Status from debut and retired dates", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    const status = screen.getByLabelText("Status");
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

  it("loads local performer suggestions while preserving manual typing", async () => {
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

  it("caps performer suggestions at 10 most recent values", async () => {
    window.history.pushState({}, "", "/performers/new");
    seedPerformerSuggestionCache({
      birthplace: [
        "City 12",
        "City 11",
        "City 10",
        "City 9",
        "City 8",
        "City 7",
        "City 6",
        "City 5",
        "City 4",
        "City 3",
        "City 2",
        "City 1",
      ],
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
    ).toHaveLength(10);
    expect(within(birthplaceSuggestions).getByRole("button", { name: "City 12" }))
      .toBeInTheDocument();
    expect(within(birthplaceSuggestions).queryByRole("button", { name: "City 1" }))
      .not.toBeInTheDocument();
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

    await screen.findByLabelText("Birthplace");
    await waitFor(() =>
      expect(window.localStorage.getItem("sakurava.hiddenPerformerSuggestions.v1"))
        .toBeNull(),
    );
    expect(window.localStorage.getItem("sakurava.performerSuggestionCache.v1"))
      .toBeNull();
    expect(window.localStorage.getItem("sakurava.performerSuggestionCacheReset.v2"))
      .toBeNull();
    expect(window.localStorage.getItem("sakurava.performerSuggestionsCacheVersion"))
      .toBe("batch-33-3-suggestions-fresh-v1");
    expect(window.localStorage.getItem("sakurava.managedCategories.v1"))
      .toBe('["Classic"]');
    expect(performers[0].birthplace).toBe("Tokyo");
    expect(performers[0].cupSize).toBe("A");
  });

  it("removes performer suggestions locally by field and lets saved values return", async () => {
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
      screen.getByRole("heading", { name: "Media Assets" }).closest("section"),
      screen.getByRole("heading", { name: "Status & Activity" }).closest("section"),
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

    fireEvent.click(panel.getByRole("button", { name: "Status: Active" }));
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
      "STATUS",
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
        { timeout: 5000 },
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

  it("renders Performer Detail Gender and Body Type from taxonomy categories", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "performer_get") {
        return persistedPerformer({
          name: "Taxonomy Detail Performer",
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
    const metadata = screen
      .getByRole("heading", { name: "Profile Metadata" })
      .closest("section") as HTMLElement;
    const physical = screen
      .getByRole("heading", { name: "Physical" })
      .closest("section") as HTMLElement;
    expect(within(metadata).getByText("Gender")).toBeInTheDocument();
    expect(within(metadata).getByText("Woman")).toBeInTheDocument();
    expect(within(metadata).queryByText("Body Type")).not.toBeInTheDocument();
    expectPrecedes(metadata, "Gender", "Birth Date");
    expectPrecedes(metadata, "Birth Date", "Debut Date");
    expectPrecedes(metadata, "Debut Date", "Retired Date");
    expect(within(physical).getByText("Body Type")).toBeInTheDocument();
    expect(within(physical).getByText("Athletic")).toBeInTheDocument();
    expectPrecedes(physical, "Body Type", "Height");
    expectPrecedes(physical, "Height", "Weight");
    expectPrecedes(physical, "Weight", "Measurement");
    expectPrecedes(physical, "Measurement", "Cup Size");
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
    const metadata = screen
      .getByRole("heading", { name: "Profile Metadata" })
      .closest("section") as HTMLElement;
    const physical = screen
      .getByRole("heading", { name: "Physical" })
      .closest("section") as HTMLElement;
    expect(within(metadata).getByText("Gender")).toBeInTheDocument();
    expect(within(metadata).queryByText("Body Type")).not.toBeInTheDocument();
    expect(within(metadata).getAllByText("N/A").length).toBeGreaterThanOrEqual(1);
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
    const link = within(sourceSection).getByRole("link", { name: /Open source/ });

    const sourceIcon = sourceSection
      .querySelector("[data-testid='detail-section-icon'] svg");
    expect(sourceIcon).not.toBeNull();
    expect(sourceIcon).toHaveClass("lucide-earth");
    expect(sourceSection.querySelector("svg.lucide-info")).toBeNull();
    expect(within(sourceSection).queryByText("Source Title")).not.toBeInTheDocument();
    expect(within(sourceSection).queryByText("Source URL")).not.toBeInTheDocument();
    expect(within(sourceSection).getByText(/^(Studio|Image|Performer) source$/))
      .toBeInTheDocument();
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveTextContent(/^https:\/\/example\.invalid\//);
    expect(link).toHaveClass("truncate");
    expect(within(sourceSection).queryByText(/sourceLinksJson/))
      .not.toBeInTheDocument();
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
    expect(videos.getByRole("button", { name: "Card" })).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Table" })).toBeInTheDocument();
    expect(videos.getByLabelText("Sort")).toBeInTheDocument();
    expect(videos.getByText("Page size")).toBeInTheDocument();
    expect(videos.getByText("per page")).toBeInTheDocument();
    expect(videos.getByLabelText("Related items per page")).toHaveValue("12");
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "12" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "24" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "48" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Related items per page")).getByRole("option", { name: "96" }),
    ).toBeInTheDocument();
    expect(videos.getByText("Hanami Feature")).toBeInTheDocument();
    const relatedVideoCard = videos.getByText("Hanami Feature").closest("a");
    expect(relatedVideoCard).not.toBeNull();
    expect(relatedVideoCard).toHaveAttribute("href", "/videos/video_hanami");
    const videoRating = videos.getByLabelText("Rating 4.5");
    expect(videoRating).toHaveClass("bg-sakura-50");
    expect(videoRating).toHaveClass("text-sakura-600");
    expect(videoRating).not.toHaveClass("bg-sakura-500");
    fireEvent.click(videos.getByRole("button", { name: "Table" }));
    expect(videos.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "Publisher / Label" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "Release Year" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "Duration" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "Rating" })).toBeInTheDocument();
    expect(videos.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
    expect(videos.getByRole("link", { name: "View" })).toHaveAttribute("href", "/videos/video_hanami");

    const imagesSection = screen.getByRole("heading", { name: "Related Images" }).closest("section");
    expect(imagesSection).not.toBeNull();
    const images = within(imagesSection as HTMLElement);
    expect(images.getByRole("button", { name: "Card" })).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Table" })).toBeInTheDocument();
    expect(images.getByLabelText("Sort")).toBeInTheDocument();
    expect(images.getByText("Page size")).toBeInTheDocument();
    expect(images.getByText("per page")).toBeInTheDocument();
    expect(images.getByLabelText("Related items per page")).toHaveValue("12");
    expect(images.getByText("Hanami Gallery")).toBeInTheDocument();
    const relatedImageCard = images.getByText("Hanami Gallery").closest("a");
    expect(relatedImageCard).not.toBeNull();
    expect(relatedImageCard).toHaveAttribute("href", "/images/image_hanami");
    const imageRating = images.getByLabelText("Rating 4.0");
    expect(imageRating).toHaveClass("bg-sakura-50");
    expect(imageRating).toHaveClass("text-sakura-600");
    expect(imageRating).not.toHaveClass("bg-sakura-500");
    fireEvent.click(images.getByRole("button", { name: "Table" }));
    expect(images.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "Publisher / Label" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "Release Year" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "Images Total" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "Rating" })).toBeInTheDocument();
    expect(images.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
    expect(images.getByRole("link", { name: "View" })).toHaveAttribute("href", "/images/image_hanami");

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
    expect(videos.queryByText("Missing Date Video")).not.toBeInTheDocument();
    expect(videos.getByText("Showing 1-12 of 13")).toBeInTheDocument();
    expect(videos.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(videos.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Next" }));
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    expect(videos.getByText("Showing 13-13 of 13")).toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Previous" }));
    fireEvent.change(videos.getByLabelText("Related items per page"), { target: { value: "24" } });
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    expect(videos.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Related items per page"), { target: { value: "12" } });

    fireEvent.change(videos.getByLabelText("Sort"), { target: { value: "az" } });
    expectPrecedes(section as HTMLElement, "Alpha Video", "Middle Video");
    fireEvent.change(videos.getByLabelText("Sort"), { target: { value: "za" } });
    expectPrecedes(section as HTMLElement, "Zulu Video", "Page Video 9");
    fireEvent.change(videos.getByLabelText("Sort"), { target: { value: "new" } });
    expectPrecedes(section as HTMLElement, "Alpha Video", "Middle Video");
    expect(videos.queryByText("Missing Date Video")).not.toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Sort"), { target: { value: "old" } });
    expectPrecedes(section as HTMLElement, "Page Video 9", "Page Video 8");
    expect(videos.queryByText("Missing Date Video")).not.toBeInTheDocument();
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
    expect(images.queryByText("Missing Date Gallery")).not.toBeInTheDocument();
    expect(images.getByText("Showing 1-12 of 13")).toBeInTheDocument();
    expect(images.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(images.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
    fireEvent.click(images.getByRole("button", { name: "Next" }));
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    expect(images.getByText("Showing 13-13 of 13")).toBeInTheDocument();
    fireEvent.click(images.getByRole("button", { name: "Previous" }));
    fireEvent.change(images.getByLabelText("Related items per page"), { target: { value: "24" } });
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    expect(images.getByText("Showing 1-13 of 13")).toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Related items per page"), { target: { value: "12" } });

    fireEvent.change(images.getByLabelText("Sort"), { target: { value: "az" } });
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Middle Gallery");
    fireEvent.change(images.getByLabelText("Sort"), { target: { value: "za" } });
    expectPrecedes(section as HTMLElement, "Zulu Gallery", "Page Gallery 9");
    fireEvent.change(images.getByLabelText("Sort"), { target: { value: "new" } });
    expectPrecedes(section as HTMLElement, "Alpha Gallery", "Middle Gallery");
    expect(images.queryByText("Missing Date Gallery")).not.toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Sort"), { target: { value: "old" } });
    expectPrecedes(section as HTMLElement, "Page Gallery 9", "Page Gallery 8");
    expect(images.queryByText("Missing Date Gallery")).not.toBeInTheDocument();
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
      "Not detected yet",
    );
    expect(screen.getByLabelText("Resolution")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Resolution")).toHaveAttribute(
      "placeholder",
      "Not detected yet",
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
    expect(screen.getByText("1 category selected")).toBeInTheDocument();
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
    expect(screen.getByText("4 categories selected")).toBeInTheDocument();
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
      confirmDialog("Delete");

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
    confirmDialog("Delete");

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

    expect(screen.getByRole("button", { name: "Add to Favorites" }))
      .toBeInTheDocument();
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

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Created Image" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    const galleryInputs = screen.getAllByLabelText(/Gallery Image Path/);
    fireEvent.change(galleryInputs[0], {
      target: { value: " C:/Gallery/one.jpg " },
    });
    fireEvent.change(galleryInputs[2], {
      target: { value: "C:/Gallery/two.jpg" },
    });
    fireEvent.change(galleryInputs[3], {
      target: { value: "C:/Gallery/one.jpg" },
    });
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
  }, 10000);

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

    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Detected Image" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    fireEvent.change(screen.getByLabelText("Gallery Image Path 1"), {
      target: { value: "D:/Images/one.jpg" },
    });
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
      screen.getAllByRole("button", { name: "Browse" })[1],
    );

    expect(
      await screen.findByDisplayValue("C:/GalleryFolder/a.JPG"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("C:/GalleryFolder/b.png")).toBeInTheDocument();
    expect(
      screen.getByText("Loaded 3 Gallery Images path rows."),
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
      screen.getAllByRole("button", { name: "Browse" })[1],
    );

    expect(screen.getByRole("dialog", { name: "Replace Gallery Images?" }))
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
    fireEvent.click(screen.getByRole("button", { name: "Add Images" }));
    fireEvent.change(screen.getByLabelText("Gallery Image Path 3"), {
      target: { value: "C:/Gallery/updated.jpg" },
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
    expect(screen.getByText("Showing 16 of 40 images")).toBeInTheDocument();
    const initialImages = screen.getAllByRole("img", {
      name: /Gallery image/i,
    });
    expect(initialImages).toHaveLength(16);
    expect(initialImages[0]).toHaveAttribute(
      "src",
      "asset://localhost/C:/Gallery/01.jpg",
    );
    expect(initialImages[1]).toHaveAttribute(
      "src",
      "asset://localhost/C:/Gallery/02.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("img", { name: /Gallery image/i }),
      ).toHaveLength(32);
    });
    expect(screen.getByText("Showing 32 of 40 images")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("img", { name: /Gallery image/i }),
      ).toHaveLength(40);
    });
    expect(screen.getByText("Showing 40 of 40 images")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load More" }),
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
      .toHaveTextContent("1:1");
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
    expect(await within(moreMenu).findByText("Source folder open request sent"))
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
    fireEvent.change(screen.getByLabelText("Thumbnail 1"), {
      target: { value: " D:/Thumbs/created-1.jpg " },
    });
    fireEvent.change(screen.getByLabelText("Thumbnail 2"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Thumbnail 3"), {
      target: { value: "D:/Thumbs/created-2.jpg" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Created Performer")).toBeInTheDocument();
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

  it("renders Gender and Body Type taxonomy fields only on Performer forms", () => {
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
    expect(screen.getByLabelText("Body Type")).toBeInTheDocument();
    expect(screen.getByText("No Gender categories found")).toBeInTheDocument();
    expect(screen.getByText("No Body Type categories found")).toBeInTheDocument();
  });

  it("reads Gender and Body Type options from Category Management taxonomy children", async () => {
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
    const bodyType = screen.getByLabelText("Body Type");
    expect(gender).toHaveDisplayValue("Select gender");
    expect(bodyType).toHaveDisplayValue("Select body type");
    expect(within(gender).queryByRole("option", { name: "Gender" }))
      .not.toBeInTheDocument();
    expect(within(gender).getByRole("option", { name: "Woman" }))
      .toBeInTheDocument();
    expect(within(bodyType).queryByRole("option", { name: "Body Type" }))
      .not.toBeInTheDocument();
    expect(within(bodyType).getByRole("option", { name: "Athletic" }))
      .toBeInTheDocument();

    fireEvent.change(gender, { target: { value: "Woman" } });
    fireEvent.change(bodyType, { target: { value: "Athletic" } });

    expect(gender).toHaveDisplayValue("Woman");
    expect(bodyType).toHaveDisplayValue("Athletic");
  });

  it.each(["bodytype", "body-type", "body_type"])(
    "reads Body Type taxonomy children from parent variant %s",
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

      const bodyType = await screen.findByLabelText("Body Type");
      expect(within(bodyType).getByRole("option", { name: "Athletic" }))
        .toBeInTheDocument();
      expect(within(bodyType).queryByRole("option", { name: bodyTypeParentName }))
        .not.toBeInTheDocument();
    },
  );

  it("shows discard confirmation after changing Performer taxonomy fields", async () => {
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

  it("saves Performer taxonomy selections through categoriesJson after confirmation", async () => {
    window.history.pushState({}, "", "/performers/new");
    const created = persistedPerformer({
      name: "Taxonomy Performer",
      categoriesJson: '["Woman","Athletic"]',
    });
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "managed_category_list") {
        return performerTaxonomyFixtures("Body Type");
      }
      if (command === "performer_create") {
        expect(args.input.categoriesJson).toBe('["Woman","Athletic"]');
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
    fireEvent.change(screen.getByLabelText("Body Type"), {
      target: { value: "Athletic" },
    });
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Taxonomy Performer" },
    });
    fillPerformerRatingFields();
    clickSaveAndConfirm();

    expect(await screen.findByText("Taxonomy Performer")).toBeInTheDocument();
    expect(screen.getAllByText("Woman").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Athletic").length).toBeGreaterThan(0);
  });

  it("loads saved Performer taxonomy selections from categoriesJson", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    const existing = persistedPerformer({
      name: "Saved Taxonomy Performer",
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

    expect(await screen.findByDisplayValue("Saved Taxonomy Performer"))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Gender")).toHaveDisplayValue("Woman");
      expect(screen.getByLabelText("Body Type")).toHaveDisplayValue("Athletic");
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

  it("loads and updates a performer through Tauri commands", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedPerformer({
      name: "Existing Performer",
      aliasesJson: '["Alias One"]',
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
    expect(screen.getByLabelText("Thumbnail 1")).toHaveValue(
      "D:/Thumbs/existing-1.jpg",
    );
    expect(screen.getByLabelText("Thumbnail 2")).toHaveValue(
      "D:/Thumbs/existing-2.jpg",
    );
    expect(screen.getByLabelText("Thumbnail 3")).toHaveValue("");
    expect(screen.getByLabelText("Thumbnail 4")).toHaveValue("");
    expect(screen.getByLabelText("Debut Date")).toHaveValue("2020-01-02");
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
    fireEvent.change(screen.getByLabelText("Thumbnail 2"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Thumbnail 3"), {
      target: { value: "D:/Thumbs/updated-3.jpg" },
    });
    clickSaveAndConfirm();

    expect(
      await screen.findByText("Updated Performer", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alias Two")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  }, 10000);

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
    const metadataSection = screen
      .getByRole("heading", { name: "Profile Metadata" })
      .closest("section");
    expect(metadataSection).not.toBeNull();
    const metadata = within(metadataSection as HTMLElement);
    expect(metadata.getByText("Gender")).toBeInTheDocument();
    expect(metadata.getByText("Birth Date")).toBeInTheDocument();
    expect(metadata.getByText("Jan 20, 1998")).toBeInTheDocument();
    expect(metadata.getByText("Debut Date")).toBeInTheDocument();
    expect(metadata.getByText("Jan 02, 2020")).toBeInTheDocument();
    expect(metadata.getByText("Retired Date")).toBeInTheDocument();
    expect(metadata.getByText("Mar 04, 2024")).toBeInTheDocument();
    expect(metadata.queryByText("1998-01-20")).not.toBeInTheDocument();
    expect(metadata.queryByText("2020-01-02")).not.toBeInTheDocument();
    expect(metadata.queryByText("2024-03-04")).not.toBeInTheDocument();
    expectPrecedes(metadataSection as HTMLElement, "Gender", "Birth Date");
    expectPrecedes(metadataSection as HTMLElement, "Birth Date", "Debut Date");
    expectPrecedes(metadataSection as HTMLElement, "Debut Date", "Retired Date");
    expect(metadata.queryByText("Status")).not.toBeInTheDocument();
    const personalSection = screen
      .getByRole("heading", { name: "Personal" })
      .closest("section") as HTMLElement;
    expect(within(personalSection).queryByText("Birth Date")).not.toBeInTheDocument();
    expect(within(personalSection).getByText("Birth Place")).toBeInTheDocument();
    expect(within(personalSection).getByText("Tokyo")).toBeInTheDocument();
    expect(within(personalSection).getByText("Nationality")).toBeInTheDocument();
    expect(within(personalSection).getByText("Japanese")).toBeInTheDocument();
    expect(within(personalSection).getByText("Zodiac")).toBeInTheDocument();
    expect(within(personalSection).queryByText("Astrological Sign")).not.toBeInTheDocument();
    expect(within(personalSection).getByText("Aquarius")).toBeInTheDocument();
    expect(within(personalSection).getByText("Blood Type")).toBeInTheDocument();
    expectPrecedes(personalSection, "Birth Place", "Nationality");
    expectPrecedes(personalSection, "Nationality", "Zodiac");
    expectPrecedes(personalSection, "Zodiac", "Blood Type");
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
    expectPrecedes(physicalSection, "Body Type", "Height");
    expectPrecedes(physicalSection, "Height", "Weight");
    expectPrecedes(physicalSection, "Weight", "Measurement");
    expectPrecedes(physicalSection, "Measurement", "Cup Size");
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it.each([
    ["/videos/new", "Related Performer", "Related Images"],
    ["/videos/sample-id/edit", "Related Performer", "Related Images"],
    ["/images/new", "Related Performer", "Related Video"],
    ["/images/sample-id/edit", "Related Performer", "Related Video"],
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
    const statusInput = await screen.findByLabelText("Status");
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
    "batch-33-3-suggestions-fresh-v1",
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

function relatedCatalogJson(prefix: string, count: number) {
  return JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      recordId: `${prefix}_${index + 1}`,
      titleSnapshot: `${prefix} ${index + 1}`,
    })),
  );
}
