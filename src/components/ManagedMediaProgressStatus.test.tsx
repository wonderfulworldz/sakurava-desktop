import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const statusMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock("../runtime/managedMediaStatus", async () => {
  const actual = await vi.importActual<typeof import("../runtime/managedMediaStatus")>(
    "../runtime/managedMediaStatus",
  );
  return { ...actual, getManagedMediaProgressStatus: statusMocks.getStatus };
});

vi.mock("../runtime/tauriClient", () => ({
  isTauriRuntimeAvailable: () => true,
}));

import { LanguageProvider } from "../lib/LanguageContext";
import ManagedMediaProgressStatus, {
  ACTIVE_PROGRESS_POLL_MS,
  ManagedMediaProgressIndicator,
} from "./ManagedMediaProgressStatus";

function renderIndicator(status: { ready: number; total: number; processing: boolean }) {
  return render(
    <LanguageProvider>
      <ManagedMediaProgressIndicator status={status} />
    </LanguageProvider>,
  );
}

describe("managed media progress status", () => {
  beforeEach(() => {
    statusMocks.getStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides no-work and completed states", () => {
    const view = renderIndicator({ ready: 0, total: 0, processing: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    view.rerender(
      <LanguageProvider>
        <ManagedMediaProgressIndicator status={{ ready: 4, total: 4, processing: false }} />
      </LanguageProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows compact truthful partial coverage without interactive blockers", () => {
    renderIndicator({ ready: 1, total: 4, processing: true });

    expect(screen.getByText("Preparing mini images — 1 / 4 · 25%"))
      .toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Mini image preparation" }))
      .toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("status").parentElement).toHaveClass("pointer-events-none");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("recalculates current truth when catalog growth increases total", () => {
    const view = renderIndicator({ ready: 3, total: 4, processing: true });
    expect(screen.getByText("Preparing mini images — 3 / 4 · 75%"))
      .toBeInTheDocument();

    view.rerender(
      <LanguageProvider>
        <ManagedMediaProgressIndicator status={{ ready: 3, total: 6, processing: true }} />
      </LanguageProvider>,
    );
    expect(screen.getByText("Preparing mini images — 3 / 6 · 50%"))
      .toBeInTheDocument();
  });

  it("polls actively during preparation and disappears on completion", async () => {
    vi.useFakeTimers();
    statusMocks.getStatus
      .mockResolvedValueOnce({ ready: 1, total: 2, processing: true })
      .mockResolvedValueOnce({ ready: 2, total: 2, processing: false });
    render(
      <LanguageProvider>
        <ManagedMediaProgressStatus />
      </LanguageProvider>,
    );

    await act(async () => Promise.resolve());
    expect(screen.getByText("Preparing mini images — 1 / 2 · 50%"))
      .toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_PROGRESS_POLL_MS);
    });
    expect(statusMocks.getStatus).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
