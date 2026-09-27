jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    public url: string;
    private rawBody: string | null;

    constructor(input: string | URL, init?: RequestInit & { headers: Headers }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this.rawBody = (init?.body as string | null) ?? null;
    }

    async json() {
      return JSON.parse(this.rawBody as string);
    }
  },
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Headers({ "content-type": "application/json" }),
    }),
  },
}));

jest.mock("../../share.service", () => ({
  ShareService: jest.fn().mockImplementation(() => ({
    createShareLink: jest.fn(),
    revokeShare: jest.fn(),
  })),
}));

jest.mock("../../share.repository", () => ({
  ShareRepository: jest.fn(),
}));

jest.mock("../../snippet.repository", () => ({
  SnippetRepository: jest.fn(),
}));

jest.mock("../../ownership.middleware", () => {
  const mockOwnershipFns = { verifyOwnership: jest.fn() };
  const OwnershipMiddleware = class {
    static extractWalletAddress = jest.fn();
    verifyOwnership = mockOwnershipFns.verifyOwnership;
  };
  (OwnershipMiddleware as any).__testVerifyOwnership = mockOwnershipFns.verifyOwnership;
  return { OwnershipMiddleware };
});

import { NextRequest } from "next/server";
import { POST } from "./route";
import { ShareService } from "../../share.service";
import { OwnershipMiddleware } from "../../ownership.middleware";

const SNIPPET_ID = "550e8400-e29b-41d4-a716-446655440000";
const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

// Captured after route module load.
const shareServiceInstance = (ShareService as unknown as jest.Mock).mock
  .results[0].value as { createShareLink: jest.Mock };
const verifyOwnershipMock = (OwnershipMiddleware as any).__testVerifyOwnership as jest.Mock;

function makeRequest(body: unknown, wallet: string | null = WALLET): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  const init: any = { method: "POST", headers, body: JSON.stringify(body) };
  return new (NextRequest as any)(
    `http://localhost:3000/api/snippets/${SNIPPET_ID}/share`,
    init,
  );
}

const params = Promise.resolve({ id: SNIPPET_ID });

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware as any).extractWalletAddress.mockResolvedValue(WALLET);
  verifyOwnershipMock.mockResolvedValue({ isOwner: true });
  shareServiceInstance.createShareLink.mockResolvedValue({
    shareToken: "token-123",
    shareUrl: "http://localhost:3000/api/snippets/shared/token-123",
    isReadOnly: true,
    expiresAt: null,
  });
});

describe("POST /api/snippets/[id]/share", () => {
  it("returns 401 when no wallet address is provided", async () => {
    (OwnershipMiddleware as any).extractWalletAddress.mockResolvedValue(null);
    const res = await POST(makeRequest({}, null), { params });
    expect(res.status).toBe(401);
    expect(shareServiceInstance.createShareLink).not.toHaveBeenCalled();
  });

  it("returns 403 when the requester is not the owner", async () => {
    verifyOwnershipMock.mockResolvedValue({ isOwner: false });
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(403);
    expect(shareServiceInstance.createShareLink).not.toHaveBeenCalled();
  });

  it("creates a share link with valid data", async () => {
    const res = await POST(makeRequest({ isReadOnly: false }), { params });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.shareToken).toBe("token-123");
    expect(shareServiceInstance.createShareLink).toHaveBeenCalledWith({
      snippetId: SNIPPET_ID,
      isReadOnly: false,
      expiresAt: null,
      createdByWalletAddress: WALLET,
    });
  });

  it("returns 400 with the consistent error shape for a malformed expiresAt", async () => {
    const res = await POST(makeRequest({ expiresAt: "not-a-date" }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(typeof json.message).toBe("string");
    expect(Array.isArray(json.details)).toBe(true);
    expect(shareServiceInstance.createShareLink).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-boolean isReadOnly", async () => {
    const res = await POST(makeRequest({ isReadOnly: "yes" }), { params });
    expect(res.status).toBe(400);
    expect(shareServiceInstance.createShareLink).not.toHaveBeenCalled();
  });
});
