/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SnippetDetailModal } from "../SnippetDetailModal";

const wallet = {
  publicKey: "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU",
};

jest.mock("../WalletConnect", () => ({
  useWallet: () => wallet,
}));

jest.mock("../ShareSnippetModal", () => ({
  ShareSnippetModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Share modal opened</div> : null,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("SnippetDetailModal sharing", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "snippet-1",
        title: "Shareable snippet",
        description: "Example",
        code: "const answer = 42;",
        language: "typescript",
        owner_wallet_address: wallet.publicKey,
      }),
    });
  });

  it("opens the sharing modal from the snippet detail Share button", async () => {
    render(
      <SnippetDetailModal
        snippetId="snippet-1"
        isOpen
        onClose={jest.fn()}
      />,
    );

    const shareButton = await screen.findByRole("button", { name: "Share" });
    expect(shareButton).toBeEnabled();
    fireEvent.click(shareButton);

    expect(screen.getByText("Share modal opened")).toBeInTheDocument();
  });

  it("disables sharing for a wallet that does not own the snippet", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "snippet-1",
        title: "Someone else's snippet",
        code: "return true;",
        language: "typescript",
        owner_wallet_address: "GOTHERWALLETXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      }),
    });

    render(
      <SnippetDetailModal
        snippetId="snippet-1"
        isOpen
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "Share" })).toBeDisabled();
  });
});
