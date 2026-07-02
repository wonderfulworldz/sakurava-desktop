import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import MemorySuggestionInput from "./MemorySuggestionInput";

describe("MemorySuggestionInput lifecycle", () => {
  it("removes history and keeps it absent after reopening", () => {
    function Harness() {
      const [suggestions, setSuggestions] = useState(["Main"]);
      return (
        <MemorySuggestionInput
          value=""
          suggestions={suggestions}
          ariaLabel="Credit Type"
          className="input"
          onChange={() => undefined}
          onRemoveSuggestion={(removed) =>
            setSuggestions((current) =>
              current.filter((item) => item !== removed),
            )
          }
        />
      );
    }

    render(<Harness />);
    const input = screen.getByLabelText("Credit Type");
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("button", {
      name: "Remove Credit Type suggestion Main",
    }));
    fireEvent.blur(input);
    fireEvent.focus(input);
    expect(screen.queryByText("Main")).not.toBeInTheDocument();
  });

  it("closes on scroll, Escape, and outside pointer interaction", () => {
    const { unmount } = render(
      <>
        <MemorySuggestionInput
          value=""
          suggestions={["Main"]}
          ariaLabel="Credit Type"
          className="input"
          onChange={() => undefined}
        />
        <button type="button">Outside</button>
      </>,
    );
    const input = screen.getByLabelText("Credit Type");

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    unmount();
    expect(document.querySelector("[data-memory-popup]")).toBeNull();
  });
});
