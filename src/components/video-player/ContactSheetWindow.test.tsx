import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/LanguageContext";
import { ContactSheetContent } from "./ContactSheetWindow";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  cleanup: vi.fn(),
  close: vi.fn(),
  generate: vi.fn(),
  save: vi.fn(),
  selectDestination: vi.fn(),
}));

vi.mock("../../runtime/contactSheetCommands", () => ({
  cancelContactSheet: mocks.cancel,
  cleanupContactSheet: mocks.cleanup,
  generateContactSheet: mocks.generate,
  saveContactSheet: mocks.save,
}));

vi.mock("../../runtime/dialogCommands", () => ({
  selectContactSheetDestination: mocks.selectDestination,
}));

vi.mock("../../runtime/localAsset", () => ({
  localImagePathToAssetSrc: (path: string | null | undefined) =>
    path ? `asset://${path}` : null,
}));

vi.mock("../../runtime/videoPlayerWindows", () => ({
  closeCurrentAuxiliaryWindow: mocks.close,
}));

const payload = {
  displayName: "Prototype Video",
  resolution: "1920 × 1080",
  durationLabel: "84 min",
  requestId: "contact-test",
  sourceIdentity: "V-2608-0001",
};

function renderContactSheet() {
  return render(
    <LanguageProvider>
      <ContactSheetContent payload={payload} />
    </LanguageProvider>,
  );
}

describe("ContactSheetWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cancel.mockResolvedValue({ cancelled: false });
    mocks.cleanup.mockResolvedValue({ cleaned: true });
    mocks.close.mockResolvedValue(undefined);
    mocks.generate.mockResolvedValue({
      requestId: "generation-1",
      previewPath: "D:\\preview\\sheet.jpg",
      format: "jpeg",
      width: 1600,
      height: 920,
      frameCount: 16,
      sampleSeconds: Array.from({ length: 16 }, (_, index) => index + 1),
    });
    mocks.save.mockResolvedValue({
      destinationPath: "D:\\output\\sheet.jpg",
      bytesWritten: 1234,
      success: true,
    });
    mocks.selectDestination.mockResolvedValue("D:\\output\\sheet.jpg");
  });

  it("renders real-generation controls with the approved defaults", () => {
    renderContactSheet();
    const root = screen.getByLabelText("Sakurava Contact Sheet");
    expect(root).toHaveAttribute("data-auxiliary-window", "contact-sheet");
    expect(root).toHaveAttribute("data-theme-source", "sakurava-appearance");
    expect(screen.getByRole("button", { name: "4×4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Width")).toHaveValue(1600);
    expect(screen.getByLabelText("JPEG Quality")).toHaveValue(90);
    expect(screen.getByLabelText("Timestamp")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Header")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Format")).toHaveValue("jpeg");
    expect(screen.queryByTestId("contact-sheet-grid")).not.toBeInTheDocument();
  });

  it("requests a bounded real preview and saves it through explicit Save As", async () => {
    renderContactSheet();
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({
      sourceIdentity: "V-2608-0001",
      grid: 4,
      width: 1600,
      quality: 90,
      timestamp: true,
      header: false,
      format: "jpeg",
    }));
    expect(await screen.findByTestId("contact-sheet-real-preview")).toHaveAttribute(
      "src",
      "asset://D:\\preview\\sheet.jpg",
    );
    expect(screen.getByTestId("contact-sheet-frame-count")).toHaveTextContent(
      "16 real frames",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save As…" }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        "D:\\preview\\sheet.jpg",
        "D:\\output\\sheet.jpg",
      ),
    );
    expect(mocks.selectDestination).toHaveBeenCalledWith(
      "Sakurava Contact Sheet - Prototype Video.jpg",
      "jpeg",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Contact Sheet saved");
  });

  it("cancels extraction and cleans the owned preview before closing", async () => {
    renderContactSheet();
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
    await screen.findByTestId("contact-sheet-real-preview");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith(null));
    expect(mocks.cleanup).toHaveBeenCalledWith("D:\\preview\\sheet.jpg");
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
