import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Performer } from "../backend/types";
import { emptyCreditFormValue, type CreditFormValue } from "../lib/workCredits";
import CompactRelatedPerformersEditor from "./CompactRelatedPerformersEditor";

const performers = [
  { id: "aether", name: "Aether", originalName: "" },
  { id: "alexandrina", name: "Alexandrina", originalName: "" },
  { id: "alhaitham", name: "Alhaitham", originalName: "" },
] as Performer[];

describe("CompactRelatedPerformersEditor group order", () => {
  it("shows one order per performer and moves every role in that group", () => {
    let current = [
      emptyCreditFormValue("aether"),
      { ...emptyCreditFormValue("aether"), characterName: "Second Aether role" },
      emptyCreditFormValue("alexandrina"),
      { ...emptyCreditFormValue("alexandrina"), characterName: "Second Alexandrina role" },
      emptyCreditFormValue("alhaitham"),
    ];
    const onChange = (next: CreditFormValue[]) => {
      current = next;
      view.rerender(editor(next, onChange));
    };
    const view = render(editor(current, onChange));

    expect(orderValues()).toEqual([1, 1, 2, 2, 3]);
    fireEvent.change(screen.getByLabelText("Related performer 3 order"), {
      target: { value: "1" },
    });
    fireEvent.blur(screen.getByLabelText("Related performer 3 order"));

    expect(current.map((credit) => credit.performerId)).toEqual([
      "alexandrina",
      "alexandrina",
      "aether",
      "aether",
      "alhaitham",
    ]);
    expect(orderValues()).toEqual([1, 1, 2, 2, 3]);
    expect(current[1]?.characterName).toBe("Second Alexandrina role");
  });
});

function editor(
  credits: CreditFormValue[],
  onChange: (credits: CreditFormValue[]) => void,
) {
  return (
    <MemoryRouter>
      <CompactRelatedPerformersEditor
        credits={credits}
        performers={performers}
        loadState="loaded"
        onChange={onChange}
        creditTypeHistory={[]}
        onRemoveCreditTypeHistory={() => undefined}
      />
    </MemoryRouter>
  );
}

function orderValues() {
  return screen
    .getAllByLabelText(/Related performer \d+ order/)
    .map((input) => Number((input as HTMLInputElement).value));
}
