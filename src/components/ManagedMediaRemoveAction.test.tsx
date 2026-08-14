import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../lib/LanguageContext";
import { AUTOMATIC_MINI_IMAGES_STORAGE_KEY } from "../lib/automaticMiniImagesState";

const removalMocks = vi.hoisted(() => ({ preview: vi.fn(), execute: vi.fn() }));

vi.mock("../runtime/managedMediaRemoval", () => ({
  previewManagedMediaRemoval: removalMocks.preview,
  executeManagedMediaRemoval: removalMocks.execute,
}));

import ManagedMediaRemoveAction from "./ManagedMediaRemoveAction";

const preview = {
  previewToken: "preview-token",
  automaticPolicyState: "off" as const,
  sourceSlotCountConsidered: 4,
  removableSourceSlotCount: 2,
  removablePhysicalVariantCount: 3,
  recordedRemovableBytes: 2048,
  protectedOriginalUnavailableSourceCount: 1,
  protectedOriginalUnavailableVariantCount: 2,
  alreadyMissingManagedFileCount: 1,
  conflictingNonterminalLifecycleWorkCount: 1,
  unresolvedRecoveryPublicationConflictCount: 0,
  validationFailedSourceCount: 0,
  skippedSourceSlotCount: 1,
  lifecycleConflictSourceCount: 1,
  recoveryConflictSourceCount: 0,
};

function renderAction() {
  return render(
    <LanguageProvider>
      <ManagedMediaRemoveAction />
    </LanguageProvider>,
  );
}

describe("ManagedMediaRemoveAction", () => {
  beforeEach(() => {
    localStorage.clear();
    removalMocks.preview.mockReset().mockResolvedValue(preview);
    removalMocks.execute.mockReset();
  });

  it("renders the exact preview, original safety warning, and preserved unavailable originals", async () => {
    localStorage.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, "false");
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Preview removal..." }));
    expect(await screen.findByText(/2 source slots and 3 managed image files/)).toHaveTextContent("2.0 KB");
    expect(screen.getByText("Original media and catalog records are never deleted.")).toBeInTheDocument();
    expect(screen.getByText(/1 source slots and 2 managed image files are preserved/)).toBeInTheDocument();
    expect(screen.getByText(/Lifecycle conflicts: 1/)).toBeInTheDocument();
  });

  it("shows preview while Automatic is ON but blocks destructive confirmation", async () => {
    localStorage.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, "true");
    removalMocks.preview.mockResolvedValueOnce({ ...preview, automaticPolicyState: "on" });
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Preview removal..." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Turn Automatic Mini Images OFF");
    expect(screen.getByRole("button", { name: "Remove eligible mini images..." })).toBeDisabled();
    expect(removalMocks.execute).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY)).toBe("true");
  });

  it("requires explicit confirmation while OFF and renders a partial-failure summary", async () => {
    localStorage.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, "false");
    removalMocks.execute.mockResolvedValueOnce({
      removedSourceSlotCount: 1,
      removedVariantCount: 2,
      protectedOriginalUnavailableSourceCount: 1,
      protectedOriginalUnavailableVariantCount: 2,
      alreadyMissingReconciledCount: 1,
      failedSourceSlotCount: 1,
      failedVariantCount: 1,
      skippedSourceSlotCount: 2,
      lockedOrUnmovableVariantCount: 1,
      staleSourceSlotCount: 0,
      lifecycleConflictSourceCount: 0,
      recoveryConflictSourceCount: 0,
      validationFailedSourceCount: 0,
      reclaimedBytes: 1024,
      stale: false,
    });
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Preview removal..." }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove eligible mini images..." }));
    expect(screen.getByRole("dialog", { name: "Remove eligible mini images?" })).toBeInTheDocument();
    expect(removalMocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove mini images" }));
    await waitFor(() => expect(removalMocks.execute).toHaveBeenCalledWith("preview-token"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Removed 2; preserved or skipped 2; failed 1; reclaimed 1.0 KB.");
    expect(localStorage.getItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY)).toBe("false");
  });

  it("presents stale execution without claiming removal", async () => {
    localStorage.setItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY, "false");
    removalMocks.execute.mockResolvedValueOnce({
      removedSourceSlotCount: 0,
      removedVariantCount: 0,
      protectedOriginalUnavailableSourceCount: 0,
      protectedOriginalUnavailableVariantCount: 0,
      alreadyMissingReconciledCount: 0,
      failedSourceSlotCount: 0,
      failedVariantCount: 0,
      skippedSourceSlotCount: 0,
      lockedOrUnmovableVariantCount: 0,
      staleSourceSlotCount: 0,
      lifecycleConflictSourceCount: 0,
      recoveryConflictSourceCount: 0,
      validationFailedSourceCount: 0,
      reclaimedBytes: 0,
      stale: true,
    });
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Preview removal..." }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove eligible mini images..." }));
    fireEvent.click(screen.getByRole("button", { name: "Remove mini images" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("preview is stale");
  });
});
