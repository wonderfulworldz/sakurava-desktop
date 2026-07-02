import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RelatedPerformerReference } from "../backend/json";
import type { Performer } from "../backend/types";
import RelatedPerformerPicker from "./RelatedPerformerPicker";

const performer = {
  id: "performer-1",
  name: "Aoi Sakura",
  originalName: "",
  aliasesJson: "[]",
  nationality: "",
  debutDate: "",
  retiredDate: "",
  status: "Unknown",
  ratingJson: "{}",
} as Performer;

describe("RelatedPerformerPicker duplicate limit", () => {
  it("closes after selection and hides a performer after five occurrences", () => {
    function Harness() {
      const [selected, setSelected] = useState<RelatedPerformerReference[]>([]);
      return (
        <MemoryRouter>
          <span data-testid="selected-count">{selected.length}</span>
          <RelatedPerformerPicker
            performers={[performer]}
            selected={selected}
            loadState="loaded"
            onChange={setSelected}
            showSelectedSummary={false}
            maxOccurrencesPerPerformer={5}
          />
        </MemoryRouter>
      );
    }

    render(<Harness />);
    const search = screen.getByLabelText("Search related performers");
    for (let index = 0; index < 5; index += 1) {
      fireEvent.focus(search);
      fireEvent.click(screen.getByRole("button", {
        name: "Add related performer Aoi Sakura",
      }));
      expect(screen.queryByRole("button", {
        name: "Add related performer Aoi Sakura",
      })).not.toBeInTheDocument();
      if (index < 4) {
        fireEvent.focus(search);
        expect(screen.getByRole("button", {
          name: "Add related performer Aoi Sakura",
        })).toBeInTheDocument();
      }
    }
    expect(screen.getByTestId("selected-count")).toHaveTextContent("5");
    fireEvent.focus(search);
    expect(screen.queryByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).not.toBeInTheDocument();
  });

  it("does not remove existing loaded occurrences above the limit", () => {
    const selected = Array.from({ length: 6 }, () => ({
      performerId: performer.id,
      nameSnapshot: performer.name,
    }));

    render(
      <MemoryRouter>
        <RelatedPerformerPicker
          performers={[performer]}
          selected={selected}
          loadState="loaded"
          onChange={() => {
            throw new Error("existing rows must not be changed");
          }}
          showSelectedSummary={false}
          maxOccurrencesPerPerformer={5}
        />
      </MemoryRouter>,
    );

    fireEvent.focus(screen.getByLabelText("Search related performers"));
    expect(screen.queryByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).not.toBeInTheDocument();
  });

  it("closes results on scroll and outside pointer interaction", () => {
    render(
      <MemoryRouter>
        <RelatedPerformerPicker
          performers={[performer]}
          selected={[]}
          loadState="loaded"
          onChange={() => undefined}
        />
        <button type="button">Outside</button>
      </MemoryRouter>,
    );

    const search = screen.getByLabelText("Search related performers");
    fireEvent.focus(search);
    expect(screen.getByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).toBeInTheDocument();

    fireEvent.scroll(window);
    expect(screen.queryByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).not.toBeInTheDocument();

    fireEvent.focus(search);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("button", {
      name: "Add related performer Aoi Sakura",
    })).not.toBeInTheDocument();
  });
});
