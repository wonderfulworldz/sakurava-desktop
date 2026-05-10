import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the Sakurava placeholder", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Sakurava" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/project skeleton is ready/i)).toBeInTheDocument();
  });
});
