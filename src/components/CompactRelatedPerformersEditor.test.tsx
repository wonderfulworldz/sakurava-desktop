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

  it("keeps Credit Type as free text and separate from Category relationships", () => {
    let current = [{ ...emptyCreditFormValue("aether"), characterName: "Credit A" }];
    const onChange = (next: CreditFormValue[]) => {
      current = next;
      view.rerender(editor(next, onChange));
    };
    const view = render(editor(current, onChange));

    expect(screen.getByLabelText("Related performer 1 credit type")).toHaveValue("");
    expect(screen.getByLabelText("Related performer 1 credit type").tagName).toBe("INPUT");
    fireEvent.change(screen.getByLabelText("Related performer 1 credit type"), {
      target: { value: "Credit A" },
    });

    expect(current[0]).toMatchObject({
      characterName: "Credit A",
      creditTypeText: "Credit A",
      creditTypeCategoryId: "",
    });
  });

  it("keeps every persisted same-performer Credit as an independent editor row", () => {
    let current: CreditFormValue[] = ["A", "B", "A", "A", "B"].map((creditTypeText, index) => ({
      ...emptyCreditFormValue("aether", index + 1),
      id: `credit-${index + 3}`,
      editorRowId: `credit-${index + 3}`,
      sakuravaRef: `R2607000${index + 3}`,
      creditTypeText,
    }));
    const onChange = (next: CreditFormValue[]) => {
      current = next;
      view.rerender(editor(next, onChange));
    };
    const view = render(editor(current, onChange));

    expect(screen.getByText("5 selected")).toBeInTheDocument();
    expect(screen.getAllByTestId("credit-editor-row")).toHaveLength(5);
    expect(
      screen.getAllByLabelText(/Related performer \d+ credit type/),
    ).toHaveLength(5);

    fireEvent.change(screen.getByLabelText("Related performer 1 credit type"), {
      target: { value: "C" },
    });

    expect(current.map((credit) => credit.creditTypeText)).toEqual([
      "C",
      "B",
      "A",
      "A",
      "B",
    ]);
    expect(current.map((credit) => credit.id)).toEqual([
      "credit-3",
      "credit-4",
      "credit-5",
      "credit-6",
      "credit-7",
    ]);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove Aether" })[0]!);
    expect(current.map((credit) => credit.id)).toEqual([
      "credit-4",
      "credit-5",
      "credit-6",
      "credit-7",
    ]);
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
