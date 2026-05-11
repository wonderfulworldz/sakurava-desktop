import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the app shell and Home page", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getAllByText("Sakurava")).toHaveLength(1);
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
