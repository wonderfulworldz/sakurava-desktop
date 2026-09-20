import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../lib/LanguageContext";
import { ContactSheetContent } from "./ContactSheetWindow";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  cleanup: vi.fn(),
  destroy: vi.fn(),
  generate: vi.fn(),
  progress: vi.fn(),
  nativeCloseHandler: null as null | ((event: { preventDefault: () => void }) => Promise<void>),
  onCloseRequested: vi.fn(),
  save: vi.fn(),
  selectDestination: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    destroy: mocks.destroy,
    onCloseRequested: mocks.onCloseRequested,
  }),
}));

vi.mock("../../runtime/tauriClient", () => ({
  isTauriRuntimeAvailable: () => true,
}));

vi.mock("../../runtime/contactSheetCommands", () => ({
  cancelContactSheet: mocks.cancel,
  cleanupContactSheet: mocks.cleanup,
  generateContactSheet: mocks.generate,
  getContactSheetProgress: mocks.progress,
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
  listenForContactSheetPayload: vi.fn(async () => vi.fn()),
  readStoredContactSheetPayload: vi.fn(() => null),
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
    window.localStorage.clear();
    mocks.cancel.mockResolvedValue({ cancelled: false });
    mocks.cleanup.mockResolvedValue({ cleaned: true });
    mocks.destroy.mockResolvedValue(undefined);
    mocks.progress.mockResolvedValue({ completed: 4, total: 32 });
    mocks.generate.mockResolvedValue({
      requestId: "generation-1",
      previewPath: "D:\\preview\\sheet.jpg",
      format: "jpeg",
      width: 1600,
      height: 920,
      frameCount: 32,
      sampleSeconds: Array.from({ length: 32 }, (_, index) => index + 1),
    });
    mocks.save.mockResolvedValue({
      destinationPath: "D:\\output\\sheet.jpg",
      bytesWritten: 1234,
      success: true,
    });
    mocks.selectDestination.mockResolvedValue("D:\\output\\sheet.jpg");
    mocks.nativeCloseHandler = null;
    mocks.onCloseRequested.mockImplementation(async (handler: (event: { preventDefault: () => void }) => Promise<void>) => {
      mocks.nativeCloseHandler = handler;
      return vi.fn();
    });
  });

  it("renders real-generation controls with the approved defaults", () => {
    renderContactSheet();
    const root = screen.getByLabelText("Sakurava Contact Sheet");
    expect(root).toHaveAttribute("data-auxiliary-window", "contact-sheet");
    expect(root).toHaveAttribute("data-theme-source", "sakurava-appearance");
    expect(root).toHaveAttribute("data-material", "sakurava-true-glass");
    expect(root).toHaveAttribute("data-surface-opacity", "80");
    expect(root).toHaveClass("bg-white/80", "dark:bg-slate-950/80");
    expect(root).not.toHaveClass("bg-white/45", "dark:bg-slate-950/55");
    expect(root).not.toHaveClass("opacity-80");
    expect(screen.getByLabelText("Contact Sheet preview")).toHaveClass("bg-white/35", "dark:bg-slate-900/35");
    expect(screen.getByLabelText("Contact Sheet settings")).toHaveClass("bg-white/35", "dark:bg-slate-900/35");
    expect(screen.getByLabelText("Contact Sheet preview")).not.toHaveClass("backdrop-blur-md");
    expect(screen.getByLabelText("Contact Sheet settings")).not.toHaveClass("backdrop-blur-md");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rows")).toHaveValue(4);
    expect(screen.getByLabelText("Columns")).toHaveValue(8);
    expect(screen.getByTestId("contact-sheet-total")).toHaveTextContent("32 thumbnails");
    expect(screen.getByLabelText("Width")).toHaveValue(1600);
    expect(screen.getByLabelText("JPEG Quality")).toHaveValue(90);
    expect(screen.getByLabelText("Timestamp")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Header")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Subtitles")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Format")).toHaveValue("jpeg");
    expect(screen.getByText("Choose the settings, then generate a preview.")).toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("requests a bounded real preview and saves it through explicit Save As", async () => {
    renderContactSheet();
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({
      sourceIdentity: "V-2608-0001",
      rows: 4,
      columns: 8,
      width: 1600,
      quality: 90,
      timestamp: true,
      header: false,
      subtitles: false,
      subtitleId: null,
      subtitlePath: null,
      theme: "light",
      format: "jpeg",
    }));
    expect(await screen.findByTestId("contact-sheet-real-preview")).toHaveAttribute(
      "src",
      "asset://D:\\preview\\sheet.jpg",
    );
    expect(screen.getByTestId("contact-sheet-frame-count")).toHaveTextContent(
      "32 real frames",
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

  it("cancels extraction and cleans the owned preview before native close", async () => {
    renderContactSheet();
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
    await screen.findByTestId("contact-sheet-real-preview");
    await waitFor(() => expect(mocks.nativeCloseHandler).not.toBeNull());
    const preventDefault = vi.fn();
    await act(async () => { await mocks.nativeCloseHandler?.({ preventDefault }); });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.cancel).toHaveBeenCalledWith(null);
    expect(mocks.cleanup).toHaveBeenCalledWith("D:\\preview\\sheet.jpg");
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it("classifies native close during generation as cancellation", async () => {
    let rejectGeneration!: (error: Error) => void;
    mocks.generate.mockReturnValue(new Promise((_, reject) => { rejectGeneration = reject; }));
    renderContactSheet();
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.nativeCloseHandler).not.toBeNull());
    await act(async () => { await mocks.nativeCloseHandler?.({ preventDefault: vi.fn() }); });
    rejectGeneration(new Error("CONTACT_SHEET_CANCELLED"));
    await waitFor(() => expect(screen.getAllByText("Contact Sheet generation cancelled")).toHaveLength(2));
    expect(screen.queryByText("CONTACT_SHEET_CANCELLED")).not.toBeInTheDocument();
  });

  it("keeps invalid manual grid input visible and blocks generation", () => {
    renderContactSheet();
    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "9" } });
    expect(screen.getByLabelText("Rows")).toHaveValue(9);
    expect(screen.getByTestId("contact-sheet-total")).toHaveTextContent("maximum 192");
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeDisabled();
  });

  it("keeps partially edited width text and blocks generation until it is valid", () => {
    renderContactSheet();
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "" } });
    expect(screen.getByLabelText("Width")).toHaveValue(null);
    expect(screen.getByText("Use a width from 640 to 3840 pixels.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "1920" } });
    expect(screen.getByLabelText("Width")).toHaveValue(1920);
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeEnabled();
  });
});
