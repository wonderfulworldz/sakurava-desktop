import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "../../lib/LanguageContext";
import { ContactSheetContent } from "./ContactSheetWindow";

function renderContactSheet() {
  return render(
    <LanguageProvider>
      <ContactSheetContent
        payload={{
          displayName: "Prototype Video",
          resolution: "1920 × 1080",
          durationLabel: "84 min",
          requestId: "contact-test",
        }}
      />
    </LanguageProvider>,
  );
}

describe("ContactSheetWindow", () => {
  it("renders the separate root with approved defaults and mock frame cells", () => {
    renderContactSheet();
    const root = screen.getByLabelText("Sakurava Contact Sheet");
    expect(root).toHaveAttribute("data-auxiliary-window", "contact-sheet");
    expect(root).toHaveAttribute("data-theme-source", "sakurava-appearance");
    expect(screen.queryByLabelText(/Notifications/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Columns")).toHaveValue(4);
    expect(screen.getByLabelText("Rows")).toHaveValue(4);
    expect(screen.getByLabelText("Width")).toHaveValue(1600);
    expect(screen.getByLabelText("JPEG Quality")).toHaveValue(90);
    expect(screen.getByLabelText("Timestamp")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Header")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("contact-sheet-grid").children).toHaveLength(16);
  });

  it("updates the mock preview and keeps Save As frontend-only", () => {
    renderContactSheet();
    fireEvent.change(screen.getByLabelText("Columns"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "3" } });
    expect(screen.getByTestId("contact-sheet-grid").children).toHaveLength(15);

    fireEvent.click(screen.getByLabelText("Timestamp"));
    expect(within(screen.getByTestId("contact-sheet-grid")).queryByText(/:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save As…" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Save As is a visual prototype only",
    );
  });
});
