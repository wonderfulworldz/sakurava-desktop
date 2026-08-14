import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/LanguageContext";
import { AUTOMATIC_MINI_IMAGES_STORAGE_KEY } from "../lib/automaticMiniImagesState";

const automaticMocks = vi.hoisted(() => ({ synchronize: vi.fn() }));
vi.mock("../runtime/managedMediaAutomatic", () => ({
  synchronizeAutomaticMiniImagesPolicy: automaticMocks.synchronize,
}));

import AutomaticMiniImagesControl from "./AutomaticMiniImagesControl";

describe("AutomaticMiniImagesControl", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    automaticMocks.synchronize.mockReset();
    automaticMocks.synchronize.mockResolvedValue(undefined);
  });

  it("defaults to ON and synchronizes the startup policy", async () => {
    render(<LanguageProvider><AutomaticMiniImagesControl /></LanguageProvider>);
    const control = await screen.findByRole("switch", { name: "Automatic Mini Images" });
    await waitFor(() => expect(automaticMocks.synchronize).toHaveBeenCalledWith(true));
    expect(control).toHaveAttribute("aria-checked", "true");
  });

  it("persists and synchronizes an explicit OFF selection", async () => {
    render(<LanguageProvider><AutomaticMiniImagesControl /></LanguageProvider>);
    const control = await screen.findByRole("switch", { name: "Automatic Mini Images" });
    await waitFor(() => expect(control).not.toBeDisabled());
    fireEvent.click(control);
    await waitFor(() => expect(automaticMocks.synchronize).toHaveBeenLastCalledWith(false));
    expect(window.localStorage.getItem(AUTOMATIC_MINI_IMAGES_STORAGE_KEY)).toBe("false");
    expect(control).toHaveAttribute("aria-checked", "false");
  });
});
