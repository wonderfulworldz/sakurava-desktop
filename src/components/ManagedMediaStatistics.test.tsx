import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const statisticsMocks = vi.hoisted(() => ({ getStatistics: vi.fn() }));

vi.mock("../runtime/managedMediaStatistics", () => ({
  getManagedMediaStatistics: statisticsMocks.getStatistics,
}));
vi.mock("../runtime/tauriClient", () => ({ isTauriRuntimeAvailable: () => true }));

import { LanguageProvider } from "../lib/LanguageContext";
import ManagedMediaStatistics, {
  formatManagedMediaStorage,
  managedMediaOverallStatus,
} from "./ManagedMediaStatistics";

function renderStatistics() {
  return render(<LanguageProvider><ManagedMediaStatistics /></LanguageProvider>);
}

describe("managed media statistics", () => {
  beforeEach(() => statisticsMocks.getStatistics.mockReset());

  it("renders all four approved statistics and refreshes on request", async () => {
    statisticsMocks.getStatistics
      .mockResolvedValueOnce({ readyCount: 2, sourceCount: 3, pendingCount: 1, publishedStorageBytes: 1536 })
      .mockResolvedValueOnce({ readyCount: 3, sourceCount: 3, pendingCount: 0, publishedStorageBytes: 2048 });
    renderStatistics();

    expect(screen.getByRole("status")).toHaveTextContent("Loading managed mini-image statistics...");
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Processing");

    fireEvent.click(screen.getByRole("button", { name: "Refresh statistics" }));
    await waitFor(() => expect(screen.getByText("2.0 KB")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Up to date");
    expect(statisticsMocks.getStatistics).toHaveBeenCalledTimes(2);
  });

  it("shows a retryable unavailable state", async () => {
    statisticsMocks.getStatistics.mockRejectedValueOnce(new Error("unavailable"));
    renderStatistics();

    expect(await screen.findByRole("alert")).toHaveTextContent("Statistics unavailable. Try again.");
    expect(screen.getByRole("button", { name: "Refresh statistics" })).toBeInTheDocument();
  });

  it("keeps the status precedence and storage formatting deterministic", () => {
    expect(managedMediaOverallStatus({ readyCount: 0, sourceCount: 0, pendingCount: 0, publishedStorageBytes: 0 })).toBe("empty");
    expect(managedMediaOverallStatus({ readyCount: 1, sourceCount: 2, pendingCount: 1, publishedStorageBytes: 0 })).toBe("processing");
    expect(managedMediaOverallStatus({ readyCount: 2, sourceCount: 2, pendingCount: 0, publishedStorageBytes: 0 })).toBe("upToDate");
    expect(managedMediaOverallStatus({ readyCount: 1, sourceCount: 2, pendingCount: 0, publishedStorageBytes: 0 })).toBe("notUpToDate");
    expect(formatManagedMediaStorage(0)).toBe("0 B");
    expect(formatManagedMediaStorage(1024)).toBe("1.0 KB");
  });
});
