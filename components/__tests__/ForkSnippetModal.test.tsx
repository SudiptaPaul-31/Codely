/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ForkSnippetModal } from "../ForkSnippetModal";

// Mock Wallet hook
jest.mock("../WalletConnect", () => ({
  useWallet: () => ({
    publicKey: "GBTESTWALLET1234567890",
  }),
}));

// Mock Sonner toast
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ForkSnippetModal Component", () => {
  const mockSnippet = {
    id: "test-snippet-id-1",
    title: "Awesome Horizon Script",
    description: "Connects to Stellar Horizon",
    code: "console.log('Stellar');",
    language: "javascript",
    tags: ["stellar", "horizon"],
  };

  it("does not render when snippet is null or isOpen is false", () => {
    const { container } = render(
      <ForkSnippetModal snippet={null} isOpen={false} onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("pre-populates form with derived title and original snippet metadata", () => {
    render(
      <ForkSnippetModal snippet={mockSnippet} isOpen={true} onClose={jest.fn()} />
    );

    expect(screen.getByRole("heading", { name: "Fork Snippet" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fork of Awesome Horizon Script")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Connects to Stellar Horizon")).toBeInTheDocument();
    expect(screen.getByDisplayValue("console.log('Stellar');")).toBeInTheDocument();
    expect(screen.getByDisplayValue("stellar, horizon")).toBeInTheDocument();
  });

  it("submits fork request with modified values on form submit", async () => {
    const mockOnSuccess = jest.fn();
    const mockOnClose = jest.fn();

    // Mock fetch for fork endpoint
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "forked-id-100",
        title: "My Custom Fork",
        forked_from_id: mockSnippet.id,
      }),
    });

    render(
      <ForkSnippetModal
        snippet={mockSnippet}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    const titleInput = screen.getByDisplayValue("Fork of Awesome Horizon Script");
    fireEvent.change(titleInput, { target: { value: "My Custom Fork" } });

    const submitBtn = screen.getByRole("button", { name: /Fork Snippet/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/snippets/${mockSnippet.id}/fork`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-wallet-address": "GBTESTWALLET1234567890",
          }),
          body: expect.stringContaining("My Custom Fork"),
        })
      );
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
