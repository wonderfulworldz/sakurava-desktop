import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";

type TestTauriInvoke = NonNullable<Window["__TAURI_INTERNALS__"]>["invoke"];

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    delete window.__TAURI_INTERNALS__;
  });

  it("renders the app shell and Home page", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getAllByText("Sakurava")).toHaveLength(1);
    expect(
      screen.getByPlaceholderText("Search videos, images, performers..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Welcome to Sakurava")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /videos/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /images/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /performers/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText("Local mode")).toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
  });

  it.each([
    ["/", "Home"],
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
    ["/settings", "Settings"],
  ])("renders %s", (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
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
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByDisplayValue("All categories")).toBeInTheDocument();
    expect(screen.getByLabelText("Items per page")).toHaveDisplayValue("30");
    for (const pageSize of ["30", "60", "90", "120"]) {
      expect(screen.getByRole("option", { name: pageSize })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getAllByText(/Sample/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Grid view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List view" })).toBeInTheDocument();
  });

  it.each([
    [
      "/videos/sample-id",
      [
        "Video Detail",
        "Morning Archive",
        "Rewatch",
        "Related Performer",
        "Related Images",
        "Tech info is not detected in MVP.",
      ],
      true,
    ],
    [
      "/images/sample-id",
      [
        "Image Detail",
        "City Light Set",
        "Memorability",
        "Related Video",
        "Related Performer",
        "Folder analysis is not available in MVP.",
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
        "Related Video",
        "Related Images",
        "Available after relation features are added.",
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
      const readOnlyPlaceholder = screen.queryByText("Read-only placeholder");
      if (expectsReadOnly) {
        expect(readOnlyPlaceholder).toBeInTheDocument();
      } else {
        expect(readOnlyPlaceholder).not.toBeInTheDocument();
      }
      expect(screen.queryByText("sample-id")).not.toBeInTheDocument();
    },
  );

  it("renders the read-only Settings page", () => {
    window.history.pushState({}, "", "/settings");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("App Overview")).toBeInTheDocument();
    expect(screen.getByText("Storage & Database")).toBeInTheDocument();
    expect(screen.getByText("Data Safety")).toBeInTheDocument();
    expect(screen.getByText("MVP Feature Status")).toBeInTheDocument();
    expect(screen.getByText("UI Preferences")).toBeInTheDocument();
    expect(screen.getByText("About Sakurava")).toBeInTheDocument();
    expect(screen.getAllByText("Sakurava").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("1.0.0 MVP")).toBeInTheDocument();
    expect(screen.getByText("Local / Offline")).toBeInTheDocument();
    expect(screen.getByText("Windows Desktop")).toBeInTheDocument();
    expect(screen.getByText("Static Frontend Preview")).toBeInTheDocument();
    expect(screen.getByText("sakurava.sqlite")).toBeInTheDocument();
    expect(screen.getByText("Not connected yet")).toBeInTheDocument();
    expect(screen.getByText("Frontend Static Only")).toBeInTheDocument();
    expect(screen.getByText("Database Not Connected")).toBeInTheDocument();
    expect(screen.getByText("Local device only")).toBeInTheDocument();
    expect(screen.getAllByText("Static UI Ready")).toHaveLength(4);
    expect(screen.getByText("Sakura Pink")).toBeInTheDocument();
    expect(
      screen.getByText("UI preferences are read-only in MVP."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup Data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore Data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open Data Folder" })).toBeDisabled();
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
      "Tech info is not detected in MVP.",
      "Related Performer",
      "Rewatch",
    ],
    [
      "/videos/sample-id/edit",
      "Video Edit Form",
      "Browse Cover",
      "Browse Media",
      "Tech info is not detected in MVP.",
      "Related Images",
      "Rewatch",
    ],
    [
      "/images/new",
      "Image Create Form",
      "Browse Cover",
      "Browse Folder",
      "Folder analysis is not available in MVP.",
      "Related Video",
      "Memorability",
    ],
    [
      "/images/sample-id/edit",
      "Image Edit Form",
      "Browse Cover",
      "Browse Folder",
      "Folder analysis is not available in MVP.",
      "Related Performer",
      "Memorability",
    ],
    [
      "/performers/new",
      "Performer Create Form",
      "Browse Cover",
      "Thumbnail 1",
      "Related Videos",
      "Related Images",
      "Attraction",
    ],
    [
      "/performers/sample-id/edit",
      "Performer Edit Form",
      "Browse Cover",
      "Thumbnail 1",
      "Related Videos",
      "Related Images",
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

  it("allows local form typing, category chips, aliases, and ratings", () => {
    window.history.pushState({}, "", "/performers/new");
    render(<App />);

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Typed Performer" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Typed Category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
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

  it("creates a video through Tauri commands without exposing the internal id", async () => {
    window.history.pushState({}, "", "/videos/new");
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
          return created;
        }
        if (command === "video_get") {
          return created;
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
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Typed Category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Video")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("video_test_001")).not.toBeInTheDocument();
  });

  it("loads and updates a video through Tauri commands", async () => {
    window.history.pushState({}, "", "/videos/video_test_001/edit");
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
          expect(args.patch.ratingJson).toContain('"rewatch":5');
          currentVideo = updated;
          return updated;
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
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
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
          return created;
        }
        if (command === "image_get") {
          return created;
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
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Typed Category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Image")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
  });

  it("loads and updates an image through Tauri commands", async () => {
    window.history.pushState({}, "", "/images/image_test_001/edit");
    const existing = persistedImage({
      title: "Existing Image",
      categoriesJson: '["Portrait"]',
      ratingJson: '{"memorability":3}',
    });
    const updated = persistedImage({
      title: "Updated Image",
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
          expect(args.patch.ratingJson).toContain('"memorability":5');
          currentImage = updated;
          return updated;
        }

        throw new Error(`Unexpected command ${command}`);
      },
    ) as unknown as TestTauriInvoke;
    window.__TAURI_INTERNALS__ = {
      invoke,
    };

    render(<App />);

    expect(await screen.findByDisplayValue("Existing Image")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Updated Image" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
    fireEvent.change(screen.getByLabelText("Memorability"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Updated Image")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("image_test_001")).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Typed Category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Created Performer")).toBeInTheDocument();
    expect(screen.getByText("Typed Alias")).toBeInTheDocument();
    expect(screen.getByText("Typed Category")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
  });

  it("loads and updates a performer through Tauri commands", async () => {
    window.history.pushState({}, "", "/performers/performer_test_001/edit");
    const existing = persistedPerformer({
      name: "Existing Performer",
      aliasesJson: '["Alias One"]',
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
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Updated Performer" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add alias..."), {
      target: { value: "Alias Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Aliases" }));
    fireEvent.change(screen.getByPlaceholderText("Add category..."), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Categories" }));
    fireEvent.change(screen.getByLabelText("Attraction"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Updated Performer")).toBeInTheDocument();
    expect(screen.getByText("Alias Two")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("performer_test_001")).not.toBeInTheDocument();
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
});

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
    categoriesJson: '["Portrait"]',
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
