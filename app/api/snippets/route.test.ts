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

jest.mock("@/lib/rateLimiter", () => ({
  rateLimit: jest.fn(() => ({ allowed: true })),
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
  extractIp: jest.fn(() => "127.0.0.1"),
  extractUserAgent: jest.fn(() => null),
}));

jest.mock("@/lib/db", () => ({
  createTransaction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ipfs.service", () => ({
  IPFSService: {
    uploadToIPFS: jest.fn().mockResolvedValue("QmMockCID-route"),
  },
}));

jest.mock("./ownership.middleware", () => ({
  OwnershipMiddleware: {
    extractWalletAddress: jest.fn(),
  },
}));

jest.mock("./snippet.repository", () => ({
  SnippetRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    search: jest.fn(),
  })),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { SnippetRepository } from "./snippet.repository";
import { OwnershipMiddleware } from "./ownership.middleware";
import { createTransaction } from "@/lib/db";

const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

const validBody = {
  title: "My Snippet",
  description: "Does something useful",
  code: 'console.log("hi")',
  language: "typescript",
  tags: ["demo"],
};

// Captured after route module load (constructors run at import time).
const repositoryInstance = (SnippetRepository as unknown as jest.Mock).mock
  .results[0].value as { create: jest.Mock };

function makeRequest(body: unknown, wallet: string | null = WALLET): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  const init: any = { method: "POST", headers, body: JSON.stringify(body) };
  return new (NextRequest as any)("http://localhost:3000/api/snippets", init);
}

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
  repositoryInstance.create.mockResolvedValue({ id: "snippet-1", ...validBody });
});

describe("POST /api/snippets", () => {
  it("creates a snippet with valid data", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("snippet-1");
    // The authenticated wallet is injected into the body by the route.
    expect(repositoryInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...validBody,
        ownerWalletAddress: WALLET,
        visibility: "private",
      }),
    );
    expect(createTransaction).toHaveBeenCalled();
  });

  it("creates a snippet with an explicit valid visibility", async () => {
    const res = await POST(makeRequest({ ...validBody, visibility: "public" }));
    expect(res.status).toBe(201);
    expect(repositoryInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "public" }),
    );
  });

  it("returns 400 with the consistent error shape for a missing title", async () => {
    const rest = { ...validBody } as Record<string, unknown>;
    delete rest.title;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(typeof json.message).toBe("string");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details.some((d: any) => d.field === "title")).toBe(true);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty request body", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a title below the 3-character minimum", async () => {
    const res = await POST(makeRequest({ ...validBody, title: "ab" }));
    expect(res.status).toBe(400);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported language", async () => {
    const res = await POST(makeRequest({ ...validBody, language: "cobol" }));
    expect(res.status).toBe(400);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for empty or whitespace-only code", async () => {
    let res = await POST(makeRequest({ ...validBody, code: "" }));
    expect(res.status).toBe(400);
    res = await POST(makeRequest({ ...validBody, code: "   \n " }));
    expect(res.status).toBe(400);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for oversized code", async () => {
    const res = await POST(makeRequest({ ...validBody, code: "x".repeat(10001) }));
    expect(res.status).toBe(400);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a wallet address with an invalid checksum", async () => {
    // No authenticated header, so the body's wallet address is validated as-is.
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);
    const badWallet = "G" + "A".repeat(55);
    const res = await POST(
      makeRequest({ ...validBody, ownerWalletAddress: badWallet }, null),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.some((d: any) => d.field === "ownerWalletAddress")).toBe(true);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid visibility", async () => {
    const res = await POST(makeRequest({ ...validBody, visibility: "friends" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details.some((d: any) => d.field === "visibility")).toBe(true);
    expect(repositoryInstance.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies", async () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("x-wallet-address", WALLET);
    const init: any = { method: "POST", headers, body: "{invalid json" };
    const req = new (NextRequest as any)("http://localhost:3000/api/snippets", init);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("does not leak internal details in validation errors", async () => {
    const res = await POST(makeRequest({ ...validBody, title: 123 }));
    const json = await res.json();
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("node_modules");
  });
});
