import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "./LanguageContext";
import { LanguageEditor } from "../components/LanguageEditor";
import { createElement } from "react";
import { setOverrideForLanguage } from "./languageOverrides";
import { languageOverridesStorageKey } from "./languageOverrides";

function renderEditor() {
  const onClose = () => {};
  return render(
    createElement(LanguageProvider, null, createElement(LanguageEditor, { onClose })),
  );
}

describe("Language Editor UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders header with language name and helper text", () => {
    renderEditor();

    expect(screen.getByText("Language Editor")).toBeInTheDocument();
    expect(screen.getByText("Editing: English")).toBeInTheDocument();
    expect(
      screen.getByText("Edits are saved as local overrides. Built-in translations are not modified."),
    ).toBeInTheDocument();
  });

  it("renders search input and table with keys", () => {
    renderEditor();

    expect(screen.getByLabelText("Search translation keys")).toBeInTheDocument();
    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("shows close button that calls onClose", () => {
    let closed = false;
    render(
      createElement(
        LanguageProvider,
        null,
        createElement(LanguageEditor, { onClose: () => { closed = true; } }),
      ),
    );

    const closeButton = screen.getByLabelText("Close Language Editor");
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
    expect(closed).toBe(true);
  });

  it("shows Built-in status for keys with built-in text", () => {
    renderEditor();

    // nav.home has built-in English text
    const builtInBadges = screen.getAllByText("Built-in");
    expect(builtInBadges.length).toBeGreaterThan(0);
  });

  it("editing a text override changes status to Custom", () => {
    renderEditor();

    // Click on the text for nav.home to start editing
    const editButton = screen.getByLabelText("Edit text for nav.home");
    fireEvent.click(editButton);

    // Type a custom value
    const input = screen.getByLabelText("Edit text for nav.home");
    fireEvent.change(input, { target: { value: "Dashboard" } });

    // Save
    fireEvent.click(screen.getByText("Save"));

    // Should now show Custom status for this row
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("reset row restores built-in text", () => {
    // Pre-set an override
    setOverrideForLanguage("en", "nav.home", "Dashboard");

    renderEditor();

    // Should show Custom badge
    expect(screen.getByText("Custom")).toBeInTheDocument();

    // Click reset
    const resetButton = screen.getByLabelText("Reset override for nav.home");
    fireEvent.click(resetButton);

    // Custom badge should be gone (all should be Built-in now)
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("reset all clears all overrides", () => {
    setOverrideForLanguage("en", "nav.home", "Dashboard");
    setOverrideForLanguage("en", "nav.videos", "My Videos");

    renderEditor();

    // Should show Reset All button with count
    const resetAllButton = screen.getByLabelText("Reset all overrides");
    expect(resetAllButton).toHaveTextContent("Reset All (2)");

    fireEvent.click(resetAllButton);

    // No more Custom badges
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
    // Reset All button should be gone
    expect(screen.queryByLabelText("Reset all overrides")).not.toBeInTheDocument();
  });

  it("override persists in localStorage", () => {
    renderEditor();

    // Edit nav.home
    fireEvent.click(screen.getByLabelText("Edit text for nav.home"));
    const input = screen.getByLabelText("Edit text for nav.home");
    fireEvent.change(input, { target: { value: "My Home" } });
    fireEvent.click(screen.getByText("Save"));

    // Check localStorage
    const stored = window.localStorage.getItem(languageOverridesStorageKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.en["nav.home"]).toBe("My Home");
  });

  it("search filters rows by key or text", () => {
    renderEditor();

    const searchInput = screen.getByLabelText("Search translation keys");
    fireEvent.change(searchInput, { target: { value: "nav.home" } });

    // Should show the matching row
    expect(screen.getByLabelText("Edit text for nav.home")).toBeInTheDocument();

    // Should filter out non-matching rows
    expect(screen.queryByLabelText("Edit text for settings.title")).not.toBeInTheDocument();
  });

  it("does not show Reset All button when no overrides exist", () => {
    renderEditor();

    expect(screen.queryByLabelText("Reset all overrides")).not.toBeInTheDocument();
  });
});
