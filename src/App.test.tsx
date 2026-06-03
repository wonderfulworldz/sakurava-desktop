import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";
import { appearanceThemeStorageKey } from "./lib/appearanceTheme";
import { sakuravaRef } from "./lib/exportCsv";
import { languageStorageKey } from "./lib/language";

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMocks.open,
  save: dialogMocks.save,
}));

type TestTauriInvoke = NonNullable<Window["__TAURI_INTERNALS__"]>["invoke"];

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    delete window.__TAURI_INTERNALS__;
    window.localStorage.clear();
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

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Private local catalog")).toBeInTheDocument();
    expect(screen.queryByText("Offline first")).not.toBeInTheDocument();
    expect(screen.queryByText(/Static frontend preview/i)).not.toBeInTheDocument();
  });

  it.each([
    ["/", "Sakurava - Home"],
    ["/videos", "Sakurava - Videos"],
    ["/videos/sample-id", "Sakurava - Videos"],
    ["/images", "Sakurava - Images"],
    ["/performers", "Sakurava - Performers"],
    ["/categories", "Sakurava - Categories"],
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
    ["/categories", "Categories"],
    ["/settings", "Settings"],
  ])("renders %s", (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
  });

  it("renders Categories as a browse-only page in browser preview", () => {
    window.history.pushState({}, "", "/categories");
    setManagedCategories(["Unused Local"]);

    render(<App />);

    expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search categories...")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Name A-Z")).toBeInTheDocument();
    expect(screen.queryByText("Catalog Browse")).not.toBeInTheDocument();
    expect(screen.queryByText("catalog browse")).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.getByText("Total Category")).toBeInTheDocument();
    expect(screen.getByText("Videos Category")).toBeInTheDocument();
    expect(screen.getByText("Images Category")).toBeInTheDocument();
    expect(screen.getByText("Performers Category")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage Category" }),
    ).toHaveAttribute("href", "/settings/category-management");
    expect(
      screen.queryByRole("link", { name: "Open Category Management" }),
    ).not.toBeInTheDocument();

    const categoryCard = screen.getByRole("article", {
      name: "Category Unused Local",
    });
    expect(within(categoryCard).getByText("Unused Managed")).toBeInTheDocument();
    expect(within(categoryCard).getByText("No description yet.")).toBeInTheDocument();
    expect(within(categoryCard).queryByText(/^Open\b/)).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /add category/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /rename/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("loads Categories usage from record categories without management actions", async () => {
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
    };

    render(<App />);

    const dramaCard = await screen.findByRole("article", {
      name: "Category Drama",
    });
    expect(within(dramaCard).getByText("Managed")).toBeInTheDocument();
    expect(within(dramaCard).getAllByText("3").length).toBeGreaterThan(0);
    expect(within(dramaCard).getByText("No description yet.")).toBeInTheDocument();
    expect(within(dramaCard).queryByText(/^Open\b/)).not.toBeInTheDocument();
    expect(screen.queryByText("Open Videos")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Images")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Performers")).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.getByText("Total Category")).toBeInTheDocument();
    expect(screen.getByText("Videos Category")).toBeInTheDocument();
    expect(screen.getByText("Images Category")).toBeInTheDocument();
    expect(screen.getByText("Performers Category")).toBeInTheDocument();

    expect(
      screen.queryByRole("article", {
      name: "Category Classic",
      }),
    ).not.toBeInTheDocument();

    const unusedCard = screen.getByRole("article", {
      name: "Category Unused Local",
    });
    expect(within(unusedCard).getByText("Unused Managed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories search"), {
      target: { value: "classic" },
    });
    expect(screen.queryByRole("article", { name: "Category Classic" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Drama" }))
      .not.toBeInTheDocument();

    const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual([
      "video_list",
      "image_list",
      "performer_list",
      "managed_category_list",
    ]);
    expect(commands).not.toContain("video_update");
    expect(commands).not.toContain("image_update");
    expect(commands).not.toContain("performer_update");
    expect(commands).not.toContain("managed_category_update");
  });

  it("filters and paginates Categories collection cards by usage type", async () => {
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
      ...Array.from({ length: 22 }, (_, index) =>
        managedCategoryFixture({
          key: `cat_extra_${index}`,
          name: `Extra Category ${String(index + 1).padStart(2, "0")}`,
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

    const parentCategoryCard = await screen.findByRole("article", {
      name: "Category Parent Category",
    });
    expect(parentCategoryCard).toBeInTheDocument();
    expect(
      within(parentCategoryCard).queryByRole("link", {
        name: "Open Videos filtered by category Parent Category",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(parentCategoryCard).queryByRole("link", {
        name: "Open Images filtered by category Parent Category",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(parentCategoryCard).queryByRole("link", {
        name: "Open Performers filtered by category Parent Category",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1-24 of 26 categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Categories per page")).toHaveDisplayValue("24");
    expect(screen.getByAltText("Parent Category thumbnail")).toHaveAttribute(
      "src",
      "asset://D:/Sakurava/thumbs/parent.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 25-26 of 26 categories")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories per page"), {
      target: { value: "12" },
    });
    expect(screen.getByText("Showing 1-12 of 26 categories")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter"), {
      target: { value: "videos" },
    });
    expect(screen.getByRole("article", { name: "Category Video Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Image Category" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Performer Category" }))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter"), {
      target: { value: "images" },
    });
    expect(screen.getByRole("article", { name: "Category Image Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Video Category" }))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter"), {
      target: { value: "performers" },
    });
    expect(screen.getByRole("article", { name: "Category Performer Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Image Category" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.queryByText("cat_performer")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter"), {
      target: { value: "videos" },
    });
    const videoCategoryCard = screen.getByRole("article", {
      name: "Category Video Category",
    });
    expect(
      within(videoCategoryCard).getByRole("link", {
        name: "Open Videos filtered by category Video Category",
      }),
    ).toBeInTheDocument();
    expect(
      within(videoCategoryCard).queryByRole("link", {
        name: "Open Images filtered by category Video Category",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(videoCategoryCard).queryByRole("link", {
        name: "Open Performers filtered by category Video Category",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(videoCategoryCard).getByRole("link", {
        name: "Open Videos filtered by category Video Category",
      }),
    );

    expect(await screen.findByRole("heading", { name: "Videos" })).toBeInTheDocument();
    expect(screen.getByText("Video Usage")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Remove Video Category" }),
    ).toBeInTheDocument();
    window.history.pushState({}, "", "/");
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
    expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Added");
    expect(screen.queryByDisplayValue("Add category filter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Add category filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("30");
    for (const pageSize of ["30", "60", "90", "120"]) {
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

  it.each([
    {
      path: "/videos",
      panelName: "Videos filters",
      filters: ["Quality", "Rating", "Year", "Duration"],
      absent: ["Image Count", "Debut Year", "Status", "Filmography", "Pictorial"],
    },
    {
      path: "/images",
      panelName: "Images filters",
      filters: ["Quality", "Rating", "Year", "Image Count"],
      absent: ["Duration", "Debut Year", "Status", "Filmography", "Pictorial"],
    },
    {
      path: "/performers",
      panelName: "Performers filters",
      filters: ["Status", "Rating", "Debut Year", "Filmography", "Pictorial"],
      absent: ["Quality", "Duration", "Image Count", "Year"],
    },
  ])(
    "renders Catalog Toolbar V1 filter panel for $path",
    ({ path, panelName, filters, absent }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByPlaceholderText(/Search .*\.{3}/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
      expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Added");
      expect(
        screen.getByRole("button", { name: "Switch to list view" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /filter/i }));
      const panel = within(screen.getByRole("region", { name: panelName }));

      expect(panel.getByLabelText("Categories")).toBeInTheDocument();
      for (const label of filters) {
        expect(panel.getByLabelText(label)).toBeInTheDocument();
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

  it.each([
    [
      "/videos/sample-id",
      [
        "Video Detail",
        "Morning Archive",
        "Rewatch",
        "Related Performers",
        "Related Images",
        "Tech info is data-dependent and not available yet.",
      ],
      true,
    ],
    [
      "/images/sample-id",
      [
        "Image Detail",
        "City Light Set",
        "Memorability",
        "Related Videos",
        "Related Performers",
        "Gallery tech info is data-dependent and not available yet.",
      ],
      true,
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
      false,
    ],
  ])(
    "renders static detail UI for %s",
    (path, expectedTexts, expectsReadOnly) => {
      window.history.pushState({}, "", path);
      render(<App />);

      for (const text of expectedTexts) {
        expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      }
      const readOnlyPlaceholder = screen.queryByText("Data-dependent fields only");
      if (expectsReadOnly) {
        expect(readOnlyPlaceholder).toBeInTheDocument();
      } else {
        expect(readOnlyPlaceholder).not.toBeInTheDocument();
      }
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["/videos/sample-id", "hexagon", "3.8 / 5"],
    ["/images/sample-id", "hexagon", "4.2 / 5"],
    ["/performers/sample-id", "hexagon", "3.8 / 5"],
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
      screen.getByRole("heading", { name: "Related Videos" }).closest("section"),
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
      screen.getByRole("heading", { name: "System Info" }).closest("section"),
    ]);
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
      screen.getByRole("heading", { name: "System Info" }).closest("section"),
    ]);
  });

  it("renders a pentagon spider chart for five valid persisted rating dimensions", async () => {
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
    const chart = within(section as HTMLElement).getByTestId("spider-chart");

    expect(chart).toHaveAttribute("data-dimension-count", "5");
    expect(chart).toHaveAttribute("data-shape", "pentagon");
    expect(within(section as HTMLElement).getByText("4.2 / 5")).toBeInTheDocument();
  });

  it("shows an honest empty state when detail ratingJson has no valid rating", async () => {
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

    expect(ratingSection.queryByTestId("spider-chart")).not.toBeInTheDocument();
    expect(ratingSection.getByText("Not rated")).toBeInTheDocument();
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
    expect(tech.getByText("Not detected yet")).toBeInTheDocument();
    expect(tech.getAllByText("Not available")).toHaveLength(2);
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

    expect(tech.getAllByText("Not detected yet")).toHaveLength(2);
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
    expect(tech.getAllByText("Not available")).toHaveLength(3);
    const systemInfo = within(
      screen.getByText("System Info").closest("section") as HTMLElement,
    );
    expect(systemInfo.getByText("Gallery status")).toBeInTheDocument();
    expect(systemInfo.getByText("Set")).toBeInTheDocument();
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
      expect(screen.getAllByText("Favorite").length).toBeGreaterThan(0);
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
        expect(within(heroChips).getByText("Favorite")).toBeInTheDocument();
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
    expect(await screen.findByRole("article", { name: "Category New Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Old Category" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Manage Category" }));
    expect(await screen.findByRole("heading", { name: "Category Management" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("New Category").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old Category")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Navigate to Categories" }));
    expect(await screen.findByRole("article", { name: "Category New Category" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Old Category" }))
      .not.toBeInTheDocument();
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
          "Action,Sakurava Ref,Parent Category,Category Name,Description,Thumbnail Path,Visibility,Notes",
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
        { length: 30 },
        (_, index) => `Category ${String(index + 1).padStart(2, "0")}`,
      ),
    );

    render(<App />);

    const table = screen.getByRole("table");
    for (const column of [
      "Name",
      "Parent",
      "Description",
      "Videos",
      "Images",
      "Performers",
      "Usage",
      "Edit",
    ]) {
      expect(within(table).getByRole("columnheader", { name: column }))
        .toBeInTheDocument();
    }

    expect(screen.getByText("Showing 1-25 of 30 categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Rows per page")).toHaveDisplayValue("25");
    for (const option of ["25", "50", "100"]) {
      expect(screen.getByRole("option", { name: option })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Showing 26-30 of 30 categories")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Rows per page"), {
      target: { value: "50" },
    });

    expect(screen.getByText("Showing 1-30 of 30 categories")).toBeInTheDocument();
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

    render(<App />);

    await screen.findAllByText("Parent Category");
    const table = screen.getByRole("table");
    expect(screen.queryByText(/Record.only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Needs\s+Review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Missing\s+thumbnail/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Has\s+children/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter categories"), {
      target: { value: "parent-only" },
    });

    let bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText("Parent Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).queryByText("Child Category"))
      .not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter categories"), {
      target: { value: "child-only" },
    });

    bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText("Child Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).getByText("Parent Category")).toBeInTheDocument();
    expect(within(bodyRows[0]).queryByText("Solo Category"))
      .not.toBeInTheDocument();
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

  it("renders Source Links as deferred title and link rows", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByLabelText("Source Link Title 1")).toHaveAttribute(
      "placeholder",
      "Title 1",
    );
    expect(screen.getByLabelText("Source Link URL 1")).toHaveAttribute(
      "placeholder",
      "Link 1",
    );
    expect(screen.getByText("Deferred: source links are not saved yet."))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Source Link 1" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Link" }));

    expect(screen.getByLabelText("Source Link Title 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Source Link URL 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Source Link 2" }))
      .toBeInTheDocument();
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
    fireEvent.change(relatedPerformerSearch, {
      target: { value: "cherry" },
    });
    const performerResult = await screen.findByRole("button", {
      name: "Add related performer Aoi Sakura",
    });
    expect(performerResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(performerResult).getByText("Aoi Sakura")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(performerResult).getByText(/Japan/)).toHaveClass(
      "truncate",
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Related Video")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "performer_update",
      expect.anything(),
      expect.anything(),
    );
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
    fireEvent.change(relatedImageSearch, {
      target: { value: "img-001" },
    });
    const imageResult = await screen.findByRole("button", {
      name: "Add related image Hanami Gallery",
    });
    expect(imageResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(imageResult).getByText("Hanami Gallery")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(imageResult).getByText(/IMG-001/)).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.change(relatedVideoSearch, {
      target: { value: "vid-001" },
    });
    const videoResult = await screen.findByRole("button", {
      name: "Add related video Spring Feature",
    });
    expect(videoResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(videoResult).getByText("Spring Feature")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(within(videoResult).getByText(/VID-001/)).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
        if (command === "performer_list") {
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
  });

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
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Added");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Zulu Video", "Alpha Video", "Beta Video"]);

    fireEvent.change(screen.getByLabelText("Sorting"), {
      target: { value: "Title A-Z" },
    });

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Alpha Video", "Beta Video", "Zulu Video"]);

    fireEvent.change(screen.getByLabelText("Sorting"), {
      target: { value: "Last Updated" },
    });

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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    const panel = within(screen.getByRole("region", { name: "Videos filters" }));

    fireEvent.change(panel.getByLabelText("Rating"), {
      target: { value: "4 star" },
    });
    fireEvent.change(panel.getByLabelText("Year"), {
      target: { value: "2025" },
    });
    fireEvent.change(panel.getByLabelText("Duration"), {
      target: { value: "Long" },
    });

    expect(screen.getByText("Long Rated Video")).toBeInTheDocument();
    expect(screen.queryByText("Short Low Video")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    const panel = within(screen.getByRole("region", { name: "Images filters" }));

    expect(panel.getByLabelText("Image Count")).toBeInTheDocument();
    expect(panel.queryByLabelText("Duration")).not.toBeInTheDocument();
    fireEvent.change(panel.getByLabelText("Rating"), {
      target: { value: "5 star" },
    });
    fireEvent.change(panel.getByLabelText("Year"), {
      target: { value: "2020" },
    });
    fireEvent.change(panel.getByLabelText("Image Count"), {
      target: { value: "Some" },
    });

    expect(screen.getByText("Some Rated Image")).toBeInTheDocument();
    expect(screen.queryByText("Large Older Image")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    const panel = within(screen.getByRole("region", { name: "Performers filters" }));

    fireEvent.change(panel.getByLabelText("Status"), {
      target: { value: "Active" },
    });
    fireEvent.change(panel.getByLabelText("Rating"), {
      target: { value: "5 star" },
    });
    fireEvent.change(panel.getByLabelText("Filmography"), {
      target: { value: "Some" },
    });
    fireEvent.change(panel.getByLabelText("Pictorial"), {
      target: { value: "Many" },
    });

    expect(screen.getByText("Active Rated Performer")).toBeInTheDocument();
    expect(screen.queryByText("Retired Smaller Performer")).not.toBeInTheDocument();
  });

  it("slices collection cards by page size and navigates pages", async () => {
    window.history.pushState({}, "", "/videos");
    const videos = Array.from({ length: 31 }, (_, index) =>
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
    expect(screen.queryByText("Paged Video 31")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Paged Video 31")).toBeInTheDocument();
    expect(screen.queryByText("Paged Video 01")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "60" },
    });

    expect(screen.getByText("Paged Video 01")).toBeInTheDocument();
    expect(screen.getByText("Paged Video 31")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });

    expect(screen.getByText("Classic Video")).toBeInTheDocument();
    expect(screen.queryByText("Modern Video")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Category A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Category A" }));

    expect(screen.getByText("Classic Video")).toBeInTheDocument();
    expect(screen.getByText("Modern Video")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "archive" },
    });
    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });
    fireEvent.change(screen.getByLabelText("Sorting"), {
      target: { value: "Title A-Z" },
    });

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) =>
      heading.textContent,
    )).toEqual(["Alpha Archive", "Zulu Archive"]);
    expect(screen.queryByText("Beta Clip")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category B" },
    });

    expect(screen.getByText("No matching items")).toBeInTheDocument();
  });

  it("clears catalog search, category filters, and data filters without resetting sort or page size", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "alpha" },
    });
    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "Long" },
    });
    fireEvent.change(screen.getByLabelText("Sorting"), {
      target: { value: "Title A-Z" },
    });
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "60" },
    });

    expect(screen.getByLabelText("Videos search")).toHaveValue("alpha");
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("60");
    expect(screen.getByText("Alpha Archive")).toBeInTheDocument();
    expect(screen.queryByText("Beta Clip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.getByLabelText("Videos search")).toHaveValue("");
    expect(screen.getByLabelText("Duration")).toHaveDisplayValue("All durations");
    expect(screen.queryByRole("button", { name: "Remove Category A" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Title A-Z");
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("60");
    expect(screen.getByText("Alpha Archive")).toBeInTheDocument();
    expect(screen.getByText("Beta Clip")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });
    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category B" },
    });

    expect(screen.getByText("Two Category Video")).toBeInTheDocument();
    expect(screen.getByText("Five Category Video")).toBeInTheDocument();
    expect(screen.queryByText("Single Category Video")).not.toBeInTheDocument();
    expect(screen.queryByText("Sixth Category Video")).not.toBeInTheDocument();

    for (const category of ["Category C", "Category D", "Category E"]) {
      fireEvent.change(screen.getByLabelText("Categories"), {
        target: { value: category },
      });
    }

    expect(screen.getByText("Five Category Video")).toBeInTheDocument();
    expect(screen.queryByText("Two Category Video")).not.toBeInTheDocument();
    expect(screen.getByText("Up to 5 category filters can be active.")).toBeInTheDocument();
    expect(screen.getByLabelText("Categories")).toBeDisabled();
  });

  it("applies pagination after category filter and resets to page one", async () => {
    window.history.pushState({}, "", "/videos");
    const categoryAVideos = Array.from({ length: 31 }, (_, index) =>
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
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));

    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Category A Video 31")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category B" },
    });

    expect(screen.getByText("Category B Video 01")).toBeInTheDocument();
    expect(screen.queryByText("Category A Video 31")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("switches collection cards to a read-only table with detail links", async () => {
    window.history.pushState({}, "", "/videos");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            id: "video_1",
            title: "Table Video",
            originalTitle: "Original Table Video",
            categoriesJson: '["Category A"]',
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

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Original Title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Censorship" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Table Video" }),
    ).toHaveAttribute("href", "/videos/video_1");
    expect(screen.queryByLabelText("Cover Placeholder")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to grid view" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cover Placeholder")).toBeInTheDocument();
  });

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
      ...Array.from({ length: 29 }, (_, index) =>
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

    expect(await screen.findByText("Zulu Archive 01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    fireEvent.click(screen.getByRole("button", { name: /filter/i }));
    fireEvent.change(screen.getByLabelText("Videos search"), {
      target: { value: "archive" },
    });
    fireEvent.change(screen.getByLabelText("Categories"), {
      target: { value: "Category A" },
    });
    fireEvent.change(screen.getByLabelText("Sorting"), {
      target: { value: "Title A-Z" },
    });

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha Archive 02");
    expect(screen.queryByText("Beta Clip 03")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Alpha Archive 02")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("renders entity-aware table columns for images and performers", async () => {
    window.history.pushState({}, "", "/images");
    const imageInvoke = vi.fn(async (command: string) => {
      if (command === "image_list") {
        return [
          persistedImage({
            id: "image_1",
            title: "Table Image",
            code: "IMG-TABLE",
            imageCount: 42,
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
    expect(screen.getByRole("columnheader", { name: "Code" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Image Count" }),
    ).toBeInTheDocument();
    expect(screen.getByText("IMG-TABLE")).toBeInTheDocument();
    imageRender.unmount();

    window.history.pushState({}, "", "/performers");
    const performerInvoke = vi.fn(async (command: string) => {
      if (command === "performer_list") {
        return [
          persistedPerformer({
            id: "performer_1",
            name: "Table Performer",
            filmographyCount: 7,
            pictorialsCount: 3,
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
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Filmography" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Pictorials" }),
    ).toBeInTheDocument();
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
      fullSizeAlt: "Video Cover full size",
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
      fullSizeAlt: "Image Cover full size",
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
      fullSizeAlt: "Performer Cover full size",
      command: "performer_get",
      record: persistedPerformer({
        name: "Preview Performer Detail",
        coverPath: "D:/Sakurava/performer-preview-cover.jpg",
      }),
    },
  ])(
    "opens and closes full-size cover preview for $path",
    async ({ path, buttonName, dialogName, fullSizeAlt, command, record }) => {
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
      const previewImage = within(dialog).getByAltText(fullSizeAlt);
      expect(previewImage).toHaveAttribute(
        "src",
        `asset://localhost/${record.coverPath}`,
      );
      expect(within(dialog).queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Previous" }),
      ).not.toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: dialogName }),
        ).not.toBeInTheDocument();
      });

      fireEvent.click(previewButton);
      expect(
        await screen.findByRole("dialog", { name: dialogName }, { timeout: 5000 }),
      ).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: dialogName }),
        ).not.toBeInTheDocument();
      });
    },
  );

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
    expect(screen.getByLabelText("Cover Placeholder")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview Video Cover" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Video Cover" })).not.toBeInTheDocument();
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
    expect(
      within(dialog).getByAltText("Performer Thumbnail 1 full size"),
    ).toHaveAttribute("src", "asset://localhost/D:/Sakurava/thumb-1.jpg");
    expect(within(dialog).queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Previous" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
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
    expect(videos.getByLabelText("Per page")).toHaveValue("12");
    expect(
      within(videos.getByLabelText("Per page")).getByRole("option", { name: "12" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Per page")).getByRole("option", { name: "24" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Per page")).getByRole("option", { name: "48" }),
    ).toBeInTheDocument();
    expect(
      within(videos.getByLabelText("Per page")).getByRole("option", { name: "96" }),
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
    expect(images.getByLabelText("Per page")).toHaveValue("12");
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
    expect(videos.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Next" }));
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Previous" }));
    fireEvent.change(videos.getByLabelText("Per page"), { target: { value: "24" } });
    expect(videos.getByText("Missing Date Video")).toBeInTheDocument();
    expect(videos.getByText("1 / 1")).toBeInTheDocument();
    fireEvent.change(videos.getByLabelText("Per page"), { target: { value: "12" } });

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
    expect(images.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(images.getByRole("button", { name: "Next" }));
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    fireEvent.click(images.getByRole("button", { name: "Previous" }));
    fireEvent.change(images.getByLabelText("Per page"), { target: { value: "24" } });
    expect(images.getByText("Missing Date Gallery")).toBeInTheDocument();
    expect(images.getByText("1 / 1")).toBeInTheDocument();
    fireEvent.change(images.getByLabelText("Per page"), { target: { value: "12" } });

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
          return created;
        }
        if (command === "video_get") {
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
      target: { value: "Created Video" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "typed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fillVideoRatingFields();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
        if (command === "performer_list") {
          return [];
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Picker Video")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
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
    fireEvent.change(search, { target: { value: "slim" } });

    const slimResult = await screen.findByRole("button", { name: "Add Slim" });
    expect(slimResult).toHaveClass("grid", "h-12", "overflow-hidden");
    expect(within(slimResult).getByText("Bodytype > Slim")).toHaveClass(
      "truncate",
      "whitespace-nowrap",
    );
    expect(slimResult).toHaveTextContent(/Bodytype\s*>\s*Slim/);

    fireEvent.click(slimResult);

    expect(search).toHaveValue("slim");
    expect(screen.getByText("Slim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Slim" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear category search" }));
    expect(search).toHaveValue("");
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
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getAllByText("May 12, 2026, 06:48 PM UTC")).toHaveLength(2);
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
    expect(screen.queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
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
    await waitFor(() => expect(status.getAllByText("Not set")).toHaveLength(2));
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

    expect(await status.findAllByText("Unknown")).toHaveLength(2);
    expect(status.queryByText("Status check not available")).not.toBeInTheDocument();
    expect(status.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("hides destructive delete controls in browser preview detail pages", () => {
    window.history.pushState({}, "", "/videos/sample-id");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Video Detail" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete permanently" }),
    ).not.toBeInTheDocument();
  });

  it("opens delete confirmation with item-specific safety copy", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({ title: "Delete Candidate Video" });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Delete Candidate Video")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      screen.getByRole("region", { name: "Delete confirmation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete Delete Candidate Video?")).toBeInTheDocument();
    expect(
      screen.getByText(/removes the saved Sakurava record for Delete Candidate Video/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not delete local media files/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete permanently" }),
    ).toBeInTheDocument();
  });

  it("cancels delete confirmation without calling the delete command", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({ title: "Cancel Delete Video" });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Cancel Delete Video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("region", { name: "Delete confirmation" }),
    ).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith(
      "video_delete",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each([
    {
      path: "/videos/video_test_001",
      title: "Deletable Video",
      getCommand: "video_get",
      deleteCommand: "video_delete",
      listCommand: "video_list",
      collectionPath: "/videos",
      collectionHeading: "Videos",
      record: persistedVideo({ title: "Deletable Video" }),
    },
    {
      path: "/images/image_test_001",
      title: "Deletable Image",
      getCommand: "image_get",
      deleteCommand: "image_delete",
      listCommand: "image_list",
      collectionPath: "/images",
      collectionHeading: "Images",
      record: persistedImage({ title: "Deletable Image" }),
    },
    {
      path: "/performers/performer_test_001",
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
          if (command === listCommand) {
            return [];
          }

          throw new Error(`Unexpected command ${command}`);
        },
      ) as unknown as TestTauriInvoke;
      window.__TAURI_INTERNALS__ = {
        invoke,
      };

      render(<App />);

      expect(await screen.findByText(title)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

      await waitFor(() => expect(window.location.pathname).toBe(collectionPath));
      expect(
        await screen.findByRole("heading", { name: collectionHeading }),
      ).toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith(
        deleteCommand,
        { id: path.split("/").pop() },
        undefined,
      );
    },
  );

  it("shows an error and stays on detail when delete returns false", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(
      async (command: string, args: Record<string, any> = {}) => {
        if (command === "image_get") {
          return persistedImage({ title: "Failed Delete Image" });
        }
        if (command === "image_delete") {
          return { id: args.id, deleted: false };
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Failed Delete Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(
      await screen.findByText(
        "Image delete failed. The saved Sakurava record was not removed.",
      ),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/images/image_test_001");
    expect(screen.getByRole("heading", { name: "Image Detail" })).toBeInTheDocument();
  });

  it("disables delete confirmation while pending and prevents duplicate submits", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
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
        if (command === "performer_list") {
          return [];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    );
    window.__TAURI_INTERNALS__ = {
      invoke: invokeMock as unknown as TestTauriInvoke,
    };

    render(<App />);

    expect(await screen.findByText("Pending Delete Performer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    const pendingButton = await screen.findByRole("button", { name: "Deleting..." });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "performer_delete"),
    ).toHaveLength(1);

    resolveDelete({ id: "performer_test_001", deleted: true });
    await waitFor(() => expect(window.location.pathname).toBe("/performers"));
  });

  it("does not add bulk, checkbox, or row delete behavior to detail pages", async () => {
    window.history.pushState({}, "", "/videos/video_test_001");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_get") {
        return persistedVideo({ title: "Single Delete Only Video" });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Single Delete Only Video")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/select/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  });

  it("loads and updates a video through Tauri commands", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedVideo({
      title: "Existing Video",
      categoriesJson: '["Classic"]',
      ratingJson: '{"rewatch":3}',
    });
    const updated = persistedVideo({
      title: "Updated Video",
      categoriesJson: '["Classic","Updated"]',
      ratingJson: '{"rewatch":5}',
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
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Updated Video" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search categories" }), {
      target: { value: "updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fillVideoRatingFields({ Rewatch: "5" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fillImageRatingFields();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Image")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Folder Gallery Image")).toBeInTheDocument();
  });

  it("confirms before replacing existing image Gallery Images rows from a folder", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    dialogMocks.open.mockResolvedValue("C:/Replacement");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
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

    expect(confirmSpy).toHaveBeenCalledWith(
      "Replace current Gallery Images path rows?",
    );
    expect(
      await screen.findByDisplayValue("C:/Replacement/new.gif"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("C:/Old/one.jpg")).not.toBeInTheDocument();

    fillImageRatingFields();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Existing Gallery Image")).toBeInTheDocument();
    confirmSpy.mockRestore();
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
    });
    const updated = persistedImage({
      title: "Updated Image",
      galleryImagePathsJson: '["C:/Gallery/updated.jpg"]',
      categoriesJson: '["Portrait","Updated"]',
      ratingJson: '{"memorability":5}',
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
    expect(
      screen.getByDisplayValue("C:/Gallery/existing-one.jpg"),
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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

  it("opens image detail gallery images in a navigable overlay viewer", async () => {
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
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    render(<App />);

    expect(await screen.findByText("Viewer Gallery Image")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Preview Gallery image 2" }),
    );

    const viewer = await screen.findByRole("dialog", {
      name: "Gallery full-size viewer",
    }, { timeout: 5000 });
    expect(within(viewer).queryByRole("heading")).not.toBeInTheDocument();
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
    const closeButton = within(viewer).getByRole("button", {
      name: "Close gallery viewer",
    });
    expect(closeButton).toHaveClass("opacity-100");

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Next gallery image" }),
    );

    expect(within(viewer).getByText("3 / 3")).toBeInTheDocument();
    expect(
      within(viewer).queryByRole("button", { name: "Next gallery image" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Show gallery image at 100 percent",
      }),
    );
    expect(within(viewer).getAllByText("100%").length).toBeGreaterThan(0);

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Zoom in gallery image" }),
    );
    expect(within(viewer).getByText("125%")).toBeInTheDocument();
    fireEvent.click(
      within(viewer).getByRole("button", { name: "Zoom in gallery image" }),
    );
    expect(within(viewer).getByText("150%")).toBeInTheDocument();

    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Enter fullscreen gallery mode",
      }),
    );
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(
      within(viewer).getByRole("button", {
        name: "Exit fullscreen gallery mode",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Exit fullscreen gallery mode",
      }),
    );
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(viewer).getByRole("button", { name: "Previous gallery image" }),
    );
    expect(within(viewer).getByText("1 / 3")).toBeInTheDocument();
    expect(within(viewer).getAllByText("Fit").length).toBeGreaterThan(0);
    expect(
      within(viewer).queryByRole("button", { name: "Previous gallery image" }),
    ).not.toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.mouseMove(viewer);
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(closeButton).toHaveClass("opacity-0");

    fireEvent.mouseMove(viewer);
    expect(closeButton).toHaveClass("opacity-100");

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(closeButton).toHaveClass("opacity-0");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(closeButton).toHaveClass("opacity-100");
    expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();
    vi.useRealTimers();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Gallery full-size viewer" }),
      ).not.toBeInTheDocument();
    });
    expect(invoke).not.toHaveBeenCalledWith(
      "gallery_folder_images_list",
      expect.anything(),
      expect.anything(),
    );
  });

  it("falls back to in-app fullscreen-like gallery mode when browser fullscreen is unavailable", async () => {
    window.history.pushState({}, "", "/images/image_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "image_get") {
        expect(args.id).toBe("image_test_001");
        return persistedImage({
          title: "Fallback Fullscreen Gallery Image",
          galleryImagePathsJson: '["C:/Gallery/fallback.jpg"]',
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
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });

    render(<App />);

    expect(
      await screen.findByText("Fallback Fullscreen Gallery Image"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Gallery image 1" }),
    );

    const viewer = await screen.findByRole("dialog", {
      name: "Gallery full-size viewer",
    }, { timeout: 5000 });
    fireEvent.click(
      within(viewer).getByRole("button", {
        name: "Enter fullscreen gallery mode",
      }),
    );
    expect(
      within(viewer).getByRole("button", {
        name: "Exit fullscreen gallery mode",
      }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      within(viewer).getByRole("button", {
        name: "Enter fullscreen gallery mode",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Gallery full-size viewer" }),
    ).toBeInTheDocument();
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
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText("May 10, 2026, 01:02 AM UTC")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getByText("May 12, 2026, 07:08 AM UTC")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    });
    const updated = persistedPerformer({
      name: "Updated Performer",
      aliasesJson: '["Alias One","Alias Two"]',
      categoriesJson: '["Classic","Updated"]',
      ratingJson: '{"attraction":5}',
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    expect(screen.getByText("May 9, 2026, 01:02 AM UTC")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getByText("May 12, 2026, 10:11 AM UTC")).toBeInTheDocument();
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
    expect(screen.getByText("Debut Date")).toBeInTheDocument();
    expect(metadata.getByText("2020-01-02")).toBeInTheDocument();
    expect(metadata.getByText("Retired Date")).toBeInTheDocument();
    expect(metadata.getByText("2024-03-04")).toBeInTheDocument();
    expect(metadata.getByText("Birth Date")).toBeInTheDocument();
    expect(metadata.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.getByText("Birthplace")).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Japanese")).toBeInTheDocument();
    expect(screen.getByText("Aquarius")).toBeInTheDocument();
    expect(screen.getByText("160 cm")).toBeInTheDocument();
    expect(screen.getByText("48 kg")).toBeInTheDocument();
    expect(screen.getByText("11 / 22 / 33 cm")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
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
    "source links section shows deferred row controls on %s",
    (path) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByText("Source Links")).toBeInTheDocument();
      expect(screen.getByLabelText("Source Link Title 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Source Link URL 1")).toBeInTheDocument();
      expect(screen.getByText("Deferred: source links are not saved yet."))
        .toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Link" }))
        .toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Source Link 1" }))
        .not.toBeInTheDocument();
    },
  );

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
    ])("renders all six empty rating criteria at %s", async (path, labels) => {
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
        expect(screen.getByLabelText(label)).toHaveValue(null);
        expect(
          screen.getByRole("button", { name: `Rate ${label} 1 out of 5` }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: `Rate ${label} 5 out of 5` }),
        ).toBeInTheDocument();
      }
      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("Complete all ratings");
    });

    it("blocks save and shows inline validation when any rating is empty", async () => {
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

      fireEvent.change(screen.getByLabelText(/^Title/), {
        target: { value: "New Video" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(invoke).not.toHaveBeenCalledWith("video_create", expect.anything());
      expect(await screen.findByText("Please complete all rating criteria.")).toBeInTheDocument();
      expect(screen.getByTestId("rating-validation-error")).toHaveTextContent(
        "Complete all 6 rating criteria before saving.",
      );
      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("Complete all ratings");
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
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

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

      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("Complete all ratings");
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

    it("opens old invalid edit rating data as empty instead of 0", async () => {
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
        expect(screen.getByLabelText(label)).toHaveValue(null);
      }
      expect(screen.getByTestId("average-rating-display")).toHaveTextContent("Complete all ratings");
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

      expect(rewatchInput).toHaveValue(null);
      fireEvent.mouseEnter(starFour);
      expect(rewatchInput).toHaveValue(null);
      fireEvent.mouseLeave(starFour.parentElement as HTMLElement);
      expect(rewatchInput).toHaveValue(null);

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
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
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
