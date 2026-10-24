/**
 * Tests for /api/snippets/[id]/usage — GET (edit access), PUT, DELETE.
 *
 * Covers: creating, editing and deleting usage instructions; persistence of
 * the validated document; authorized vs unauthorized editing (including a
 * spoofed x-wallet-address header); validation and error states.
 */

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    private _body: string | null;
    public url: string;
    constructor(input: string | URL, init?: { headers?: Headers; body?: string }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this._body = init?.body ?? null;
    }
    async json() {
      if (this._body === null) throw new Error("no body");
      return JSON.parse(this._body);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const mockFindById = jest.fn();
const mockSetUsage = jest.fn();
jest.mock("../../snippet.repository", () => ({
  SnippetRepository: jest.fn().mockImplementation(() => ({
    findById: (...args: unknown[]) => mockFindById(...args),
    setUsageInstructions: (...args: unknown[]) => mockSetUsage(...args),
  })),
}));

jest.mock("@/lib/permissions.service", () => ({ canEdit: jest.fn() }));
jest.mock("@/lib/auth-middleware", () => ({ verifyAuthentication: jest.fn() }));
jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
  extractIp: jest.fn().mockReturnValue("127.0.0.1"),
  extractUserAgent: jest.fn().mockReturnValue("test-agent"),
}));

import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "./route";
import { canEdit } from "@/lib/permissions.service";
import { verifyAuthentication } from "@/lib/auth-middleware";
import { appendActivityLog } from "@/lib/activity-logger";

const OWNER = "GOWNER" + "A".repeat(50);
const EDITOR = "GEDITOR" + "B".repeat(49);
const STRANGER = "GSTRANGER" + "C".repeat(47);
const SNIPPET_ID = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: SNIPPET_ID }) };

const doc = {
  overview: "Generates JWT tokens.",
  prerequisites: "- jsonwebtoken\n- Node.js 20+",
  setup: "1. Install\n2. Configure secret\n3. Run",
  inputExample: { language: "json", code: '{ "name": "John Doe" }' },
  outputExample: { language: "json", code: '{ "success": true }' },
  notes: "Expiration is configurable.",
};

