/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SnippetShareModal } from "../SnippetShareModal";
import { toast } from "sonner";

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

describe("SnippetShareModal Component", () => {
  const snippetId = "test-snippet-uuid-123";
  const snippetTitle = "Horizon Payments Stream";

  const mockActiveLinks = [
    {
      id: "link-id-1",
      snippetId,
      token: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      shareUrl: "http://localhost:3000/api/share-links/a1b2c3d4e5f6/validate",
      visibility: "read-only",
      expiresAt: null,
      createdAt: new Date().toISOString(),
      status: "active",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Default fetch mock returning existing links
    global.fetch = jest.fn().mockImplementation((url: string, init?: any) => {
      if (url.includes("/api/share-links") && (!init || init.method === "GET" || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: mockActiveLinks,
            count: mockActiveLinks.length,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      });
    });

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  it("does not render dialog content when isOpen is false", () => {
    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={false}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByTestId("snippet-share-modal")).not.toBeInTheDocument();
  });

  it("renders modal with snippet title and loads active links on open", async () => {
    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText("Share Snippet")).toBeInTheDocument();
    expect(
      screen.getByText(`Create and manage shareable links for "${snippetTitle}"`)
    ).toBeInTheDocument();

    // Verify existing link is displayed
    await waitFor(() => {
      expect(screen.getByTestId("active-share-link-link-id-1")).toBeInTheDocument();
    });
    expect(screen.getByText("Read-Only")).toBeInTheDocument();
  });

  it("generates a new share link with default read-only visibility", async () => {
    const newGeneratedLink = {
      id: "link-id-2",
      snippetId,
      token: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      shareUrl: "http://localhost:3000/api/share-links/fedcba987654/validate",
      visibility: "read-only",
      expiresAt: null,
      createdAt: new Date().toISOString(),
      status: "active",
    };

    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: newGeneratedLink,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    const generateBtn = screen.getByTestId("generate-share-link-button");
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByTestId("newly-generated-link-box")).toBeInTheDocument();
    });

    expect(toast.success).toHaveBeenCalledWith("Share link created successfully!");
    expect(screen.getByText("Share Link Ready")).toBeInTheDocument();
  });

  it("allows selecting public visibility and submits with read-write", async () => {
    let requestPayload: any = null;

    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (init?.method === "POST") {
        requestPayload = JSON.parse(init.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              id: "link-id-public",
              snippetId,
              token: "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
              shareUrl: "http://localhost:3000/api/share-links/111122223333/validate",
              visibility: "read-write",
              expiresAt: null,
              createdAt: new Date().toISOString(),
              status: "active",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    // Select public
    const publicBtn = screen.getByTestId("visibility-public");
    fireEvent.click(publicBtn);

    const generateBtn = screen.getByTestId("generate-share-link-button");
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(requestPayload).toEqual({
        snippetId,
        visibility: "read-write",
      });
    });
  });

  it("copies link to clipboard and displays inline and toast feedback", async () => {
    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("copy-link-btn-link-id-1")).toBeInTheDocument();
    });

    const copyBtn = screen.getByTestId("copy-link-btn-link-id-1");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockActiveLinks[0].shareUrl
      );
    });

    expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard!");
    expect(screen.getByText("Link copied!")).toBeInTheDocument();
  });

  it("does not report success when the clipboard fallback fails", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    jest.spyOn(document, "execCommand").mockReturnValue(false);

    render(
      <SnippetShareModal snippetId={snippetId} isOpen={true} onClose={jest.fn()} />
    );
    await waitFor(() => expect(screen.getByTestId("copy-link-btn-link-id-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("copy-link-btn-link-id-1"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to copy link to clipboard");
    });
    expect(toast.success).not.toHaveBeenCalledWith("Link copied to clipboard!");
    expect(screen.queryByText("Link copied!")).not.toBeInTheDocument();
  });

  it("revokes an active share link and removes it from list", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (init?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            message: "Share link revoked successfully",
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: [...mockActiveLinks],
        }),
      });
    });

    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("revoke-link-btn-link-id-1")).toBeInTheDocument();
    });

    const revokeBtn = screen.getByTestId("revoke-link-btn-link-id-1");
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/share-links/link-id-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId("active-share-link-link-id-1")).not.toBeInTheDocument();
    });

    expect(toast.success).toHaveBeenCalledWith("Share link revoked successfully");
  });

  it("displays error feedback when generation fails with 403 Forbidden", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            error: "Forbidden: you do not have permission to share this snippet",
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(
      <SnippetShareModal
        snippetId={snippetId}
        snippetTitle={snippetTitle}
        isOpen={true}
        onClose={jest.fn()}
      />
    );

    const generateBtn = screen.getByTestId("generate-share-link-button");
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Forbidden: you do not have permission to share this snippet")
      ).toBeInTheDocument();
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Forbidden: you do not have permission to share this snippet"
    );
  });
});
