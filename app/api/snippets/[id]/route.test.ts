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

jest.mock("@/lib/db", () => ({
  createTransaction: jest.fn().mockResolvedValue(undefined),
  createSnippetVersion: jest.fn(),
  getVersionHistory: jest.fn(),
  getVersionById: jest.fn(),
  restoreVersion: jest.fn(),
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
  extractIp: jest.fn(() => "127.0.0.1"),
  extractUserAgent: jest.fn(() => null),
}));

jest.mock("@/lib/permissions.service", () => ({
  canView: jest.fn(),
  canEdit: jest.fn(),
}));

jest.mock("@/lib/ipfs.service", () => ({
  IPFSService: {
    uploadToIPFS: jest.fn().mockResolvedValue("QmMockCID-update"),
  },
}));

jest.mock("../snippet.repository", () => ({
  SnippetRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
    update: jest.fn(),
  })),
}));

jest.mock("../ownership.middleware", () => {
  const extractWalletAddress = jest.fn();
  const verifyOwnership = jest.fn();
  return {
    OwnershipMiddleware: class {
      static extractWalletAddress = extractWalletAddress;
      verifyOwnership = verifyOwnership;
    },
  };
});

jest.mock("../signature.middleware", () => ({
  SignatureMiddleware: jest.fn().mockImplementation(() => ({
    verifySignature: jest.fn(),
  })),
}));

import { NextRequest } from "next/server";
import { PUT } from "./route";
import { SnippetRepository } from "../snippet.repository";
import { OwnershipMiddleware } from "../ownership.middleware";
import * as permissionsService from "@/lib/permissions.service";

const SNIPPET_ID = "550e8400-e29b-41d4-a716-446655440000";
const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

const existing = {
  id: SNIPPET_ID,
  title: "Old Title",
  owner_wallet_address: WALLET,
  license_transaction_hash: null,
};

// Captured after route module load.
const repositoryInstance = (SnippetRepository as unknown as jest.Mock).mock
  .results[0].value as { findById: jest.Mock; update: jest.Mock };

function makeRequest(body: unknown, wallet: string | null = WALLET): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  const init: any = { method: "PUT", headers, body: JSON.stringify(body) };
  return new (NextRequest as any)(
    `http://localhost:3000/api/snippets/${SNIPPET_ID}`,
    init,
  );
}

const params = Promise.resolve({ id: SNIPPET_ID });

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
  (permissionsService.canEdit as jest.Mock).mockResolvedValue(true);
  repositoryInstance.findById.mockResolvedValue(existing);
  repositoryInstance.update.mockResolvedValue({ id: SNIPPET_ID, title: "New Title" });
});

describe("PUT /api/snippets/[id]", () => {
  it("returns 401 when no wallet address is provided", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);
    const res = await PUT(makeRequest({ title: "New Title" }, null), { params });
    expect(res.status).toBe(401);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot edit the snippet", async () => {
    (permissionsService.canEdit as jest.Mock).mockResolvedValue(false);
    const res = await PUT(makeRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(403);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("updates a snippet with valid data", async () => {
    const res = await PUT(makeRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("New Title");
    expect(repositoryInstance.update).toHaveBeenCalledWith(
      SNIPPET_ID,
      expect.objectContaining({ title: "New Title" }),
    );
  });

  it("returns 400 with the consistent error shape for an invalid title", async () => {
    const res = await PUT(makeRequest({ title: "ab" }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(typeof json.message).toBe("string");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details.some((d: any) => d.field === "title")).toBe(true);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid visibility in an update", async () => {
    const res = await PUT(makeRequest({ visibility: "friends" }), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.some((d: any) => d.field === "visibility")).toBe(true);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty update body", async () => {
    const res = await PUT(makeRequest({}), { params });
    expect(res.status).toBe(400);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("rejects ownerWalletAddress in update bodies (owner cannot be changed)", async () => {
    const res = await PUT(makeRequest({ title: "New", ownerWalletAddress: WALLET }), { params });
    expect(res.status).toBe(400);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("returns 400 for whitespace-only code in an update", async () => {
    const res = await PUT(makeRequest({ code: "   " }), { params });
    expect(res.status).toBe(400);
    expect(repositoryInstance.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the snippet does not exist", async () => {
    repositoryInstance.findById.mockResolvedValue(null);
    const res = await PUT(makeRequest({ title: "New Title" }), { params });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Snippet not found");
  });
});
