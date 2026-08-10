import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../lib/LanguageContext";
import { collectionConfigs } from "../lib/collectionData";
import { detailConfigs, type PerformerDetailConfig } from "../lib/detailData";
import { SAFE_FILTER_STORAGE_KEY } from "../lib/safeFilterState";
import CollectionPage from "./CollectionPage";
import DetailPage from "./DetailPage";

function renderPage(page: ReactNode) {
  return render(
    <MemoryRouter>
      <LanguageProvider>{page}</LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Safe Filter user-facing surfaces", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "true");
  });

  it("removes Censorship collection filter, sort, card, and table surfaces", () => {
    renderPage(<CollectionPage config={collectionConfigs.videos} />);

    fireEvent.click(screen.getByTestId("videos-toolbar-filter-button"));
    expect(screen.queryByText("Censorship")).not.toBeInTheDocument();
    expect(screen.queryByText("Censored")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to list view" }));
    expect(screen.queryByRole("columnheader", { name: "CENSORSHIP" })).not.toBeInTheDocument();
  });

  it("hides only Measurements and Cup Size from Performer detail", () => {
    const config = {
      ...(detailConfigs.performers as PerformerDetailConfig),
      physical: [
        { label: "Height", value: "165 cm" },
        { label: "Weight", value: "52 kg" },
        { label: "Measurement", value: "90 / 60 / 90" },
        { label: "Cup Size", value: "C" },
      ],
      personal: [{ label: "Gender", value: "Woman" }],
    };
    renderPage(<DetailPage config={config} />);

    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(screen.getByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.queryByText("Measurement")).not.toBeInTheDocument();
    expect(screen.queryByText("Cup Size")).not.toBeInTheDocument();
  });

  it("restores complete sensitive surfaces when Safe Filter is OFF", () => {
    window.localStorage.setItem(SAFE_FILTER_STORAGE_KEY, "false");
    const config = {
      ...(detailConfigs.performers as PerformerDetailConfig),
      physical: [
        { label: "Measurement", value: "90 / 60 / 90" },
        { label: "Cup Size", value: "C" },
      ],
    };
    renderPage(<DetailPage config={config} />);

    expect(screen.getByText("Measurement")).toBeInTheDocument();
    expect(screen.getByText("Cup Size")).toBeInTheDocument();
  });
});