function req(method: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost/api/snippets/${SNIPPET_ID}/usage`, {
    headers: new Headers(opts.headers ?? {}),
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  } as never) as unknown as Parameters<typeof PUT>[0];
}

/** Sign in as `wallet` (a verified JWT + live session), or as nobody. */
const signInAs = (wallet: string | null) =>
  (verifyAuthentication as jest.Mock).mockResolvedValue(wallet ? { walletAddress: wallet } : null);

beforeEach(() => {
  jest.clearAllMocks();
  mockFindById.mockResolvedValue({ id: SNIPPET_ID, owner_wallet_address: OWNER });
  mockSetUsage.mockImplementation(async (id: string, usage: unknown) => ({ id, usage_instructions: usage }));
  (canEdit as jest.Mock).mockImplementation(async (_id: string, wallet: string) => wallet === OWNER || wallet === EDITOR);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT — create and edit", () => {
  it("lets the owner create instructions, persisting the validated document", async () => {
    signInAs(OWNER);
    const res = await PUT(req("PUT", { body: doc }), params);

    expect(res.status).toBe(200);
    expect(mockSetUsage).toHaveBeenCalledTimes(1);
    const [id, stored] = mockSetUsage.mock.calls[0];
    expect(id).toBe(SNIPPET_ID);
    expect(stored).toMatchObject({ ...doc, updatedBy: OWNER });
    expect(typeof stored.updatedAt).toBe("string");

    const body = await res.json();
    expect(body.usage_instructions).toMatchObject(doc);
    expect(appendActivityLog).toHaveBeenCalledWith(
      "snippet.updated",
      "snippet",
      expect.objectContaining({ actorWallet: OWNER, metadata: { field: "usage_instructions", action: "saved" } }),
    );
  });

  it("lets a collaborator with edit access update instructions", async () => {
    signInAs(EDITOR);
    const res = await PUT(req("PUT", { body: { overview: "Edited by a collaborator" } }), params);
    expect(res.status).toBe(200);
    expect(mockSetUsage.mock.calls[0][1]).toMatchObject({ overview: "Edited by a collaborator", updatedBy: EDITOR });
  });

  it("replaces the whole document on edit, so removed sections stay removed", async () => {
    signInAs(OWNER);
    await PUT(req("PUT", { body: { overview: "Only this now" } }), params);
    const stored = mockSetUsage.mock.calls[0][1];
    expect(stored.setup).toBeUndefined();
    expect(stored.inputExample).toBeUndefined();
  });

  it("refuses an unauthenticated request", async () => {
    signInAs(null);
    const res = await PUT(req("PUT", { body: doc }), params);
    expect(res.status).toBe(401);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it("refuses a spoofed x-wallet-address header naming the owner", async () => {
    signInAs(null); // no valid JWT/session
    const res = await PUT(req("PUT", { body: doc, headers: { "x-wallet-address": OWNER } }), params);
    expect(res.status).toBe(401);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who cannot edit the snippet", async () => {
    signInAs(STRANGER);
    const res = await PUT(req("PUT", { body: doc }), params);
    expect(res.status).toBe(403);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it("refuses a JWT whose wallet is not a Stellar account", async () => {
    (verifyAuthentication as jest.Mock).mockResolvedValue({ walletAddress: "not-a-wallet" });
    const res = await PUT(req("PUT", { body: doc }), params);
    expect(res.status).toBe(401);
  });

  it("answers 404 for a missing or deleted snippet", async () => {
    signInAs(OWNER);
    mockFindById.mockResolvedValue(null);
    const res = await PUT(req("PUT", { body: doc }), params);
    expect(res.status).toBe(404);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty document", {}],
    ["only blank sections", { overview: "   ", inputExample: { code: "" } }],
    ["an unknown field", { overview: "x", html: "<script>" }],
    ["an oversized section", { overview: "x".repeat(5001) }],
  ])("answers 400 with field errors for %s", async (_label, body) => {
    signInAs(OWNER);
    const res = await PUT(req("PUT", { body }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(Object.keys(json.fields).length).toBeGreaterThan(0);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    signInAs(OWNER);
    const res = await PUT(req("PUT", { body: "{not json" }), params);
    expect(res.status).toBe(400);
  });

  it("stores Markdown as text, leaving rendering to the safe renderer", async () => {
    signInAs(OWNER);
    const payload = '<script>alert(1)</script> and [x](javascript:alert(1))';
    await PUT(req("PUT", { body: { overview: payload } }), params);
    expect(mockSetUsage.mock.calls[0][1].overview).toBe(payload);
  });

  it("answers 500 without details when the database fails", async () => {
    signInAs(OWNER);
    mockSetUsage.mockRejectedValue(new Error("connection refused"));
    const res = await PUT(req("PUT", { body: doc }), params);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("connection refused");
  });
});

describe("DELETE", () => {
  it("lets the owner delete instructions, clearing the column", async () => {
    signInAs(OWNER);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(mockSetUsage).toHaveBeenCalledWith(SNIPPET_ID, null);
    expect(await res.json()).toEqual({ usage_instructions: null });
  });

  it("refuses unauthenticated and unauthorized deletes", async () => {
    signInAs(null);
    expect((await DELETE(req("DELETE", { headers: { "x-wallet-address": OWNER } }), params)).status).toBe(401);
    signInAs(STRANGER);
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
    expect(mockSetUsage).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing snippet", async () => {
    signInAs(OWNER);
    mockFindById.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});

describe("GET — edit access for the caller", () => {
  it.each([
    [OWNER, true],
    [EDITOR, true],
    [STRANGER, false],
    [null, false],
  ])("reports canEdit for %s as %s", async (wallet, expected) => {
    signInAs(wallet);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ canEdit: expected });
  });

  it("does not leak edit access for a missing snippet", async () => {
    signInAs(OWNER);
    mockFindById.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });
});
