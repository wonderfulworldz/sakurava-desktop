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
    expect(logo).toHaveAttribute("src", "/assets/sakurava-icon.svg");
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
    expect(screen.getByText("Local mode")).toBeInTheDocument();
    expect(screen.getByText("Storage status placeholder")).toBeInTheDocument();
    expect(screen.getByText("Last update placeholder")).toBeInTheDocument();
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
    expect(within(categoryCard).getByText("No record usage yet.")).toBeInTheDocument();
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
    expect(within(dramaCard).getByText("3")).toBeInTheDocument();
    expect(within(dramaCard).getByText("Used by saved catalog records.")).toBeInTheDocument();
    expect(within(dramaCard).queryByText(/^Open\b/)).not.toBeInTheDocument();
    expect(screen.queryByText("Open Videos")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Images")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Performers")).not.toBeInTheDocument();
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.getByText("Total Category")).toBeInTheDocument();
    expect(screen.getByText("Videos Category")).toBeInTheDocument();
    expect(screen.getByText("Images Category")).toBeInTheDocument();
    expect(screen.getByText("Performers Category")).toBeInTheDocument();

    const classicCard = screen.getByRole("article", {
      name: "Category Classic",
    });
    expect(within(classicCard).getByText("Record-only")).toBeInTheDocument();

    const unusedCard = screen.getByRole("article", {
      name: "Category Unused Local",
    });
    expect(within(unusedCard).getByText("Unused Managed")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categories search"), {
      target: { value: "classic" },
    });
    expect(screen.getByRole("article", { name: "Category Classic" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Category Drama" }))
      .not.toBeInTheDocument();

    const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual(["video_list", "image_list", "performer_list"]);
    expect(commands).not.toContain("video_update");
    expect(commands).not.toContain("image_update");
    expect(commands).not.toContain("performer_update");
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
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Updated");
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
      planned: ["Quality", "Rating", "Year", "Duration"],
      absent: ["Count", "Debut Year", "Status", "Favorite"],
    },
    {
      path: "/images",
      panelName: "Images filters",
      planned: ["Quality", "Rating", "Year", "Count"],
      absent: ["Duration", "Debut Year", "Status", "Favorite"],
    },
    {
      path: "/performers",
      panelName: "Performers filters",
      planned: ["Rating", "Debut Year", "Status", "Favorite"],
      absent: ["Quality", "Duration", "Count", "Year"],
    },
  ])(
    "renders Catalog Toolbar V1 filter panel for $path",
    ({ path, panelName, planned, absent }) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByPlaceholderText(/Search .*\.{3}/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
      expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Updated");
      expect(
        screen.getByRole("button", { name: "Switch to list view" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /filter/i }));
      const panel = within(screen.getByRole("region", { name: panelName }));

      expect(panel.getByLabelText("Categories")).toBeInTheDocument();
      for (const label of planned) {
        expect(panel.getByText(label).closest("button")).toBeDisabled();
      }
      for (const label of absent) {
        expect(panel.queryByText(label)).not.toBeInTheDocument();
      }
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
    expect(tech.getAllByText("Not available")).toHaveLength(3);
    expect(tech.queryByText("Quality")).not.toBeInTheDocument();
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

    expect(tech.getByText("Gallery Count")).toBeInTheDocument();
    expect(tech.getByText("3 images")).toBeInTheDocument();
    expect(tech.getAllByText("Not available")).toHaveLength(3);
    const systemInfo = within(
      screen.getByText("System Info").closest("section") as HTMLElement,
    );
    expect(systemInfo.getByText("Gallery status")).toBeInTheDocument();
    expect(systemInfo.getByText("Set")).toBeInTheDocument();
    expect(screen.queryByText("C:/Gallery/one.jpg")).not.toBeInTheDocument();
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
        expect(screen.getByText(/2015-present/)).toBeInTheDocument();
        expect(screen.getByText(/\(19 - 30 y\)/)).toBeInTheDocument();
      }
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it("renders the read-only Settings page", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("App Overview")).toBeInTheDocument();
    expect(screen.getByText("Runtime & Database")).toBeInTheDocument();
    expect(screen.getByText("Thumbnails & Local Assets")).toBeInTheDocument();
    expect(screen.getByText("Data Safety")).toBeInTheDocument();
    expect(screen.getByText("Catalog Management")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Category Management" }),
    ).toHaveAttribute("href", "/settings/category-management");
    expect(screen.getByText("Catalog Settings")).toBeInTheDocument();
    expect(screen.getByText("Categories Audit")).toBeInTheDocument();
    expect(screen.getByText("Category Management")).toBeInTheDocument();
    expect(screen.getByText("MVP Feature Status")).toBeInTheDocument();
    expect(screen.getByText("Planned Tools")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Welcome Slider")).toBeInTheDocument();
    expect(screen.getByText("About Sakurava")).toBeInTheDocument();
    expect(screen.getAllByText("Sakurava").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1.0.0 MVP")).toBeInTheDocument();
    expect(screen.getByText("Local / Offline")).toBeInTheDocument();
    expect(screen.getByText("Windows Desktop")).toBeInTheDocument();
    expect(screen.getAllByText("Browser preview").length).toBeGreaterThan(0);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("sakurava.sqlite")).toBeInTheDocument();
    expect(screen.getByText("app.sakurava.desktop")).toBeInTheDocument();
    expect(screen.getByText("Database Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Manual thumbnail rendering")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(
      screen.getByText("Pictures, Videos, Documents, and Downloads"),
    ).toBeInTheDocument();
    expect(screen.getByText("Placeholders only")).toBeInTheDocument();
    expect(screen.getByText("Local device only")).toBeInTheDocument();
    expect(
      screen.getByText("Saved categories will appear here after records use them."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Audit lists record categories. Managed category rename only updates the local managed list.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add and Rename are active locally. Delete category management is planned and not active in this batch.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Category name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Category" })).toBeEnabled();
    expect(screen.queryByText("Apply Rename")).not.toBeInTheDocument();
    expect(screen.queryByText("Apply Delete")).not.toBeInTheDocument();
    expect(screen.getAllByText("Runtime CRUD enabled")).toHaveLength(3);
    expect(screen.getByText("Light Mode")).toBeInTheDocument();
    expect(screen.getByText("Dark Mode")).toBeInTheDocument();
    expect(screen.getAllByText("Planned / disabled").length).toBeGreaterThan(0);
    expect(screen.getByText("Sakura Pink")).toBeInTheDocument();
    expect(
      screen.getByText("Appearance switching is planned and not active in this batch."),
    ).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Indonesian")).toBeInTheDocument();
    expect(
      screen.getByText("Language switching is planned and not active in this batch."),
    ).toBeInTheDocument();
    expect(screen.getByText("Default Welcome Image")).toBeInTheDocument();
    expect(screen.getAllByText("Current / default")).toHaveLength(3);
    expect(screen.getByText("Custom Slider Images")).toBeInTheDocument();
    expect(screen.getByText("Slider Management")).toBeInTheDocument();
    expect(
      screen.getByText("Welcome slider customization is planned and not active in this batch."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Backup / Restore" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import / Export" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Native File Picker" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Data Folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Advanced Settings" })).toBeDisabled();
  });

  it("renders the dedicated Category Management page", () => {
    window.history.pushState({}, "", "/settings/category-management");
    render(<App />);

    expect(
      screen.getAllByRole("heading", { name: "Category Management" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Catalog Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("Category List")).toBeInTheDocument();
    expect(screen.getByText("Selected Category Detail")).toBeInTheDocument();
    expect(screen.getAllByText("Modify Records").length).toBeGreaterThan(0);
    expect(screen.getByText("Safety Notes")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter category name...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Category" })).toBeEnabled();
  });

  it("shows desktop runtime database status when Tauri is available", () => {
    window.history.pushState({}, "", "/settings");
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };

    render(<App />);

    expect(screen.getAllByText("Desktop runtime").length).toBeGreaterThan(0);
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Database Available")).toBeInTheDocument();
  });

  it("renders the Catalog Settings categories audit from runtime records", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({ categoriesJson: '["Classic", "Favorite"]' }),
          persistedVideo({ categoriesJson: '["favorite", "Invalid Duplicate"]' }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({ categoriesJson: '["Favorite", "Portrait", 7]' }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({ categoriesJson: '["portrait", "Featured"]' }),
          persistedPerformer({ categoriesJson: "{bad json" }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Invalid Duplicate")).toBeInTheDocument();
    const catalogSettings = screen
      .getByText("Catalog Settings")
      .closest("section");
    expect(catalogSettings).not.toBeNull();
    const catalog = within(catalogSettings as HTMLElement);

    expect(catalog.getByText("Total unique categories")).toBeInTheDocument();
    expect(catalog.getByText("Categories used by Videos")).toBeInTheDocument();
    expect(catalog.getByText("Categories used by Images")).toBeInTheDocument();
    expect(catalog.getByText("Categories used by Performers")).toBeInTheDocument();
    expect(catalog.getByText("Classic")).toBeInTheDocument();
    expect(catalog.getByText("Favorite")).toBeInTheDocument();
    expect(catalog.getByText("Portrait")).toBeInTheDocument();
    expect(catalog.getByText("Featured")).toBeInTheDocument();
    expect(
      screen.queryByText("Saved categories will appear here after records use them."),
    ).not.toBeInTheDocument();
  });

  it("adds a managed category in Settings localStorage", () => {
    window.history.pushState({}, "", "/settings");

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "  Local Drama  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));

    expect(screen.getByText('Added category "Local Drama".')).toBeInTheDocument();
    expect(screen.getByText("Managed Categories")).toBeInTheDocument();
    expect(screen.getAllByText("Local Drama").length).toBeGreaterThan(0);
    expect(screen.getByText("Unused / 0 usage")).toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Local Drama"]',
    );
  });

  it("rejects blank and duplicate managed categories", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Classic"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));
    expect(screen.getByText("Enter a category name.")).toBeInTheDocument();

    expect(await screen.findByText("Classic")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: " classic " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));

    expect(screen.getByText("That category already exists.")).toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBeNull();
  });

  it("shows stored managed categories safely when localStorage is corrupt", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem("sakurava.managedCategories.v1", "{bad json");

    render(<App />);

    expect(screen.getByText("Catalog Settings")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Category name"), {
      target: { value: "Recovered" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));

    expect(screen.getAllByText("Recovered").length).toBeGreaterThan(0);
    expect(screen.getByText("Unused / 0 usage")).toBeInTheDocument();
  });

  it("enables Apply Rename only for valid managed category rename input", () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Classic"]',
    );

    render(<App />);

    expect(screen.getByText("Rename Category")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Rename applies only to managed categories. Existing record categories are not changed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Existing category")).toHaveValue("Drama");
    const proposedNameInput = screen.getByLabelText("Proposed name");
    expect(screen.getByRole("button", { name: "Apply Rename" })).toBeDisabled();

    expect(screen.getByText("Enter a new category name.")).toBeInTheDocument();

    fireEvent.change(proposedNameInput, {
      target: { value: " drama " },
    });
    expect(screen.getByText("Choose a different category name.")).toBeInTheDocument();

    fireEvent.change(proposedNameInput, {
      target: { value: "CLASSIC" },
    });
    expect(screen.getByText("That category name already exists.")).toBeInTheDocument();

    fireEvent.change(proposedNameInput, {
      target: { value: "Modern Drama" },
    });
    expect(screen.getByText("Ready to rename this managed category only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Rename" })).toBeEnabled();
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Classic"]',
    );
    expect(screen.getByRole("button", { name: "Apply Delete" })).toBeEnabled();
  });

  it("applies managed category rename locally without touching record categories", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Classic"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Drama"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("1 usage")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Proposed name"), {
      target: { value: " Modern Drama " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Rename" }));

    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Modern Drama","Classic"]',
    );
    expect(screen.getByLabelText("Existing category")).toHaveValue("Modern Drama");
    expect(screen.getByLabelText("Proposed name")).toHaveValue("");
    expect(screen.getAllByText("Modern Drama").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Renamed managed category "Drama" to "Modern Drama". Existing record categories were not changed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    await waitFor(() => {
      const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
      expect(commands).toEqual(["video_list", "image_list", "performer_list"]);
    });
  });

  it("shows record rename preview counts and examples for the selected category", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Drama Video",
            categoriesJson: '[" drama "]',
          }),
          persistedVideo({
            title: "Other Video",
            categoriesJson: '["Classic"]',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            title: "Drama Image",
            categoriesJson: '["DRAMA"]',
          }),
          persistedImage({
            title: "Invalid Image",
            categoriesJson: "{bad json",
          }),
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

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect((await screen.findAllByText("Drama Video")).length).toBeGreaterThan(0);
    const preview = within(
      screen.getByRole("region", { name: "Record rename preview" }),
    );
    expect(preview.getByText("Affected Videos")).toBeInTheDocument();
    expect(preview.getByText("Affected Images")).toBeInTheDocument();
    expect(preview.getByText("Affected Performers")).toBeInTheDocument();
    expect(preview.getByText("Total affected records")).toBeInTheDocument();
    expect(preview.getAllByText("1")).toHaveLength(3);
    expect(preview.getByText("3")).toBeInTheDocument();
    expect(preview.getByText("Drama Video")).toBeInTheDocument();
    expect(preview.getByText("Drama Image")).toBeInTheDocument();
    expect(preview.getByText("Drama Performer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to Records" })).toBeDisabled();
  });

  it("confirms and applies record category rename with categoriesJson-only patches", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Classic"]',
    );
    let videos = [
      persistedVideo({
        id: "video_1",
        title: "Drama Video",
        ratingJson: '{"rewatch":5}',
        notes: "Keep video notes",
        categoriesJson: '["Drama","Classic"]',
      }),
    ];
    let images = [
      persistedImage({
        id: "image_1",
        title: "Drama Image",
        ratingJson: '{"visual":4}',
        notes: "Keep image notes",
        categoriesJson: '["Drama","Modern"]',
      }),
    ];
    let performers = [
      persistedPerformer({
        id: "performer_1",
        name: "Drama Performer",
        ratingJson: '{"attraction":4}',
        notes: "Keep performer notes",
        categoriesJson: '[" drama "]',
      }),
    ];
    const invoke = vi.fn(
      async (command: string, args?: Record<string, any>) => {
        if (command === "video_list") {
          return videos;
        }
        if (command === "image_list") {
          return images;
        }
        if (command === "performer_list") {
          return performers;
        }
        if (command === "video_update") {
          expect(args?.id).toBe("video_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe('["Modern","Classic"]');
          videos = [{ ...videos[0], categoriesJson: args!.patch.categoriesJson }];
          return videos[0];
        }
        if (command === "image_update") {
          expect(args?.id).toBe("image_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe('["Modern"]');
          images = [{ ...images[0], categoriesJson: args!.patch.categoriesJson }];
          return images[0];
        }
        if (command === "performer_update") {
          expect(args?.id).toBe("performer_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe('["Modern"]');
          performers = [
            { ...performers[0], categoriesJson: args!.patch.categoriesJson },
          ];
          return performers[0];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect((await screen.findAllByText("Drama Video")).length).toBeGreaterThan(0);
    const applyToRecords = screen.getByRole("button", {
      name: "Apply to Records",
    });
    expect(applyToRecords).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Proposed name"), {
      target: { value: "Modern" },
    });
    expect(applyToRecords).toBeEnabled();
    expect(
      screen.queryByText("Confirm record category rename"),
    ).not.toBeInTheDocument();

    fireEvent.click(applyToRecords);
    expect(screen.getByText("Confirm record category rename")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Apply to Records" }),
    );

    expect(
      await screen.findByText(
        "Renamed category in 3 existing records. Managed categories were not changed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("No existing records use this category.").length,
    ).toBeGreaterThan(0);
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Classic"]',
    );
    expect(videos[0]).toMatchObject({
      title: "Drama Video",
      ratingJson: '{"rewatch":5}',
      notes: "Keep video notes",
      categoriesJson: '["Modern","Classic"]',
    });
    expect(images[0]).toMatchObject({
      title: "Drama Image",
      ratingJson: '{"visual":4}',
      notes: "Keep image notes",
      categoriesJson: '["Modern"]',
    });
    expect(performers[0]).toMatchObject({
      name: "Drama Performer",
      ratingJson: '{"attraction":4}',
      notes: "Keep performer notes",
      categoriesJson: '["Modern"]',
    });
    const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual([
      "video_list",
      "image_list",
      "performer_list",
      "video_update",
      "image_update",
      "performer_update",
      "video_list",
      "image_list",
      "performer_list",
    ]);
  });

  it("shows an empty record rename preview when no records use the category", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Drama"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("1 usage")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Existing category"), {
      target: { value: "Unused" },
    });

    expect(
      screen.getByText("No existing records use this category."),
    ).toBeInTheDocument();
    const preview = within(
      screen.getByRole("region", { name: "Record rename preview" }),
    );
    expect(preview.getAllByText("0")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Apply to Records" })).toBeDisabled();
    const commands = vi.mocked(invoke).mock.calls.map(([command]) => command);
    expect(commands).toEqual(["video_list", "image_list", "performer_list"]);
  });

  it("shows planned delete structure for managed categories without applying changes", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Drama"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(screen.getByText("Rename Category")).toBeInTheDocument();
    expect(screen.getByText("Delete Unused Category")).toBeInTheDocument();
    expect(
      screen.getByText("Delete application is planned and not active in this batch."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Category to delete")).toHaveValue("Drama");
    expect(
      await screen.findByText("1 usage: cannot be deleted until usage is removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Delete" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Category to delete"), {
      target: { value: "Unused" },
    });

    expect(
      screen.getByText("Unused / 0 usage: eligible for future deletion."),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Unused"]',
    );
  });

  it("shows record delete preview counts and examples for the selected category", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [
          persistedVideo({
            title: "Delete Preview Video",
            categoriesJson: '[" drama "]',
          }),
        ];
      }
      if (command === "image_list") {
        return [
          persistedImage({
            title: "Delete Preview Image",
            categoriesJson: '["DRAMA"]',
          }),
          persistedImage({
            title: "Invalid Delete Preview Image",
            categoriesJson: "{bad json",
          }),
        ];
      }
      if (command === "performer_list") {
        return [
          persistedPerformer({
            name: "Delete Preview Performer",
            categoriesJson: '["Drama"]',
          }),
        ];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(
      (await screen.findAllByText("Delete Preview Video")).length,
    ).toBeGreaterThan(0);
    const preview = within(
      screen.getByRole("region", { name: "Record delete preview" }),
    );
    expect(preview.getByText("Record Delete Preview")).toBeInTheDocument();
    expect(preview.getByText("Affected Videos")).toBeInTheDocument();
    expect(preview.getByText("Affected Images")).toBeInTheDocument();
    expect(preview.getByText("Affected Performers")).toBeInTheDocument();
    expect(preview.getByText("Total affected records")).toBeInTheDocument();
    expect(preview.getAllByText("1")).toHaveLength(3);
    expect(preview.getByText("3")).toBeInTheDocument();
    expect(preview.getByText("Delete Preview Video")).toBeInTheDocument();
    expect(preview.getByText("Delete Preview Image")).toBeInTheDocument();
    expect(preview.getByText("Delete Preview Performer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from Records" }),
    ).toBeEnabled();
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Unused"]',
    );
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "video_list",
      "image_list",
      "performer_list",
    ]);
  });

  it("confirms and removes a category from records with categoriesJson-only patches", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Classic"]',
    );
    let videos = [
      persistedVideo({
        id: "video_remove_1",
        title: "Remove Video",
        ratingJson: '{"rewatch":5}',
        notes: "Keep video remove notes",
        categoriesJson: '["Drama","Classic"]',
      }),
    ];
    let images = [
      persistedImage({
        id: "image_remove_1",
        title: "Remove Image",
        ratingJson: '{"visual":4}',
        notes: "Keep image remove notes",
        categoriesJson: '["Modern"," drama "]',
      }),
    ];
    let performers = [
      persistedPerformer({
        id: "performer_remove_1",
        name: "Remove Performer",
        ratingJson: '{"attraction":4}',
        notes: "Keep performer remove notes",
        categoriesJson: '["Drama"]',
      }),
    ];
    const invoke = vi.fn(
      async (command: string, args?: Record<string, any>) => {
        if (command === "video_list") {
          return videos;
        }
        if (command === "image_list") {
          return images;
        }
        if (command === "performer_list") {
          return performers;
        }
        if (command === "video_update") {
          expect(args?.id).toBe("video_remove_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe('["Classic"]');
          videos = [{ ...videos[0], categoriesJson: args!.patch.categoriesJson }];
          return videos[0];
        }
        if (command === "image_update") {
          expect(args?.id).toBe("image_remove_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe('["Modern"]');
          images = [{ ...images[0], categoriesJson: args!.patch.categoriesJson }];
          return images[0];
        }
        if (command === "performer_update") {
          expect(args?.id).toBe("performer_remove_1");
          expect(Object.keys(args?.patch ?? {})).toEqual(["categoriesJson"]);
          expect(args?.patch.categoriesJson).toBe("[]");
          performers = [
            { ...performers[0], categoriesJson: args!.patch.categoriesJson },
          ];
          return performers[0];
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect((await screen.findAllByText("Remove Video")).length).toBeGreaterThan(0);
    const removeFromRecords = screen.getByRole("button", {
      name: "Remove from Records",
    });
    expect(removeFromRecords).toBeEnabled();
    expect(
      screen.queryByText("Confirm record category removal"),
    ).not.toBeInTheDocument();

    fireEvent.click(removeFromRecords);
    expect(screen.getByText("Confirm record category removal")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Remove from Records" }),
    );

    expect(
      await screen.findByText(
        "Removed category from 3 existing records. Managed categories were not changed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("No existing records use this category.").length,
    ).toBeGreaterThan(0);
    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Classic"]',
    );
    expect(videos[0]).toMatchObject({
      title: "Remove Video",
      ratingJson: '{"rewatch":5}',
      notes: "Keep video remove notes",
      categoriesJson: '["Classic"]',
    });
    expect(images[0]).toMatchObject({
      title: "Remove Image",
      ratingJson: '{"visual":4}',
      notes: "Keep image remove notes",
      categoriesJson: '["Modern"]',
    });
    expect(performers[0]).toMatchObject({
      name: "Remove Performer",
      ratingJson: '{"attraction":4}',
      notes: "Keep performer remove notes",
      categoriesJson: "[]",
    });
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "video_list",
      "image_list",
      "performer_list",
      "video_update",
      "image_update",
      "performer_update",
      "video_list",
      "image_list",
      "performer_list",
    ]);
  });

  it("shows empty record delete preview when no records use the selected category", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Drama"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("1 usage")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category to delete"), {
      target: { value: "Unused" },
    });

    const preview = within(
      screen.getByRole("region", { name: "Record delete preview" }),
    );
    expect(
      preview.getByText("No existing records use this category."),
    ).toBeInTheDocument();
    expect(preview.getAllByText("0")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "Remove from Records" }),
    ).toBeDisabled();
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      "video_list",
      "image_list",
      "performer_list",
    ]);
  });

  it("deletes an unused managed category after confirmation without touching records", async () => {
    window.history.pushState({}, "", "/settings");
    window.localStorage.setItem(
      "sakurava.managedCategories.v1",
      '["Drama","Unused","Classic"]',
    );
    const invoke = vi.fn(async (command: string) => {
      if (command === "video_list") {
        return [persistedVideo({ categoriesJson: '["Drama"]' })];
      }
      if (command === "image_list" || command === "performer_list") {
        return [];
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("1 usage")).toBeInTheDocument();
    const applyDelete = screen.getByRole("button", { name: "Apply Delete" });
    expect(applyDelete).toBeDisabled();
    expect(screen.getByLabelText("Category to delete")).toHaveValue("Drama");
    expect(
      screen.getByText("1 usage: cannot be deleted until usage is removed."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Category to delete"), {
      target: { value: "Unused" },
    });

    expect(applyDelete).toBeEnabled();
    expect(
      screen.getByText("Unused / 0 usage: eligible for future deletion."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Confirm managed category delete"),
    ).not.toBeInTheDocument();

    fireEvent.click(applyDelete);
    expect(screen.getByText("Confirm managed category delete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    expect(window.localStorage.getItem("sakurava.managedCategories.v1")).toBe(
      '["Drama","Classic"]',
    );
    expect(
      screen.getByText(
        'Deleted managed category "Unused". Existing record categories were not changed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Unused" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Drama").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Classic").length).toBeGreaterThan(0);
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
    expect(invoke).toHaveBeenCalledTimes(3);
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

    const backupButton = screen.getByRole("button", { name: "Backup Data" });
    expect(backupButton).toBeEnabled();
    fireEvent.click(backupButton);

    await waitFor(() => expect(dialogMocks.save).toHaveBeenCalledTimes(1));
    expect(invoke).not.toHaveBeenCalledWith(
      "database_backup",
      expect.anything(),
      undefined,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Data" })).toBeEnabled();
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

    fireEvent.click(screen.getByRole("button", { name: "Backup Data" }));

    await screen.findByText(`Backup created at ${destinationPath}`);
    expect(dialogMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: expect.stringMatching(
          /^sakurava-backup-\d{4}-\d{2}-\d{2}\.sqlite$/,
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

    fireEvent.click(screen.getByRole("button", { name: "Backup Data" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Backup Data" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to back up SQLite database",
    );
    expect(screen.getByRole("button", { name: "Backup Data" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Restore Data" })).toBeEnabled();
  });

  it("cancels restore source selection without calling the restore command", async () => {
    window.history.pushState({}, "", "/settings");
    const invoke = vi.fn();
    window.__TAURI_INTERNALS__ = {
      invoke,
    };
    dialogMocks.open.mockResolvedValue(null);

    render(<App />);

    const restoreButton = screen.getByRole("button", { name: "Restore Data" });
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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Restore Data" }));
    await screen.findByText("Confirm database restore");
    fireEvent.click(screen.getByRole("button", { name: "Restore database" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Restore source failed SQLite integrity check",
    );
    expect(screen.getByRole("button", { name: "Restore Data" })).toBeEnabled();
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
      "Browse Cover",
      "Browse Media",
      "Tech info uses saved values only. File analysis is not run.",
      "No related Performers selected.",
      "Rewatch",
    ],
    [
      "/videos/sample-id/edit",
      "Video Edit Form",
      "Browse Cover",
      "Browse Media",
      "Tech info uses saved values only. File analysis is not run.",
      "No related Images selected.",
      "Rewatch",
    ],
    [
      "/images/new",
      "Image Create Form",
      "Browse Cover",
      "Browse Gallery Folder",
      "Tech info uses saved values only. Folder analysis is not run.",
      "No related Videos selected.",
      "Memorability",
    ],
    [
      "/images/sample-id/edit",
      "Image Edit Form",
      "Browse Cover",
      "Browse Gallery Folder",
      "Tech info uses saved values only. Folder analysis is not run.",
      "No related Performers selected.",
      "Memorability",
    ],
    [
      "/performers/new",
      "Performer Create Form",
      "Browse Cover",
      "Mini Thumbnail 1",
      "No related Videos selected.",
      "No related Images selected.",
      "Attraction",
    ],
    [
      "/performers/sample-id/edit",
      "Performer Edit Form",
      "Browse Cover",
      "Mini Thumbnail 1",
      "No related Videos selected.",
      "No related Images selected.",
      "Attraction",
    ],
  ])(
    "renders static form safeguards for %s",
    (path, formLabel, disabledOne, disabledTwo, placeholderOne, placeholderTwo, ratingLabel) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getByText(formLabel)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: disabledOne })).toBeDisabled();
      expect(screen.getAllByText(disabledTwo).length).toBeGreaterThan(0);
      expect(screen.getAllByText(placeholderOne).length).toBeGreaterThan(0);
      expect(screen.getAllByText(placeholderTwo).length).toBeGreaterThan(0);
      expect(screen.getByLabelText(ratingLabel)).toBeInTheDocument();
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it.each([
    "/videos/new",
    "/images/new",
    "/performers/new",
  ])("uses Managed Categories as form picker choices on %s", async (path) => {
    window.history.pushState({}, "", path);
    setManagedCategories(["Managed Category", "managed category", "  Trimmed Category  "]);

    render(<App />);

    expect(screen.queryByPlaceholderText("Add category...")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Manage categories in Category Management./),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search categories" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Add Managed Category" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Trimmed Category" }))
      .toBeInTheDocument();
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
      target: { value: "" },
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
      screen.getByRole("heading", { name: "1. Basic Identity" }).closest("section"),
      screen.getByRole("heading", { name: "2. Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "3. Cover" }).closest("section"),
      screen.getByRole("heading", { name: "4. Media Video" }).closest("section"),
      screen.getByRole("heading", { name: "5. Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "6. Categories" }).closest("section"),
      screen.getByRole("heading", { name: "7. Rating" }).closest("section"),
      screen.getByRole("heading", { name: "8. Related Performer" }).closest("section"),
      screen.getByRole("heading", { name: "9. Related Images" }).closest("section"),
      screen.getByRole("heading", { name: "10. Notes" }).closest("section"),
    ]);

    const metadata = within(
      screen.getByRole("heading", { name: "2. Metadata" }).closest("section") as HTMLElement,
    );
    const techInfo = within(
      screen.getByRole("heading", { name: "5. Tech Info" }).closest("section") as HTMLElement,
    );

    expect(metadata.queryByLabelText("Duration")).not.toBeInTheDocument();
    expect(techInfo.getByLabelText("Duration")).toBeInTheDocument();
    expect(techInfo.getByText("Resolution")).toBeInTheDocument();
    expect(techInfo.getByText("File Size")).toBeInTheDocument();
    expect(techInfo.getByText("File Type")).toBeInTheDocument();
    expect(techInfo.getAllByDisplayValue("Not detected")).toHaveLength(3);
    expect(techInfo.queryByText("Quality")).not.toBeInTheDocument();
  });

  it("orders Image form gallery and Tech Info sections safely", () => {
    window.history.pushState({}, "", "/images/new");
    render(<App />);

    expectSectionOrder([
      screen.getByRole("heading", { name: "1. Basic Identity" }).closest("section"),
      screen.getByRole("heading", { name: "2. Metadata" }).closest("section"),
      screen.getByRole("heading", { name: "3. Cover" }).closest("section"),
      screen.getByRole("heading", { name: "4. Gallery Images" }).closest("section"),
      screen.getByRole("heading", { name: "5. Tech Info" }).closest("section"),
      screen.getByRole("heading", { name: "6. Categories" }).closest("section"),
      screen.getByRole("heading", { name: "7. Rating" }).closest("section"),
      screen.getByRole("heading", { name: "8. Related Performer" }).closest("section"),
      screen.getByRole("heading", { name: "9. Related Video" }).closest("section"),
      screen.getByRole("heading", { name: "10. Notes" }).closest("section"),
    ]);

    const metadata = within(
      screen.getByRole("heading", { name: "2. Metadata" }).closest("section") as HTMLElement,
    );
    const techInfo = within(
      screen.getByRole("heading", { name: "5. Tech Info" }).closest("section") as HTMLElement,
    );

    expect(screen.queryByLabelText("Gallery Folder Path")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
    expect(screen.getByTestId("gallery-image-path-list")).toHaveClass("overflow-y-auto");
    expect(metadata.queryByLabelText("Image Count")).not.toBeInTheDocument();
    expect(techInfo.getByLabelText("Image Count")).toBeInTheDocument();
    expect(techInfo.getByText("Main Resolution")).toBeInTheDocument();
    expect(techInfo.getByText("Total Size")).toBeInTheDocument();
    expect(techInfo.getByText("File Type")).toBeInTheDocument();
    expect(techInfo.getAllByDisplayValue("Not detected")).toHaveLength(3);
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
    expect(screen.getByText("No Managed Categories available.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage Category" }),
    ).toHaveAttribute("href", "/settings/category-management");
  });

  it("shows an empty related performer picker state without free-text creation", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    expect(screen.getByRole("heading", { name: "8. Related Performer" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related performers")).toBeInTheDocument();
    expect(screen.getByText("No related Performers selected.")).toBeInTheDocument();
    expect(screen.getByText("No Performer records available. Create Performer records first."))
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

    expect(screen.getByRole("heading", { name: "9. Related Images" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related images")).toBeInTheDocument();
    expect(screen.getByText("No related Images selected.")).toBeInTheDocument();
    expect(screen.getByText("No Image records available. Create Image records first."))
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

    expect(screen.getByRole("heading", { name: "9. Related Video" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Search related videos")).toBeInTheDocument();
    expect(screen.getByText("No related Videos selected.")).toBeInTheDocument();
    expect(screen.getByText("No Video records available. Create Video records first."))
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
    expect(screen.getByPlaceholderText("Search performers..."))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search images...")).toBeInTheDocument();
    expect(screen.getByText("Manage related records in Performers."))
      .toBeInTheDocument();
    expect(screen.getByText("Manage related records in Images."))
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

    fireEvent.change(await screen.findByLabelText("Search related performers"), {
      target: { value: "cherry" },
    });
    expect(screen.getByText("Aoi Sakura - Sakura Aoi, +9 more"))
      .toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related performer Aoi Sakura",
      }),
    );
    expect(screen.getByText("Aoi Sakura")).toBeInTheDocument();
    expect(screen.queryByText("performer_aoi")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add related performer Aoi Sakura" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Related Video" },
    });
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
        if (command === "performer_list") {
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

    fireEvent.change(await screen.findByLabelText("Search related images"), {
      target: { value: "img-001" },
    });
    expect(screen.getByText("IMG-001 - Hanami Gallery")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related image Hanami Gallery",
      }),
    );
    expect(screen.getByText("IMG-001")).toBeInTheDocument();
    expect(screen.queryByText("image_hanami")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Video With Images" },
    });
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

    fireEvent.change(await screen.findByLabelText("Search related videos"), {
      target: { value: "vid-001" },
    });
    expect(screen.getByText("VID-001 - Spring Feature")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related video Spring Feature",
      }),
    );
    expect(screen.getByText("VID-001")).toBeInTheDocument();
    expect(screen.queryByText("video_spring")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Image With Videos" },
    });
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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Add related performer Yuki Tanaka",
      }),
    );
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Related Image" },
    });
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
          expect(args.input).not.toHaveProperty("relatedVideosJson");
          expect(args.input).not.toHaveProperty("relatedImagesJson");
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
    expect(screen.getByText("VID-123 - Spring Feature")).toBeInTheDocument();
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
    expect(screen.getByText("IMG-123 - Hanami Gallery")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Legacy Relation Video")).toBeInTheDocument();
  });

  it("keeps legacy record-only categories visible and removable on edit forms", () => {
    window.history.pushState({}, "", "/videos/sample-id/edit");
    render(<App />);

    expect(screen.getByText("Category A")).toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
    expect(screen.getAllByText("Record-only")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove Category A" }));

    expect(screen.queryByText("Category A")).not.toBeInTheDocument();
    expect(screen.getByText("Category B")).toBeInTheDocument();
  });

  it.each([
    {
      path: "/videos/new",
      buttonName: "Browse Cover",
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
      buttonName: "Browse Media",
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
      buttonName: "Browse Cover",
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
      buttonName: "Browse Cover",
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
      buttonName: "Browse Mini Thumbnail 2",
      inputLabel: "Mini Thumbnail 2",
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
    async ({ path, buttonName, inputLabel, selectedPath, expectedDialog }) => {
      window.history.pushState({}, "", path);
      window.__TAURI_INTERNALS__ = {
        invoke: vi.fn(),
      };
      dialogMocks.open.mockResolvedValue(selectedPath);

      render(<App />);

      const browseButton = screen.getByRole("button", { name: buttonName });
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

    expect(screen.queryByLabelText("Mini Thumbnail 1")).not.toBeInTheDocument();
    unmount();

    window.history.pushState({}, "", "/images/new");
    render(<App />);

    expect(screen.queryByLabelText("Mini Thumbnail 1")).not.toBeInTheDocument();
  });

  it("does not open native picker from browser preview", () => {
    window.history.pushState({}, "", "/videos/new");
    render(<App />);

    const browseButton = screen.getByRole("button", { name: "Browse Cover" });
    expect(browseButton).toBeDisabled();
    fireEvent.click(browseButton);

    expect(dialogMocks.open).not.toHaveBeenCalled();
  });

  it("labels performer persisted and planned fields distinctly", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    expect(screen.getByLabelText("Mini Thumbnail 1")).not.toBeDisabled();
    expect(screen.getByLabelText("Mini Thumbnail 2")).not.toBeDisabled();
    expect(screen.getByLabelText("Mini Thumbnail 3")).not.toBeDisabled();
    expect(screen.getByLabelText("Mini Thumbnail 4")).not.toBeDisabled();
    expect(screen.getByLabelText("Filmography")).not.toBeDisabled();
    expect(screen.getByLabelText("Pictorials")).not.toBeDisabled();
    expect(screen.getByLabelText("Birth Date")).not.toBeDisabled();
    expect(screen.getByLabelText("Years Active (planned)")).toBeDisabled();
    expect(screen.getByLabelText("Birthplace (planned)")).toBeDisabled();
    expect(screen.getByLabelText("Height (planned)")).toBeDisabled();
    expect(
      screen.getByText(
        "Birth date is saved. Other personal fields are planned and not saved in MVP.",
      ),
    ).toBeInTheDocument();
  });

  it("allows local form typing, category chips, aliases, and ratings", () => {
    window.history.pushState({}, "", "/performers/new");
    setManagedCategories(["Typed Category"]);
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Typed Performer" },
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
    expect(screen.getAllByText("Video").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Image").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Performer").length).toBeGreaterThan(0);
    const continueCataloging = screen.getByRole("region", {
      name: "Continue Cataloging",
    });
    expect(
      within(continueCataloging).getAllByRole("link").map((link) =>
        link.textContent,
      ),
    ).toEqual([
      "Fourth VideoVideo",
      "Third VideoVideo",
      "Older VideoVideo",
    ]);
    const recentlyAddedSection = screen.getByRole("region", {
      name: "Recently Added",
    });
    expect(
      within(recentlyAddedSection).getAllByRole("link").map((link) =>
        link.textContent,
      ),
    ).toEqual([
      "Older VideoVideo",
      "Recent ImageImage",
      "Recent VideoVideo",
      "Recent PerformerPerformer",
    ]);
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
    expect(screen.getByLabelText("Sorting")).toHaveDisplayValue("Last Updated");
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

      const dialog = await screen.findByRole("dialog", { name: dialogName });
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
      expect(await screen.findByRole("dialog", { name: dialogName })).toBeInTheDocument();
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
    expect(screen.getByText("Sakura Aoi")).toBeInTheDocument();
    const relatedCard = screen.getByText("Aoi Sakura").closest("article");
    expect(relatedCard).not.toBeNull();
    expect(within(relatedCard as HTMLElement).queryByText("Performer")).not.toBeInTheDocument();
    expect(relatedCard?.parentElement).toHaveAttribute("href", "/performers/performer_aoi");
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
    expect(screen.getAllByText("Related item unavailable")).toHaveLength(2);
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
    expect(screen.getByText("Spring Original")).toBeInTheDocument();
    const relatedCard = screen.getByText("Hanami Gallery").closest("article");
    expect(relatedCard).not.toBeNull();
    expect(within(relatedCard as HTMLElement).queryByText("Image")).not.toBeInTheDocument();
    expect(relatedCard?.parentElement).toHaveAttribute("href", "/images/image_hanami");
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
    expect(screen.getByText("Feature Original")).toBeInTheDocument();
    const relatedCard = screen.getByText("Spring Feature").closest("article");
    expect(relatedCard).not.toBeNull();
    expect(within(relatedCard as HTMLElement).queryByText("Video")).not.toBeInTheDocument();
    expect(relatedCard?.parentElement).toHaveAttribute("href", "/videos/video_spring");
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
    expect(screen.getAllByText("Related item unavailable")).toHaveLength(2);
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

  it("renders Performer related Videos and Images with local controls and release sorting", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const relatedVideos = [
      persistedVideo({
        id: "video_old",
        title: "Old Related Video",
        releaseDate: "2020-01-01",
        durationMinutes: 80,
        relatedPerformersJson:
          '[{"performerId":"performer_test_001","nameSnapshot":"Persisted Performer"}]',
      }),
      persistedVideo({
        id: "video_new",
        title: "New Related Video",
        releaseDate: "2024-01-01",
        durationMinutes: 110,
        relatedPerformersJson:
          '[{"performerId":"performer_test_001","nameSnapshot":"Persisted Performer"}]',
      }),
      persistedVideo({
        id: "video_missing_date",
        title: "Undated Related Video",
        releaseDate: "",
        durationMinutes: 95,
        relatedPerformersJson:
          '[{"performerId":"performer_test_001","nameSnapshot":"Persisted Performer"}]',
      }),
      ...[2019, 2018, 2017, 2016].map((year) =>
        persistedVideo({
          id: `video_${year}`,
          title: `${year} Related Video`,
          releaseDate: `${year}-01-01`,
          durationMinutes: 70,
          relatedPerformersJson:
            '[{"performerId":"performer_test_001","nameSnapshot":"Persisted Performer"}]',
        }),
      ),
    ];
    const relatedImages = [
      persistedImage({
        id: "image_new",
        title: "New Related Image",
        releaseDate: "2025-01-01",
        imageCount: 18,
        relatedPerformersJson:
          '[{"performerId":"performer_test_001","nameSnapshot":"Persisted Performer"}]',
      }),
    ];
    const invoke = vi.fn(async (command: string, args: Record<string, any> = {}) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({ name: "Persisted Performer" });
      }
      if (command === "video_list") {
        return relatedVideos;
      }
      if (command === "image_list") {
        return relatedImages;
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = { invoke };

    render(<App />);

    expect(await screen.findByText("Persisted Performer")).toBeInTheDocument();
    const videosSection = screen.getByText("Related Videos").closest("section");
    expect(videosSection).not.toBeNull();
    const videos = within(videosSection as HTMLElement);

    expect(videos.getByText("Grid")).toBeInTheDocument();
    expect(videos.getByText("Table")).toBeInTheDocument();
    expect(videos.getByText("New Related Video").closest("article")?.parentElement)
      .toHaveAttribute("href", "/videos/video_new");
    expect(videos.getByText("110 min")).toBeInTheDocument();
    expect(
      within(videos.getByText("New Related Video").closest("article") as HTMLElement)
        .queryByText("Video"),
    ).not.toBeInTheDocument();

    fireEvent.click(videos.getByRole("button", { name: "Table" }));
    const tableRows = videos.getAllByRole("row");
    expect(within(tableRows[1]).getByText("New Related Video")).toBeInTheDocument();
    expect(within(tableRows[2]).getByText("Old Related Video")).toBeInTheDocument();
    expect(within(tableRows[3]).getByText("2019 Related Video")).toBeInTheDocument();
    expect(videos.queryByText("Undated Related Video")).not.toBeInTheDocument();
    fireEvent.click(videos.getByRole("button", { name: "Next" }));
    expect(videos.getByText("Undated Related Video")).toBeInTheDocument();
    expect(videos.getByText("Not set")).toBeInTheDocument();

    const imagesSection = screen.getByText("Related Images").closest("section");
    expect(imagesSection).not.toBeNull();
    const images = within(imagesSection as HTMLElement);
    expect(images.getByText("New Related Image").closest("article")?.parentElement)
      .toHaveAttribute("href", "/images/image_new");
    expect(images.getByText("Total 18 images")).toBeInTheDocument();
    expect(
      within(images.getByText("New Related Image").closest("article") as HTMLElement)
        .queryByText("Image"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("video_new")).not.toBeInTheDocument();
    expect(screen.queryByText("image_new")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Video")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("video_test_001")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Add Classic" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Category" })).toHaveAttribute(
      "href",
      "/settings/category-management",
    );
    expect(screen.queryByText(/categoriesJson/)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoryIds|category_ids/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /category/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Classic" }));
    expect(screen.getByText("Classic")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Picker Video")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
  });

  it("renders existing Video record categories as normalized managed and record-only chips", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
    setManagedCategories(["Classic", "Updated"]);
    const existing = persistedVideo({
      title: "Existing Picker Video",
      categoriesJson: '[" Classic ","classic","Legacy",""]',
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
    expect(screen.getAllByText("Record-only").length).toBeGreaterThan(0);
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
      async (command: string, args: Record<string, any>) => {
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
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fireEvent.change(screen.getByLabelText("Rewatch"), {
      target: { value: "5" },
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Image")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  });

  it("renders the Image form category picker", () => {
    window.history.pushState({}, "", "/images/new");
    setManagedCategories(["Portrait"]);

    render(<App />);

    expect(screen.getByTestId("category-picker-field")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toBeInTheDocument();
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
      screen.getByRole("button", { name: "Browse Gallery Folder" }),
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
      screen.getByRole("button", { name: "Browse Gallery Folder" }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      "Replace current Gallery Images path rows?",
    );
    expect(
      await screen.findByDisplayValue("C:/Replacement/new.gif"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("C:/Old/one.jpg")).not.toBeInTheDocument();

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
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fireEvent.change(screen.getByLabelText("Memorability"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Updated Image")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  });

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

    expect(
      screen.getAllByRole("img", { name: /Gallery image/i }),
    ).toHaveLength(32);
    expect(screen.getByText("Showing 32 of 40 images")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load More" }));

    expect(
      screen.getAllByRole("img", { name: /Gallery image/i }),
    ).toHaveLength(40);
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

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
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

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
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

    const viewer = screen.getByRole("dialog", {
      name: "Gallery full-size viewer",
    });
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
      target: { value: "Created Performer" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Typed Alias" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Typed Category" }));
    fireEvent.change(screen.getByLabelText("Mini Thumbnail 1"), {
      target: { value: " D:/Thumbs/created-1.jpg " },
    });
    fireEvent.change(screen.getByLabelText("Mini Thumbnail 2"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Mini Thumbnail 3"), {
      target: { value: "D:/Thumbs/created-2.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Performer")).toBeInTheDocument();
    expect(screen.getByText("Typed Alias")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  });

  it("renders the Performer form category picker", () => {
    window.history.pushState({}, "", "/performers/new");
    setManagedCategories(["Featured"]);

    render(<App />);

    expect(screen.getByTestId("category-picker-field")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search categories" }))
      .toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Empty Thumbnail Performer")).toBeInTheDocument();
  });

  it("loads and updates a performer through Tauri commands", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    setManagedCategories(["Updated"]);
    const existing = persistedPerformer({
      name: "Existing Performer",
      aliasesJson: '["Alias One"]',
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
          currentPerformer = updated;
          return updated;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Performer")).toBeInTheDocument();
    expect(screen.getByLabelText("Mini Thumbnail 1")).toHaveValue(
      "D:/Thumbs/existing-1.jpg",
    );
    expect(screen.getByLabelText("Mini Thumbnail 2")).toHaveValue(
      "D:/Thumbs/existing-2.jpg",
    );
    expect(screen.getByLabelText("Mini Thumbnail 3")).toHaveValue("");
    expect(screen.getByLabelText("Mini Thumbnail 4")).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Updated Performer" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Alias Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Updated" }));
    fireEvent.change(screen.getByLabelText("Attraction"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Mini Thumbnail 2"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Mini Thumbnail 3"), {
      target: { value: "D:/Thumbs/updated-3.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Updated Performer")).toBeInTheDocument();
    expect(screen.getByText("Alias Two")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  });

  it("shows persisted timestamps on performer detail", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001");
    const invoke = vi.fn(async (command: string, args: Record<string, any>) => {
      if (command === "performer_get") {
        expect(args.id).toBe("performer_test_001");
        return persistedPerformer({
          name: "Timestamped Performer",
          createdAt: "2026-05-09T01:02:03.000Z",
          updatedAt: "2026-05-12T10:11:12.000Z",
        });
      }

      throw new Error(`Unexpected command ${command}`);
    }) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByText("Timestamped Performer")).toBeInTheDocument();
    expect(screen.getByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("Created in Sakurava")).toBeInTheDocument();
    expect(screen.getByText("May 9, 2026, 01:02 AM UTC")).toBeInTheDocument();
    expect(screen.getByText("Last edited")).toBeInTheDocument();
    expect(screen.getByText("May 12, 2026, 10:11 AM UTC")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-09T01:02:03.000Z")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-05-12T10:11:12.000Z")).not.toBeInTheDocument();
    expect(screen.getByText("Years Active")).toBeInTheDocument();
    expect(screen.getByText("Not tracked")).toBeInTheDocument();
    expect(screen.getAllByText("Not saved").length).toBeGreaterThan(0);
  });

  it.each([
    ["/videos/new", "8. Related Performer", "9. Related Images"],
    ["/videos/sample-id/edit", "8. Related Performer", "9. Related Images"],
    ["/images/new", "8. Related Performer", "9. Related Video"],
    ["/images/sample-id/edit", "8. Related Performer", "9. Related Video"],
    ["/performers/new", "8. Related Videos", "9. Related Images"],
    ["/performers/sample-id/edit", "8. Related Videos", "9. Related Images"],
  ])("renders separate related sections for %s", (path, first, second) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("heading", { name: first })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: second })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "8. Related Content" }))
      .not.toBeInTheDocument();
  });

  it.each(["/performers/new", "/performers/sample-id/edit"])(
    "renders only functional Performer related sections for %s",
    (path) => {
      window.history.pushState({}, "", path);
      render(<App />);

      expect(screen.getAllByRole("heading", { name: "8. Related Videos" }))
        .toHaveLength(1);
      expect(screen.getAllByRole("heading", { name: "9. Related Images" }))
        .toHaveLength(1);
      expect(
        screen.queryByText("Available after relation features are added."),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "10. Related Videos" }))
        .not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "11. Related Images" }))
        .not.toBeInTheDocument();
      expect(screen.getByLabelText("Search related videos")).toBeInTheDocument();
      expect(screen.getByLabelText("Search related images")).toBeInTheDocument();
    },
  );
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

function setManagedCategories(categories: string[]) {
  window.localStorage.setItem(
    "sakurava.managedCategories.v1",
    JSON.stringify(categories),
  );
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
    birthDate: "2026-05-11",
    coverPath: "",
    performerThumbnailPathsJson: "[]",
    filmographyCount: 12,
    pictorialsCount: 8,
    categoriesJson: '["Classic"]',
    ratingJson: '{"attraction":4,"visual":3}',
    notes: "Persisted performer notes",
    favorite: true,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    ...overrides,
  };
}
