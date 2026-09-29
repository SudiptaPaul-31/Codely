jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    constructor(_input: string, init?: RequestInit) {
      this.headers = new Headers(init?.headers);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/app/api/snippets/ownership.middleware", () => {
  const mocks = { verifyOwnership: jest.fn() };
  const OwnershipMiddleware = class {
    static extractWalletAddress = jest.fn();
    verifyOwnership = mocks.verifyOwnership;
  };
  (OwnershipMiddleware as any).__verifyOwnership = mocks.verifyOwnership;
  return { OwnershipMiddleware };
});

jest.mock("@/lib/share-link-management.service", () => ({
  shareLinkManagementService: {
    getShareLinkById: jest.fn(),
    revokeShareLink: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { OwnershipMiddleware } from "@/app/api/snippets/ownership.middleware";
import { shareLinkManagementService } from "@/lib/share-link-management.service";
import { DELETE } from "./route";

const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";
const service = shareLinkManagementService as jest.Mocked<typeof shareLinkManagementService>;
const verifyOwnership = (OwnershipMiddleware as any).__verifyOwnership as jest.Mock;

function makeRequest(): NextRequest {
  return new (NextRequest as any)("http://localhost:3000/api/share-links/link-1", {
    method: "DELETE",
    headers: { "x-wallet-address": WALLET },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
  verifyOwnership.mockResolvedValue({ isOwner: true });
  service.getShareLinkById.mockResolvedValue({ id: "link-1", snippetId: "snippet-1" } as any);
});

describe("DELETE /api/share-links/[id]", () => {
  it("rejects revocation without an authenticated wallet", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);

    const result = await DELETE(makeRequest(), { params: Promise.resolve({ id: "link-1" }) });

    expect(result.status).toBe(401);
    expect(service.revokeShareLink).not.toHaveBeenCalled();
  });

  it("rejects revocation by a non-owner", async () => {
    verifyOwnership.mockResolvedValue({ isOwner: false });

    const result = await DELETE(makeRequest(), { params: Promise.resolve({ id: "link-1" }) });

    expect(result.status).toBe(403);
    expect(service.revokeShareLink).not.toHaveBeenCalled();
  });

  it("revokes a link after verifying ownership of its snippet", async () => {
    service.revokeShareLink.mockResolvedValue({ id: "link-1", status: "revoked" } as any);

    const result = await DELETE(makeRequest(), { params: Promise.resolve({ id: "link-1" }) });

    expect(result.status).toBe(200);
    expect(verifyOwnership).toHaveBeenCalledWith("snippet-1", WALLET);
    expect(service.revokeShareLink).toHaveBeenCalledWith("link-1", WALLET);
  });
});
