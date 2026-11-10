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

jest.mock("@/lib/auth-middleware", () => ({
  verifyAuthentication: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import { verifyAuthentication } from "@/lib/auth-middleware";
import {
  BulkSnippetService,
  bulkSnippetService,
  MAX_BULK_BATCH_SIZE,
} from "./bulk-snippet-service";
import { POST as exportRoute } from "@/app/api/snippets/bulk/export/route";
import { POST as moveRoute } from "@/app/api/snippets/bulk/move/route";
import { POST as deleteRoute } from "@/app/api/snippets/bulk/delete/route";

const OWNER = "GOWNER" + "A".repeat(50);
const EDITOR = "GEDITOR" + "B".repeat(49);
const STRANGER = "GSTRANGER" + "C".repeat(47);

function makeReq(
  url: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
) {
  return new NextRequest(url, {
    headers: new Headers(opts.headers ?? {}),
    body:
      opts.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  } as never);
}

describe("BulkSnippetService — Core Bulk Export, Move & Delete", () => {
  let service: BulkSnippetService;

  beforeEach(() => {
    service = new BulkSnippetService();

    service.registerFolder({
      id: "folder_owned",
      name: "Owned Folder",
      ownerWallet: OWNER,
      editors: [EDITOR],
    });
    service.registerFolder({
      id: "folder_stranger",
      name: "Stranger Private Folder",
      ownerWallet: STRANGER,
    });

    service.registerSnippet({
      id: "snippet_001",
      title: "Public Auth Utility",
      code: "export const verify = () => true;",
      language: "typescript",
      description: "Public utility",
      ownerWallet: OWNER,
      visibility: "public",
    });

    service.registerSnippet({
      id: "snippet_002",
      title: "Secret Private Key Vault",
      code: "const SECRET = 'TOP_SECRET_12345';",
      language: "typescript",
      description: "Confidential snippet",
      ownerWallet: STRANGER,
      visibility: "private",
    });

    service.registerSnippet({
      id: "snippet_003",
      title: "Shared Collaborative Module",
      code: "export const shared = 42;",
      language: "typescript",
      description: "Editable by collaborator",
      ownerWallet: OWNER,
      visibility: "shared",
      editors: [EDITOR],
    });
  });

  it("exports authorized snippets and excludes unauthorized snippets without leaking metadata", async () => {
    const response = await service.bulkExport(
      {
        snippetIds: ["snippet_001", "snippet_002", "snippet_003"],
        format: "json",
      },
      OWNER,
    );

    expect(response.results).toEqual([
      { snippetId: "snippet_001", status: "success" },
      {
        snippetId: "snippet_002",
        status: "failed",
        code: "FORBIDDEN",
        reason: "Permission denied",
        message: "Insufficient permissions",
      },
      { snippetId: "snippet_003", status: "success" },
    ]);

    expect(response.exportedSnippets).toHaveLength(2);
    expect(response.exportedSnippets.map((s) => s.id)).toEqual([
      "snippet_001",
      "snippet_003",
    ]);

    // Ensure confidential data from snippet_002 is never leaked anywhere in the response
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("Secret Private Key Vault");
    expect(serialized).not.toContain("TOP_SECRET_12345");
  });

  it("supports markdown export format and deduplicates repeated snippet identifiers safely", async () => {
    const response = await service.bulkExport(
      {
        snippetIds: ["snippet_001", "snippet_001", "  snippet_001  "],
        format: "markdown",
      },
      OWNER,
    );

    expect(response.summary).toEqual({
      totalRequested: 3,
      uniqueProcessed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(response.exportedSnippets).toHaveLength(1);
    expect(response.exportedContent).toContain("# Public Auth Utility");
    expect(response.exportedContent).toContain("```typescript");
  });

  it("moves authorized snippets to an authorized folder and enforces folder permissions", async () => {
    const moveRes = await service.bulkMove(
      {
        snippetIds: ["snippet_001", "snippet_002", "snippet_003"],
        folderId: "folder_owned",
      },
      EDITOR,
    );

    // EDITOR can edit snippet_003, but does not own/edit snippet_001 or snippet_002
    expect(moveRes.results).toEqual([
      {
        snippetId: "snippet_001",
        status: "failed",
        code: "FORBIDDEN",
        reason: "Permission denied",
        message: "Insufficient permissions",
      },
      {
        snippetId: "snippet_002",
        status: "failed",
        code: "FORBIDDEN",
        reason: "Permission denied",
        message: "Insufficient permissions",
      },
      { snippetId: "snippet_003", status: "success" },
    ]);

    expect(service.getSnippet("snippet_003")?.folderId).toBe("folder_owned");
    expect(service.getSnippet("snippet_001")?.folderId).toBeNull();

    // Moving to an unauthorized folder is rejected
    await expect(
      service.bulkMove(
        {
          snippetIds: ["snippet_001"],
          folderId: "folder_stranger",
        },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    // Moving to a nonexistent folder is rejected with 404
    await expect(
      service.bulkMove(
        {
          snippetIds: ["snippet_001"],
          folderId: "folder_missing",
        },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("deletes only snippets owned by the caller and remains idempotent on retries", async () => {
    // Editor without delete rights cannot delete snippet_003
    const editorAttempt = await service.bulkDelete(
      { snippetIds: ["snippet_003"] },
      EDITOR,
    );
    expect(editorAttempt.results[0]).toMatchObject({
      snippetId: "snippet_003",
      status: "failed",
      code: "FORBIDDEN",
    });
    expect(service.getSnippet("snippet_003")).not.toBeNull();

    // Owner deletes snippet_001 and snippet_003, while snippet_002 fails FORBIDDEN
    const ownerDelete = await service.bulkDelete(
      { snippetIds: ["snippet_001", "snippet_002", "snippet_003"] },
      OWNER,
    );
    expect(ownerDelete.summary).toEqual({
      totalRequested: 3,
      uniqueProcessed: 3,
      succeeded: 2,
      failed: 1,
    });
    expect(service.getSnippet("snippet_001")).toBeNull();
    expect(service.getSnippet("snippet_003")).toBeNull();
    expect(service.getSnippet("snippet_002")).not.toBeNull();

    // Retrying the same delete request is idempotent
    const retryDelete = await service.bulkDelete(
      { snippetIds: ["snippet_001"] },
      OWNER,
    );
    expect(retryDelete.results[0]).toEqual({
      snippetId: "snippet_001",
      status: "success",
    });
  });

  it("handles invalid IDs, missing snippets, and processing errors without aborting valid items", async () => {
    service.setSimulatedProcessingFailure("snippet_003", true);

    const res = await service.bulkExport(
      {
        snippetIds: [
          "snippet_001",
          "../invalid/id",
          "snippet_missing",
          "snippet_003",
        ],
      },
      OWNER,
    );

    expect(res.results).toEqual([
      { snippetId: "snippet_001", status: "success" },
      {
        snippetId: "../invalid/id",
        status: "failed",
        code: "VALIDATION_ERROR",
        reason: "Invalid snippet identifier format.",
        message: "Invalid snippet identifier format.",
      },
      {
        snippetId: "snippet_missing",
        status: "failed",
        code: "NOT_FOUND",
        reason: "Snippet not found",
        message: "Snippet not found",
      },
      {
        snippetId: "snippet_003",
        status: "failed",
        code: "PROCESSING_FAILURE",
        reason: "Failed to process snippet during export",
        message: "Failed to process snippet during export",
      },
    ]);
    expect(res.exportedSnippets).toHaveLength(1);
    expect(res.exportedSnippets[0].id).toBe("snippet_001");
  });

  it("records detailed audit logs for all bulk operations", async () => {
    await service.bulkExport(
      { snippetIds: ["snippet_001", "snippet_002"] },
      OWNER,
    );
    await service.bulkMove(
      { snippetIds: ["snippet_001"], folderId: "folder_owned" },
      OWNER,
    );
    await service.bulkDelete({ snippetIds: ["snippet_001"] }, OWNER);

    const logs = service.getAuditLogs();
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatchObject({
      requestingUser: OWNER,
      operationType: "export",
      affectedSnippetIds: ["snippet_001"],
      failedSnippetIds: ["snippet_002"],
      outcome: "partial_success",
    });
    expect(logs[1]).toMatchObject({
      requestingUser: OWNER,
      operationType: "move",
      affectedSnippetIds: ["snippet_001"],
      outcome: "success",
    });
    expect(logs[2]).toMatchObject({
      requestingUser: OWNER,
      operationType: "delete",
      affectedSnippetIds: ["snippet_001"],
      outcome: "success",
    });
  });

  it("rejects oversized batches or unauthenticated requests", async () => {
    await expect(
      service.bulkDelete({ snippetIds: ["snippet_001"] }, null),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    const tooMany = Array.from(
      { length: MAX_BULK_BATCH_SIZE + 1 },
      (_, i) => `snippet_${i}`,
    );
    await expect(
      service.bulkExport({ snippetIds: tooMany }, OWNER),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});

describe("Bulk Operations API Routes (/api/snippets/bulk/export, /move, /delete)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bulkSnippetService.clear();
    bulkSnippetService.registerFolder({
      id: "folder_1",
      name: "Backend",
      ownerWallet: OWNER,
    });
    bulkSnippetService.registerSnippet({
      id: "snippet_001",
      title: "API Handler",
      code: "export default function handler() {}",
      language: "typescript",
      ownerWallet: OWNER,
      visibility: "private",
    });
    bulkSnippetService.registerSnippet({
      id: "snippet_002",
      title: "Other User Snippet",
      code: "secret()",
      language: "typescript",
      ownerWallet: STRANGER,
      visibility: "private",
    });
    (verifyAuthentication as jest.Mock).mockResolvedValue({
      walletAddress: OWNER,
    });
  });

  it("handles POST /api/snippets/bulk/export, /move, and /delete routes", async () => {
    const expRes = await exportRoute(
      makeReq("http://localhost/api/snippets/bulk/export", {
        body: { snippetIds: ["snippet_001", "snippet_002"] },
      }),
    );
    expect(expRes.status).toBe(200);
    const expBody = await expRes.json();
    expect(expBody.results).toEqual([
      { snippetId: "snippet_001", status: "success" },
      {
        snippetId: "snippet_002",
        status: "failed",
        code: "FORBIDDEN",
        reason: "Permission denied",
        message: "Insufficient permissions",
      },
    ]);
    expect(expBody.exportedSnippets).toHaveLength(1);

    const moveRes = await moveRoute(
      makeReq("http://localhost/api/snippets/bulk/move", {
        body: { snippetIds: ["snippet_001"], folderId: "folder_1" },
      }),
    );
    expect(moveRes.status).toBe(200);
    expect((await moveRes.json()).destinationFolderId).toBe("folder_1");

    const delRes = await deleteRoute(
      makeReq("http://localhost/api/snippets/bulk/delete", {
        body: { snippetIds: ["snippet_001", "snippet_002"] },
      }),
    );
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.summary.succeeded).toBe(1);
    expect(delBody.summary.failed).toBe(1);
  });

  it("returns 400 for invalid JSON bodies and 401 when unauthenticated", async () => {
    const invalidJsonRes = await exportRoute(
      makeReq("http://localhost/api/snippets/bulk/export", {
        body: "{bad json",
      }),
    );
    expect(invalidJsonRes.status).toBe(400);

    (verifyAuthentication as jest.Mock).mockResolvedValue(null);
    const unauthRes = await deleteRoute(
      makeReq("http://localhost/api/snippets/bulk/delete", {
        body: { snippetIds: ["snippet_001"] },
      }),
    );
    expect(unauthRes.status).toBe(401);
  });
});
