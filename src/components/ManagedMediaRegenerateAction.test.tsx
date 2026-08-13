import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/LanguageContext";

const regenerationMocks = vi.hoisted(() => ({
  regenerate: vi.fn(),
}));

vi.mock("../runtime/managedMediaRegeneration", () => ({
  regenerateMissingOrOutdatedManagedMedia: regenerationMocks.regenerate,
}));

import ManagedMediaRegenerateAction from "./ManagedMediaRegenerateAction";

function renderAction() {
  return render(
    <LanguageProvider>
      <ManagedMediaRegenerateAction />
    </LanguageProvider>,
  );
}

describe("ManagedMediaRegenerateAction", () => {
  beforeEach(() => {
    regenerationMocks.regenerate.mockReset();
  });

  it("disables repeated submission and reports queued work", async () => {
    let resolveRequest: (value: { queuedCount: number; alreadyActiveCount: number }) => void;
    regenerationMocks.regenerate.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderAction();

    const button = screen.getByRole("button", {
      name: "Regenerate Missing / Outdated",
    });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Preparing mini images...");
    fireEvent.click(button);
    expect(regenerationMocks.regenerate).toHaveBeenCalledTimes(1);

    resolveRequest!({ queuedCount: 2, alreadyActiveCount: 0 });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("2 mini image sources queued.");
  });

  it("reports up-to-date and command errors concisely", async () => {
    regenerationMocks.regenerate.mockResolvedValueOnce({ queuedCount: 0, alreadyActiveCount: 0 });
    renderAction();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate Missing / Outdated" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Mini images are up to date.");

    regenerationMocks.regenerate.mockRejectedValueOnce(new Error("Managed media is unavailable."));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Missing / Outdated" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Managed media is unavailable.");
  });
});
