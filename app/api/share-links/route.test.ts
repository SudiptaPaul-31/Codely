jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    public url: string;
    private body: string | null;

    constructor(input: string, init?: RequestInit) {
      this.url = input;
      this.headers = new Headers(init?.headers);
      this.body = (init?.body as string | null) ?? null;
    }

    async json() {
      return this.body ? JSON.parse(this.body) : {};
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
    createShareLink: jest.fn(),
    listActiveShareLinks: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { OwnershipMiddleware } from "@/app/api/snippets/ownership.middleware";
import { shareLinkManagementService } from "@/lib/share-link-management.service";
import { GET, POST } from "./route";

const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";
const service = shareLinkManagementService as jest.Mocked<typeof shareLinkManagementService>;
const verifyOwnership = (OwnershipMiddleware as any).__verifyOwnership as jest.Mock;

function makeRequest(method: string, body?: unknown): NextRequest {
  return new (NextRequest as any)(
    `http://localhost:3000/api/share-links${method === "GET" ? "?snippetId=snippet-1" : ""}`,
    {
      method,
      headers: { "Content-Type": "application/json", "x-wallet-address": WALLET },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
  verifyOwnership.mockResolvedValue({ isOwner: true });
});

describe("share-link collection routes", () => {
  it("rejects link creation without an authenticated wallet", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);

    const result = await POST(makeRequest("POST", { snippetId: "snippet-1" }));

    expect(result.status).toBe(401);
    expect(service.createShareLink).not.toHaveBeenCalled();
  });

  it("rejects link creation by a non-owner", async () => {
    verifyOwnership.mockResolvedValue({ isOwner: false });

    const result = await POST(makeRequest("POST", { snippetId: "snippet-1" }));

    expect(result.status).toBe(403);
    expect(service.createShareLink).not.toHaveBeenCalled();
  });

  it("creates a link after verifying snippet ownership", async () => {
    const link = { id: "link-1", snippetId: "snippet-1", visibility: "read-only" };
    service.createShareLink.mockResolvedValue(link as any);

    const result = await POST(makeRequest("POST", {
      snippetId: "snippet-1",
      visibility: "read-only",
    }));

    expect(result.status).toBe(201);
    expect(verifyOwnership).toHaveBeenCalledWith("snippet-1", WALLET);
    expect(service.createShareLink).toHaveBeenCalledWith({
      snippetId: "snippet-1",
      visibility: "read-only",
      expiresAt: null,
      createdBy: WALLET,
    });
  });

  it("only lists active links for the snippet owner", async () => {
    service.listActiveShareLinks.mockResolvedValue([]);

    const result = await GET(makeRequest("GET"));
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body).toEqual({ success: true, data: [], count: 0 });
    expect(verifyOwnership).toHaveBeenCalledWith("snippet-1", WALLET);
  });
});
