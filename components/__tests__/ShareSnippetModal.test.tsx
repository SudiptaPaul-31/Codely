/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { toast } from "sonner";
import { ShareSnippetModal } from "../ShareSnippetModal";

const wallet = {
  publicKey: "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU",
  token: "test-token",
};

jest.mock("../WalletConnect", () => ({
  useWallet: () => wallet,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const existingLink = {
  id: "link-1",
  snippetId: "snippet-1",
  shareUrl: "https://codely.example/api/share-links/secret-token/validate",
  visibility: "read-only" as const,
  createdAt: "2026-09-29T00:00:00.000Z",
  status: "active" as const,
};

function response(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => data,
  });
}

describe("ShareSnippetModal", () => {
  const clipboardWrite = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    wallet.publicKey = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
  });

  it("loads active links and copies one with visible feedback", async () => {
    global.fetch = jest.fn(() => response({ success: true, data: [existingLink] })) as jest.Mock;

    render(
      <ShareSnippetModal
        snippetId="snippet-1"
        snippetTitle="Example"
        isOpen
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByDisplayValue(existingLink.shareUrl)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith(existingLink.shareUrl);
      expect(screen.getByRole("status")).toHaveTextContent("Link copied!");
      expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("generates a public collaboration link through the backend API", async () => {
    const createdLink = { ...existingLink, id: "link-2", visibility: "read-write" as const };
    global.fetch = jest.fn()
      .mockImplementationOnce(() => response({ success: true, data: [] }))
      .mockImplementationOnce(() => response({ success: true, data: createdLink })) as jest.Mock;

    render(
      <ShareSnippetModal
        snippetId="snippet-1"
        isOpen
        onClose={jest.fn()}
      />,
    );

    await screen.findByText("No active links yet.");
    fireEvent.click(screen.getByRole("radio", { name: /Public collaboration/i }));
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/share-links",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-wallet-address": wallet.publicKey,
            Authorization: "Bearer test-token",
          }),
          body: JSON.stringify({ snippetId: "snippet-1", visibility: "read-write" }),
        }),
      );
      expect(screen.getByRole("status")).toHaveTextContent("Share link created.");
      expect(screen.getAllByText("Public collaboration")).toHaveLength(2);
    });
  });

  it("revokes an active link and removes it from the list", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => response({ success: true, data: [existingLink] }))
      .mockImplementationOnce(() => response({
        success: true,
        data: { ...existingLink, status: "revoked" },
      })) as jest.Mock;

    render(
      <ShareSnippetModal
        snippetId="snippet-1"
        isOpen
        onClose={jest.fn()}
      />,
    );

    await screen.findByDisplayValue(existingLink.shareUrl);
    fireEvent.click(screen.getByRole("button", { name: "Revoke share link" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/share-links/link-1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByDisplayValue(existingLink.shareUrl)).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Share link revoked.");
    });
  });

  it("prevents link creation when no owner wallet is connected", async () => {
    wallet.publicKey = "";
    global.fetch = jest.fn() as jest.Mock;

    render(
      <ShareSnippetModal
        snippetId="snippet-1"
        isOpen
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connect the owner wallet to manage share links.",
    );
    expect(screen.getByRole("button", { name: "Generate link" })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
