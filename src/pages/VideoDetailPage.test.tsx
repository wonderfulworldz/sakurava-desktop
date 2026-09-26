import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/LanguageContext";
import VideoDetailPage from "./VideoDetailPage";

const mocks = vi.hoisted(() => ({
  getVideoVisible: vi.fn(),
}));

vi.mock("../runtime/videoCommands", () => ({
  isVideoRuntimeAvailable: () => true,
  getVideoVisible: mocks.getVideoVisible,
}));

vi.mock("../runtime/performerCommands", () => ({
  isPerformerRuntimeAvailable: () => false,
  listPerformers: vi.fn(),
}));

vi.mock("../runtime/imageCommands", () => ({
  isImageRuntimeAvailable: () => false,
  listImages: vi.fn(),
}));

vi.mock("../runtime/creditCommands", () => ({ listCreditsByWork: () => Promise.resolve([]) }));
vi.mock("../runtime/managedCategoryCommands", () => ({ listManagedCategories: () => Promise.resolve([]) }));
vi.mock("../lib/videoIntegration", () => ({ buildVideoDetailConfig: () => ({}) }));
vi.mock("./DetailPage", () => ({ default: () => <div>Loaded video detail</div> }));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/videos/video-1"]}>
      <LanguageProvider>
        <Routes>
          <Route path="/videos/:itemKey" element={<VideoDetailPage />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Video Detail failure classification", () => {
  beforeEach(() => {
    mocks.getVideoVisible.mockReset();
    window.localStorage.clear();
  });

  it("opens a visible record", async () => {
    mocks.getVideoVisible.mockResolvedValue({ state: "visible", record: { id: "video-1" } });
    renderDetail();
    expect(await screen.findByText("Loaded video detail")).toBeInTheDocument();
  });

  it("uses not-found only for a missing record", async () => {
    mocks.getVideoVisible.mockResolvedValue({ state: "missing", record: null });
    renderDetail();
    expect(await screen.findByText("This video could not be found.")).toBeInTheDocument();
  });

  it("preserves hidden-record classification", async () => {
    mocks.getVideoVisible.mockResolvedValue({ state: "hidden", record: null });
    renderDetail();
    expect(await screen.findByText("Content is unavailable while Safe Filter is active.")).toBeInTheDocument();
  });

  it("shows reference recovery instead of not-found", async () => {
    mocks.getVideoVisible.mockRejectedValue("Catalog references need recovery before this action is available.");
    renderDetail();
    expect(await screen.findByText("Catalog references need recovery")).toBeInTheDocument();
    expect(screen.queryByText("This video could not be found.")).not.toBeInTheDocument();
  });

  it("shows an unexpected load failure instead of not-found", async () => {
    mocks.getVideoVisible.mockRejectedValue(new Error("Database connection is unavailable"));
    renderDetail();
    expect(await screen.findByText("This video could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("This video could not be found.")).not.toBeInTheDocument();
  });
});
