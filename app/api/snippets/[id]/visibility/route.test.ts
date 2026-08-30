/**
 * Tests for /api/snippets/[id]/visibility — GET + PATCH.
 *
 * Covers the acceptance criteria:
 * - Private snippets protected: unauthorized requests rejected (403).
 * - Public snippets accessible.
 * - Shared snippets restricted: only authorized users or valid share links.
 * - Audit logs maintained: denied attempts are logged.
 */

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    private _body: any;
    public url: string;

    constructor(input: string | URL, init?: RequestInit & { headers?: Headers; body?: string }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this._body = init?.body ? JSON.parse(init.body as string) : null;
    }

    async json() {
      if (this._body === null) throw new Error("no body");
      return this._body;
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

jest.mock("../../snippet.repository", () => ({
  SnippetRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
  })),
}));

jest.mock("../../snippet.service", () => ({
  SnippetService: jest.fn().mockImplementation(() => ({
    getSharedUsers: jest.fn().mockResolvedValue([]),
    setVisibility: jest.fn(),
  })),
}));

jest.mock("../../ownership.middleware", () => ({
  OwnershipMiddleware: {
    extractWalletAddress: jest.fn(),
  },
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
  extractIp: jest.fn().mockReturnValue("127.0.0.1"),
  extractUserAgent: jest.fn().mockReturnValue("test-agent"),
}));

import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { appendActivityLog } from "@/lib/activity-logger";

const SNIPPET_ID = "550e8400-e29b-41d4-a716-446655440000";
const OWNER = "GBRRHRH76DXEKWF3SCDYH7G7M4G3E4DEBIY7WBHBMRGBENRGQWSDLV2V";
const OTHER = "GDTNW5S3JSV27YLRU5XXXHXWLKATYO5ZJABA7QUITDO2YMFU5UXXKQRH";

const repoInstance = (SnippetRepository as unknown as jest.Mock).mock.results[0]?.value;
const serviceInstance = (SnippetService as unknown as jest.Mock).mock.results[0]?.value;

function makeRequest(
  method: string,
  opts: { wallet?: string | null; body?: unknown } = {},
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (opts.wallet) headers.set("x-wallet-address", opts.wallet);
  const init: any = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new (NextRequest as any)(
    `http://localhost:3000/api/snippets/${SNIPPET_ID}/visibility`,
    init,
  );
}

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);
  (serviceInstance.getSharedUsers as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/snippets/[id]/visibility", () => {
  it("returns 404 when the snippet does not exist", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: SNIPPET_ID }) });

    expect(res.status).toBe(404);
  });

  it("returns visibility to anyone for a public snippet", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });

    const res = await GET(makeRequest("GET", { wallet: null }), {
      params: Promise.resolve({ id: SNIPPET_ID }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibility).toBe("public");
    expect(json.isOwner).toBe(false);
  });

  it("hides non-public visibility from non-owners (403)", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "private",
    });

    const res = await GET(makeRequest("GET", { wallet: OTHER }), {
      params: Promise.resolve({ id: SNIPPET_ID }),
    });

    expect(res.status).toBe(403);
  });

  it("returns shared users to the owner", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "shared",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);
    (serviceInstance.getSharedUsers as jest.Mock).mockResolvedValue([
      { user_wallet_address: OTHER },
    ]);

    const res = await GET(makeRequest("GET", { wallet: OWNER }), {
      params: Promise.resolve({ id: SNIPPET_ID }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibility).toBe("shared");
    expect(json.sharedWith).toEqual([OTHER]);
    expect(json.isOwner).toBe(true);
  });
});

describe("PATCH /api/snippets/[id]/visibility", () => {
  it("returns 401 without a wallet address", async () => {
    const res = await PATCH(
      makeRequest("PATCH", { wallet: null, body: { visibility: "private" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when the snippet does not exist", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue(null);
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OWNER, body: { visibility: "private" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns 403 when a non-owner tries to change visibility and logs the denial", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OTHER);

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OTHER, body: { visibility: "private" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(403);
    expect(serviceInstance.setVisibility).not.toHaveBeenCalled();
    expect(appendActivityLog).toHaveBeenCalledWith(
      "snippet.visibility_change_denied",
      "snippet",
      expect.objectContaining({ actorWallet: OTHER, resourceId: SNIPPET_ID }),
    );
  });

  it("returns 400 on an invalid visibility value", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OWNER, body: { visibility: "secret" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when switching to 'shared' with no users and no existing grants", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);
    (serviceInstance.getSharedUsers as jest.Mock).mockResolvedValue([]);

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OWNER, body: { visibility: "shared" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(400);
    expect(serviceInstance.setVisibility).not.toHaveBeenCalled();
  });

  it("changes visibility for the owner and returns the new state", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);
    (serviceInstance.setVisibility as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      visibility: "private",
    });

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OWNER, body: { visibility: "private" } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibility).toBe("private");
    expect(serviceInstance.setVisibility).toHaveBeenCalledWith(
      SNIPPET_ID,
      "private",
      OWNER,
      undefined,
    );
  });

  it("passes sharedWith through when provided", async () => {
    (repoInstance.findById as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      owner_wallet_address: OWNER,
      visibility: "public",
    });
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(OWNER);
    (serviceInstance.setVisibility as jest.Mock).mockResolvedValue({
      id: SNIPPET_ID,
      visibility: "shared",
    });
    (serviceInstance.getSharedUsers as jest.Mock).mockResolvedValue([
      { user_wallet_address: OTHER },
    ]);

    const res = await PATCH(
      makeRequest("PATCH", { wallet: OWNER, body: { visibility: "shared", sharedWith: [OTHER] } }),
      { params: Promise.resolve({ id: SNIPPET_ID }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibility).toBe("shared");
    expect(json.sharedWith).toEqual([OTHER]);
    expect(serviceInstance.setVisibility).toHaveBeenCalledWith(
      SNIPPET_ID,
      "shared",
      OWNER,
      [OTHER],
    );
  });
});
