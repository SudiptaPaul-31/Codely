/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DerivationBadge } from "../DerivationBadge";

describe("DerivationBadge Component", () => {
  it("renders nothing if forkedFromId is not provided", () => {
    const { container } = render(<DerivationBadge forkedFromId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders derived label with origin title when available", () => {
    render(
      <DerivationBadge
        forkedFromId="12345678-abcd-1234-abcd-123456789abc"
        originTitle="Base React Component"
      />
    );
    expect(screen.getByText("Derived from Base React Component")).toBeInTheDocument();
  });

  it("renders truncated snippet ID when origin title is not provided", () => {
    render(
      <DerivationBadge
        forkedFromId="12345678-abcd-1234-abcd-123456789abc"
      />
    );
    expect(screen.getByText("Derived from #12345678")).toBeInTheDocument();
  });

  it("handles onClick when provided", () => {
    const handleClick = jest.fn();
    render(
      <DerivationBadge
        forkedFromId="12345678-abcd-1234-abcd-123456789abc"
        onClick={handleClick}
      />
    );
    const badge = screen.getByRole("button");
    fireEvent.click(badge);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
