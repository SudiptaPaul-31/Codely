import { deflateRawSync } from "zlib";

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    public url: string;
    private rawBody: string | Buffer | null;

    constructor(input: string | URL, init?: RequestInit & { headers: Headers }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this.rawBody = (init?.body as string | Buffer | null) ?? null;
    }

    async json() {
      return JSON.parse(this.rawBody as string);
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const buf = Buffer.isBuffer(this.rawBody)
        ? this.rawBody
        : Buffer.from(String(this.rawBody ?? ""));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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

jest.mock("../snippet.service", () => ({
  SnippetService: jest.fn().mockImplementation(() => ({
    createSnippet: jest.fn(),
  })),
}));

jest.mock("../snippet.repository", () => ({
  SnippetRepository: jest.fn(),
}));

jest.mock("../ownership.middleware", () => ({
  OwnershipMiddleware: {
    extractWalletAddress: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { SnippetService } from "../snippet.service";
import { OwnershipMiddleware } from "../ownership.middleware";

const WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

const validItem = {
  title: "Imported Snippet",
  description: "Imported via API",
  code: "console.log('imported')",
  language: "javascript",
  tags: ["imported"],
};

function makeRequest(
  body: string | Buffer,
  contentType: string,
  wallet: string | null = WALLET,
): NextRequest {
  const headers = new Headers({ "Content-Type": contentType });
  if (wallet) {
    headers.set("x-wallet-address", wallet);
  }
  const init: any = { method: "POST", headers, body };
  return new (NextRequest as any)("http://localhost:3000/api/snippets/import", init);
}

/** Minimal ZIP writer (local file headers only, sizes in header). */
function makeZip(entries: Array<{ name: string; content: string; method?: 0 | 8 }>): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "utf8");
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(Buffer.byteLength(entry.name), 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, Buffer.from(entry.name), compressed);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

// Deflate ZIP generated with Python's zipfile (independent oracle).
const PYTHON_ZIP_BASE64 =
  "UEsDBBQAAAAIAMttGl2fVX1RbQAAAIMAAAANAAAAc25pcHBldHMuanNvbiXMsQoCQQwE0F8JqRREsPUDBGs7jyvCblgie5uwGy1O/HfN2c6bmemNLl4Zz4DXxbQ7Z7iLwa2JGTseADOP1MVctEXt0nWBVSwoad6mSdvQyseqZXfah1Rq5Ull0we96H8R4lTGL50wPubP/AVQSwECFAMUAAAACADLbRpdn1V9UW0AAACDAAAADQAAAAAAAAAAAAAAgAEAAAAAc25pcHBldHMuanNvblBLBQYAAAAAAQABADsAAACYAAAAAAA=";

// Captured after route module load (new SnippetService() runs at import time).
const createSnippetMock = (
  (SnippetService as unknown as jest.Mock).mock.results[0].value as {
    createSnippet: jest.Mock;
  }
).createSnippet;

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
  createSnippetMock.mockResolvedValue({ id: "created-1" });
});

describe("POST /api/snippets/import", () => {
  describe("authorization", () => {
    it("returns 401 when no wallet address is provided", async () => {
      (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);
      const res = await POST(makeRequest(JSON.stringify([validItem]), "application/json", null));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
      expect(createSnippetMock).not.toHaveBeenCalled();
    });
  });

  describe("JSON imports", () => {
    it("imports a single valid snippet object", async () => {
      const res = await POST(makeRequest(JSON.stringify(validItem), "application/json"));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.imported).toBe(1);
      expect(createSnippetMock).toHaveBeenCalledTimes(1);
      expect(createSnippetMock).toHaveBeenCalledWith({
        ...validItem,
        visibility: "private",
        ownerWalletAddress: WALLET,
      });
    });

    it("imports an array of valid snippets", async () => {
      const items = [validItem, { ...validItem, title: "Second" }];
      const res = await POST(makeRequest(JSON.stringify(items), "application/json"));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.imported).toBe(2);
      expect(createSnippetMock).toHaveBeenCalledTimes(2);
      expect(createSnippetMock).toHaveBeenNthCalledWith(2, {
        ...items[1],
        visibility: "private",
        ownerWalletAddress: WALLET,
      });
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await POST(makeRequest("{not valid json", "application/json"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.message).toContain("not valid JSON");
      expect(Array.isArray(json.details)).toBe(true);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the payload is not an object or array", async () => {
      const res = await POST(makeRequest("42", "application/json"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 for an empty array", async () => {
      const res = await POST(makeRequest("[]", "application/json"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 when an item is missing required fields", async () => {
      const missingTitle = { ...validItem } as Record<string, unknown>;
      delete missingTitle.title;
      const res = await POST(makeRequest(JSON.stringify([missingTitle]), "application/json"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.details.some((d: any) => d.field === "items[0].title")).toBe(true);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 when an item has an unsupported language", async () => {
      const res = await POST(
        makeRequest(JSON.stringify([{ ...validItem, language: "cobol" }]), "application/json"),
      );
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 when an item has oversized code", async () => {
      const res = await POST(
        makeRequest(JSON.stringify([{ ...validItem, code: "x".repeat(10001) }]), "application/json"),
      );
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 when an item has invalid visibility", async () => {
      const res = await POST(
        makeRequest(JSON.stringify([{ ...validItem, visibility: "friends" }]), "application/json"),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.details.some((d: any) => d.field === "items[0].visibility")).toBe(true);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("rejects ownerWalletAddress inside imported items (owner cannot be spoofed)", async () => {
      const res = await POST(
        makeRequest(JSON.stringify([{ ...validItem, ownerWalletAddress: WALLET }]), "application/json"),
      );
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("does not persist anything when one item in an array is invalid", async () => {
      const items = [validItem, { ...validItem, title: "" }];
      const res = await POST(makeRequest(JSON.stringify(items), "application/json"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });
  });

  describe("ZIP imports", () => {
    it("imports snippets from a valid ZIP archive", async () => {
      const zip = Buffer.from(PYTHON_ZIP_BASE64, "base64");
      const res = await POST(makeRequest(zip, "application/zip"));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.imported).toBe(1);
      expect(createSnippetMock).toHaveBeenCalledWith({
        title: "Imported Zip Snippet",
        description: "From zip",
        code: "console.log(1)",
        language: "javascript",
        tags: ["zip"],
        visibility: "private",
        ownerWalletAddress: WALLET,
      });
    });

    it("returns 400 for a buffer that is not a ZIP", async () => {
      const res = await POST(makeRequest(Buffer.from("not a zip at all"), "application/zip"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.details.some((d: any) => d.field === "file")).toBe(true);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a ZIP with no JSON manifest", async () => {
      const zip = makeZip([{ name: "readme.txt", content: "hello" }]);
      const res = await POST(makeRequest(zip, "application/zip"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a ZIP with malformed JSON inside", async () => {
      const zip = makeZip([{ name: "snippets.json", content: "{oops" }]);
      const res = await POST(makeRequest(zip, "application/zip"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("Invalid JSON");
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a ZIP with invalid snippet fields", async () => {
      const zip = makeZip([
        { name: "snippets.json", content: JSON.stringify([{ title: "no code here" }]) },
      ]);
      const res = await POST(makeRequest(zip, "application/zip"));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation failed");
      expect(json.details.length).toBeGreaterThan(0);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a ZIP entry that decompresses beyond the size limit", async () => {
      const zip = makeZip([
        {
          name: "snippets.json",
          content: JSON.stringify([{ ...validItem, code: "x".repeat(10001) }]),
          method: 8,
        },
      ]);
      const res = await POST(makeRequest(zip, "application/zip"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });
  });

  describe("content type handling", () => {
    it("returns 400 for an unsupported content type", async () => {
      const res = await POST(makeRequest(JSON.stringify([validItem]), "text/csv"));
      expect(res.status).toBe(400);
      expect(createSnippetMock).not.toHaveBeenCalled();
    });
  });
});
