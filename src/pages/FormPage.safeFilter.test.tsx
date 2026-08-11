import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../lib/LanguageContext";
import { formConfigs } from "../lib/formData";
import { SAFE_FILTER_STORAGE_KEY } from "../lib/safeFilterState";
import FormPage from "./FormPage";

describe("Form Safe Filter visibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "true");
  });

  it("hides sensitive and Glossary-reference controls while preserving their save payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ state: "saved", message: "Saved." });
    const config = {
      ...formConfigs.videos,
      initialValues: {
        ...formConfigs.videos.initialValues,
        edit: {
          ...formConfigs.videos.initialValues.edit,
          censorship: "Leaked",
          rPlus: true,
        },
      },
      initialGlossaryRefs: {
        create: [...(formConfigs.videos.initialGlossaryRefs?.create ?? [])],
        edit: ["legacy-glossary-reference"],
      },
    };

    render(
      <MemoryRouter>
        <LanguageProvider>
          <FormPage config={config} mode="edit" onSubmit={onSubmit} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText("Censorship")).not.toBeInTheDocument();
    expect(screen.queryByText("Glossary references")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Mark this record as R+" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({
      values: expect.objectContaining({ censorship: "Leaked", rPlus: true }),
      glossaryRefs: ["legacy-glossary-reference"],
    }));
  });

  it("restores the Censorship input and direct R+ switch when Safe Filter is explicitly OFF", () => {
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "false");
    render(
      <MemoryRouter>
        <LanguageProvider>
          <FormPage config={formConfigs.videos} mode="edit" />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Censorship")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mark this record as R+" })).toBeInTheDocument();
    expect(screen.queryByText("Glossary references")).not.toBeInTheDocument();
  });
});
