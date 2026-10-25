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

jest.mock("@/lib/audit", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/app/api/snippets/ownership.middleware", () => {
  const mockOwnershipFns = { verifyOwnership: jest.fn() };
  const OwnershipMiddleware = class {
    static extractWalletAddress = jest.fn();
    verifyOwnership = mockOwnershipFns.verifyOwnership;
  };
  (OwnershipMiddleware as any).__testVerifyOwnership = mockOwnershipFns.verifyOwnership;
  return { OwnershipMiddleware };
});

import { NextRequest } from "next/server";
import { POST, GET } from "./route";
import { DELETE } from "./[id]/route";
import { OwnershipMiddleware } from "@/app/api/snippets/ownership.middleware";
import { shareLinkManagementService } from "@/lib/share-link-management.service";

const WALLET = "GBTESTWALLET1234567890123456789012345678901234567890123456";
const SNIPPET_ID = "550e8400-e29b-41d4-a716-446655440000";

const verifyOwnershipMock = (OwnershipMiddleware as any).__testVerifyOwnership as jest.Mock;

function makePostRequest(body: unknown, wallet: string | null = WALLET): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  const init: any = { method: "POST", headers, body: JSON.stringify(body) };
  return new (NextRequest as any)("http://localhost:3000/api/share-links", init);
}

function makeGetRequest(snippetId?: string): NextRequest {
  const url = snippetId
    ? `http://localhost:3000/api/share-links?snippetId=${encodeURIComponent(snippetId)}`
    : "http://localhost:3000/api/share-links";
  return new (NextRequest as any)(url, { method: "GET" });
}

function makeDeleteRequest(id: string, wallet: string | null = WALLET): NextRequest {
  const headers = new Headers();
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  return new (NextRequest as any)(`http://localhost:3000/api/share-links/${id}`, {
    method: "DELETE",
    headers,
  });
}

describe("Share Links API (/api/share-links)", () => {
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
  });

  describe("POST /api/share-links", () => {
    it("returns 400 when snippetId is missing", async () => {
      const req = makePostRequest({});
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("snippetId is required");
    });

    it("returns 400 when invalid visibility is provided", async () => {
      const req = makePostRequest({ snippetId: SNIPPET_ID, visibility: "invalid-vis" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("visibility must be 'read-only' or 'read-write'");
    });

    it("returns 403 Forbidden when caller does not own the snippet", async () => {
      verifyOwnershipMock.mockResolvedValue({
        isOwner: false,
        error: {
          status: 403,
          json: async () => ({ message: "You are not the owner of this snippet." }),
        },
      });

      const req = makePostRequest({ snippetId: SNIPPET_ID, visibility: "read-only" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain("You are not the owner of this snippet");
    });

    it("creates a secure share link with read-only visibility", async () => {
      const req = makePostRequest({
        snippetId: SNIPPET_ID,
        visibility: "read-only",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.snippetId).toBe(SNIPPET_ID);
      expect(data.data.visibility).toBe("read-only");
      expect(data.data.token).toMatch(/^[a-f0-9]{64}$/);
      expect(data.data.shareUrl).toContain(data.data.token);
      expect(data.data.status).toBe("active");
    });

    it("accepts 'public' and normalizes it to 'read-write'", async () => {
      const req = makePostRequest({
        snippetId: SNIPPET_ID,
        visibility: "public",
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.visibility).toBe("read-write");
    });
  });

  describe("GET /api/share-links", () => {
    it("returns 400 when snippetId query parameter is omitted", async () => {
      const req = makeGetRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("snippetId query parameter is required");
    });

    it("lists active share links for a snippet", async () => {
      // Create a link first
      const createReq = makePostRequest({
        snippetId: "query-snippet-test",
        visibility: "read-only",
      });
      await POST(createReq);

      const getReq = makeGetRequest("query-snippet-test");
      const res = await GET(getReq);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      expect(data.data[0].snippetId).toBe("query-snippet-test");
    });

    it("returns 403 when a non-owner lists links for an owned snippet", async () => {
      verifyOwnershipMock.mockResolvedValue({
        isOwner: false,
        error: { status: 403, json: async () => ({ message: "Not the owner" }) },
      });
      const res = await GET(makeGetRequest(SNIPPET_ID));
      expect(res.status).toBe(403);
    });

    it("returns 500 when ownership verification fails", async () => {
      verifyOwnershipMock.mockResolvedValue({
        isOwner: false,
        error: { status: 500, json: async () => ({ message: "Verification failed" }) },
      });
      const res = await POST(makePostRequest({ snippetId: SNIPPET_ID }));
      expect(res.status).toBe(500);
      expect(shareLinkManagementService.listActiveShareLinks(SNIPPET_ID)).resolves.toHaveLength(0);
    });
  });

  describe("DELETE /api/share-links/:id", () => {
    it("revokes an active share link successfully", async () => {
      // Create a link
      const createRes = await POST(
        makePostRequest({ snippetId: "revoke-test-snip", visibility: "read-only" })
      );
      const created = await createRes.json();
      const linkId = created.data.id;

      // Revoke the link
      const deleteReq = makeDeleteRequest(linkId);
      const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id: linkId }) });
      const deleteData = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toBe("Share link revoked successfully");
      expect(deleteData.data.status).toBe("revoked");

      // Verify it is no longer listed as active
      const getReq = makeGetRequest("revoke-test-snip");
      const getRes = await GET(getReq);
      const getData = await getRes.json();
      expect(getData.data.find((l: any) => l.id === linkId)).toBeUndefined();
    });

    it("returns 404 when revoking non-existent link", async () => {
      const deleteReq = makeDeleteRequest("non-existent-id");
      const deleteRes = await DELETE(deleteReq, {
        params: Promise.resolve({ id: "non-existent-id" }),
      });
      const deleteData = await deleteRes.json();

      expect(deleteRes.status).toBe(404);
      expect(deleteData.success).toBe(false);
      expect(deleteData.error).toContain("Share link not found");
    });

    it("returns 403 when a non-owner attempts to revoke a link", async () => {
      const createRes = await POST(
        makePostRequest({ snippetId: "revoke-owner-test", visibility: "read-only" })
      );
      const { data: { id } } = await createRes.json();
      verifyOwnershipMock.mockResolvedValue({
        isOwner: false,
        error: { status: 403, json: async () => ({ message: "Not the owner" }) },
      });
      const res = await DELETE(makeDeleteRequest(id), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(403);
    });
  });
});
