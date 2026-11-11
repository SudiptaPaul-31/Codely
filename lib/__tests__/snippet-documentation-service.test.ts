jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    private _body: string | null;
    public url: string;
    constructor(
      input: string | URL,
      init?: { headers?: Headers; body?: string },
    ) {
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

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from "next/server";
import {
  SnippetDocumentationService,
  DocumentationAuthError,
  DocumentationNotFoundError,
  DocumentationValidationError,
  MAX_TEXT_SECTION_LENGTH,
  MAX_EXAMPLE_PAYLOAD_BYTES,
  sanitizeDocumentationText,
  snippetDocumentationService,
} from "@/lib/snippet-documentation-service";
import {
  GET,
  POST,
  PUT,
  DELETE,
} from "@/app/api/snippets/[id]/documentation/route";

const OWNER = "GOWNER" + "A".repeat(50);
const COLLABORATOR = "GCOLLAB" + "B".repeat(49);
const STRANGER = "GSTRANG" + "C".repeat(49);

function makeReq(
  url: string,
  opts?: { body?: unknown; headers?: Record<string, string> },
) {
  return new NextRequest(url, {
    headers: new Headers(opts?.headers ?? {}),
    body:
      opts?.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  });
}

describe("SnippetDocumentationService & Documentation Management API (#217)", () => {
  let service: SnippetDocumentationService;

  beforeEach(() => {
    service = new SnippetDocumentationService();
    snippetDocumentationService.clearAll();
    snippetDocumentationService.setAccessResolver(null);
  });

  describe("CRUD Operations, Persistence, and Empty-State Handling", () => {
    it("creates, retrieves, updates, and deletes structured snippet documentation", async () => {
      service.registerSnippet({
        id: "snippet_001",
        ownerWalletAddress: OWNER,
        collaboratorWallets: [COLLABORATOR],
      });

      // Empty state before creation
      const emptyInitial = await service.getDocumentation("snippet_001");
      expect(emptyInitial).toEqual({
        snippetId: "snippet_001",
        documentation: null,
        empty: true,
      });

      // Create documentation
      const created = await service.createDocumentation(
        "snippet_001",
        {
          overview: "Generates JWT access tokens for authenticated users.",
          prerequisites: ["Node.js 20+", "jsonwebtoken"],
          setupSteps: [
            "Install dependencies",
            "Configure JWT secret",
            "Import helper functions",
          ],
          inputExample: { userId: "123" },
          outputExample: { token: "jwt-token" },
          notes: "Token expiration is configurable.",
        },
        OWNER,
      );

      expect(created.empty).toBe(false);
      expect(created.documentation?.snippetId).toBe("snippet_001");
      expect(created.documentation?.overview).toBe(
        "Generates JWT access tokens for authenticated users.",
      );
      expect(created.documentation?.prerequisites).toEqual([
        "Node.js 20+",
        "jsonwebtoken",
      ]);
      expect(created.documentation?.setupSteps).toHaveLength(3);
      expect(created.documentation?.inputExample).toEqual({ userId: "123" });
      expect(created.documentation?.outputExample).toEqual({
        token: "jwt-token",
      });

      // Collaborator updates documentation
      const updated = await service.updateDocumentation(
        "snippet_001",
        {
          overview: "Updated JWT helper documentation.",
          prerequisites: ["Node.js 22+"],
          setupSteps: ["Run pnpm install"],
          inputExample: { userId: "456", role: "admin" },
          outputExample: { token: "new-jwt-token" },
          notes: "Updated notes.",
        },
        COLLABORATOR,
      );

      expect(updated.documentation?.id).toBe(created.documentation?.id);
      expect(updated.documentation?.overview).toBe(
        "Updated JWT helper documentation.",
      );
      expect(updated.documentation?.updatedBy).toBe(COLLABORATOR);

      // Enrich snippet retrieval API object
      const enriched = await service.attachDocumentationToSnippet({
        id: "snippet_001",
        title: "JWT Helper",
      });
      expect(enriched.documentation?.overview).toBe(
        "Updated JWT helper documentation.",
      );

      // Delete documentation
      const deleted = await service.deleteDocumentation("snippet_001", OWNER);
      expect(deleted.documentation).toBeNull();
      expect(deleted.empty).toBe(true);

      const afterDelete = await service.getDocumentation("snippet_001");
      expect(afterDelete.documentation).toBeNull();
      expect(afterDelete.empty).toBe(true);
    });
  });

  describe("Authorization Enforcement & Missing Snippet Handling", () => {
    it("prevents unauthenticated and unauthorized users from creating, updating, or deleting documentation", async () => {
      service.registerSnippet({
        id: "snippet_sec",
        ownerWalletAddress: OWNER,
      });

      const payload = { overview: "Authorized only" };

      // Unauthenticated (null wallet)
      await expect(
        service.createDocumentation("snippet_sec", payload, null),
      ).rejects.toThrow(DocumentationAuthError);

      // Stranger wallet (403)
      await expect(
        service.createDocumentation("snippet_sec", payload, STRANGER),
      ).rejects.toThrow(DocumentationAuthError);

      await service.createDocumentation("snippet_sec", payload, OWNER);

      await expect(
        service.updateDocumentation(
          "snippet_sec",
          { overview: "Hijack" },
          STRANGER,
        ),
      ).rejects.toThrow(DocumentationAuthError);

      await expect(
        service.deleteDocumentation("snippet_sec", STRANGER),
      ).rejects.toThrow(DocumentationAuthError);
    });

    it("throws DocumentationNotFoundError when snippet does not exist", async () => {
      service.markSnippetMissing("snippet_404");

      await expect(service.getDocumentation("snippet_404")).rejects.toThrow(
        DocumentationNotFoundError,
      );
      await expect(
        service.createDocumentation(
          "snippet_404",
          { overview: "Test" },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationNotFoundError);
    });
  });

  describe("Content Validation, Example Validation, and Oversized Payload Rejection", () => {
    it("rejects empty submissions, unsupported fields, and oversized sections", async () => {
      // Empty object
      await expect(
        service.createDocumentation("snippet_val", {}, OWNER),
      ).rejects.toThrow(DocumentationValidationError);

      // Blank strings only
      await expect(
        service.createDocumentation(
          "snippet_val",
          { overview: "   ", prerequisites: ["  "] },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);

      // Unsupported field
      await expect(
        service.createDocumentation(
          "snippet_val",
          { overview: "Valid", unknownField: "not allowed" },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);

      // Oversized overview
      await expect(
        service.createDocumentation(
          "snippet_val",
          { overview: "a".repeat(MAX_TEXT_SECTION_LENGTH + 1) },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);
    });

    it("rejects malformed JSON examples and oversized example payloads", async () => {
      // Invalid JSON string starting with `{`
      await expect(
        service.createDocumentation(
          "snippet_ex",
          {
            overview: "Example test",
            inputExample: "{ invalid json ",
          },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);

      // Invalid JSON inside structured { format: "json", content: "..." }
      await expect(
        service.createDocumentation(
          "snippet_ex",
          {
            overview: "Example test",
            outputExample: { format: "json", content: "{bad:json}" },
          },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);

      // Oversized example payload
      await expect(
        service.createDocumentation(
          "snippet_ex",
          {
            overview: "Example test",
            inputExample: { huge: "x".repeat(MAX_EXAMPLE_PAYLOAD_BYTES + 100) },
          },
          OWNER,
        ),
      ).rejects.toThrow(DocumentationValidationError);
    });
  });

  describe("Sanitization & XSS Protection", () => {
    it("strips script tags, iframes, inline event handlers, and javascript: URIs before storage", async () => {
      const dirtyOverview =
        'Hello <script>alert("xss")</script><img src=x onerror="steal()"> [Click](javascript:evil()) <iframe src="https://evil.com"></iframe>';
      const res = await service.createDocumentation(
        "snippet_xss",
        {
          overview: dirtyOverview,
          prerequisites: ['Node.js <script>evil()</script>'],
          inputExample: {
            user: '<script>evil()</script>alice',
          },
        },
        OWNER,
      );

      expect(res.documentation?.overview).not.toContain("<script>");
      expect(res.documentation?.overview).not.toContain("onerror=");
      expect(res.documentation?.overview).not.toContain("javascript:");
      expect(res.documentation?.overview).not.toContain("<iframe");
      expect(res.documentation?.prerequisites[0]).toBe("Node.js");
      expect(res.documentation?.inputExample).toEqual({ user: "alice" });
      expect(sanitizeDocumentationText(dirtyOverview)).not.toContain(
        "<script>",
      );
    });
  });

  describe("Concurrent Updates & Audit Logging", () => {
    it("serializes concurrent documentation updates without data corruption and records audit logs", async () => {
      service.registerSnippet({
        id: "snippet_conc",
        ownerWalletAddress: OWNER,
        collaboratorWallets: [COLLABORATOR],
      });

      const [u1, u2] = await Promise.all([
        service.updateDocumentation(
          "snippet_conc",
          { overview: "Update 1", notes: "Note 1" },
          OWNER,
        ),
        service.updateDocumentation(
          "snippet_conc",
          { overview: "Update 2", notes: "Note 2" },
          COLLABORATOR,
        ),
      ]);

      expect(u1.documentation?.id).toBe(u2.documentation?.id);
      const finalDoc = await service.getDocumentation("snippet_conc");
      expect(finalDoc.documentation?.overview).toBe("Update 2");

      const logs = service.getAuditLogs("snippet_conc");
      expect(logs.map((l) => l.action)).toEqual([
        "documentation.created",
        "documentation.updated",
      ]);
    });
  });

  describe("Next.js API Route Handlers (/api/snippets/[id]/documentation)", () => {
    it("supports POST, GET, PUT, and DELETE with consistent validation and error handling", async () => {
      const params = { params: Promise.resolve({ id: "snippet_route_217" }) };

      // 1. GET empty documentation
      const getEmpty = await GET(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation"),
        params,
      );
      expect(getEmpty.status).toBe(200);
      expect(await getEmpty.json()).toEqual({
        snippetId: "snippet_route_217",
        documentation: null,
        empty: true,
      });

      // 2. POST without auth -> 401
      const unauthPost = await POST(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation", {
          body: { overview: "Docs" },
        }),
        params,
      );
      expect(unauthPost.status).toBe(401);

      // 3. POST with owner wallet -> 201
      const createRes = await POST(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation", {
          headers: { "x-wallet-address": OWNER },
          body: {
            overview: "JWT token generator",
            prerequisites: ["Node.js", "jsonwebtoken"],
            setupSteps: ["Install dependencies", "Configure secrets"],
            inputExample: { userId: "123" },
            outputExample: { token: "jwt-token" },
            notes: "Expiration time is configurable.",
          },
        }),
        params,
      );
      expect(createRes.status).toBe(201);
      const createdBody = await createRes.json();
      expect(createdBody.documentation.overview).toBe("JWT token generator");

      // 4. PUT by stranger -> 403
      const forbiddenPut = await PUT(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation", {
          headers: { "x-wallet-address": STRANGER },
          body: { overview: "Tampered" },
        }),
        params,
      );
      expect(forbiddenPut.status).toBe(403);

      // 5. PUT by owner -> 200
      const updateRes = await PUT(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation", {
          headers: { "x-wallet-address": OWNER },
          body: {
            overview: "Updated JWT token generator",
            notes: "Updated note.",
          },
        }),
        params,
      );
      expect(updateRes.status).toBe(200);
      const updatedBody = await updateRes.json();
      expect(updatedBody.documentation.overview).toBe(
        "Updated JWT token generator",
      );

      // 6. DELETE by owner -> 200
      const deleteRes = await DELETE(
        makeReq("http://localhost/api/snippets/snippet_route_217/documentation", {
          headers: { "x-wallet-address": OWNER },
        }),
        params,
      );
      expect(deleteRes.status).toBe(200);
      expect((await deleteRes.json()).documentation).toBeNull();
    });

    it("enforces external SnippetAccessResolver ownership, collaborator edit permissions, and private/shared read visibility", async () => {
      snippetDocumentationService.setAccessResolver({
        async resolveSnippet(snippetId: string) {
          if (snippetId === "missing_db_snippet") {
            return null;
          }
          if (snippetId === "private_snippet") {
            return {
              id: snippetId,
              ownerWalletAddress: OWNER,
              visibility: "private",
              exists: true,
            };
          }
          return {
            id: snippetId,
            ownerWalletAddress: OWNER,
            visibility: "shared",
            exists: true,
          };
        },
        async canEditSnippet(_snippetId: string, walletAddress: string) {
          return walletAddress === COLLABORATOR;
        },
        async canViewSnippet(_snippetId: string, walletAddress: string) {
          return walletAddress === COLLABORATOR;
        },
      });

      // Stranger cannot claim a nonexistent DB snippet via POST -> 404
      const missingRes = await POST(
        makeReq("http://localhost/api/snippets/missing_db_snippet/documentation", {
          headers: { "x-wallet-address": STRANGER },
          body: { overview: "Attempt self-registration" },
        }),
        { params: Promise.resolve({ id: "missing_db_snippet" }) },
      );
      expect(missingRes.status).toBe(404);

      // Collaborator granted edit via resolver can create documentation on shared snippet -> 201
      const sharedParams = {
        params: Promise.resolve({ id: "shared_snippet" }),
      };
      const collabCreate = await POST(
        makeReq("http://localhost/api/snippets/shared_snippet/documentation", {
          headers: { "x-wallet-address": COLLABORATOR },
          body: { overview: "Shared snippet docs" },
        }),
        sharedParams,
      );
      expect(collabCreate.status).toBe(201);

      // Unauthenticated GET on shared snippet -> 401; stranger -> 403; collaborator -> 200
      const unauthGet = await GET(
        makeReq("http://localhost/api/snippets/shared_snippet/documentation"),
        sharedParams,
      );
      expect(unauthGet.status).toBe(401);

      const strangerGet = await GET(
        makeReq("http://localhost/api/snippets/shared_snippet/documentation", {
          headers: { "x-wallet-address": STRANGER },
        }),
        sharedParams,
      );
      expect(strangerGet.status).toBe(403);

      const collabGet = await GET(
        makeReq("http://localhost/api/snippets/shared_snippet/documentation", {
          headers: { "x-wallet-address": COLLABORATOR },
        }),
        sharedParams,
      );
      expect(collabGet.status).toBe(200);
      expect((await collabGet.json()).documentation.overview).toBe(
        "Shared snippet docs",
      );

      // Private snippet: owner can write & read, collaborator cannot read -> 403
      const privateParams = {
        params: Promise.resolve({ id: "private_snippet" }),
      };
      await POST(
        makeReq("http://localhost/api/snippets/private_snippet/documentation", {
          headers: { "x-wallet-address": OWNER },
          body: { overview: "Owner eyes only" },
        }),
        privateParams,
      );

      const collabPrivateGet = await GET(
        makeReq("http://localhost/api/snippets/private_snippet/documentation", {
          headers: { "x-wallet-address": COLLABORATOR },
        }),
        privateParams,
      );
      expect(collabPrivateGet.status).toBe(403);

      const ownerPrivateGet = await GET(
        makeReq("http://localhost/api/snippets/private_snippet/documentation", {
          headers: { "x-wallet-address": OWNER },
        }),
        privateParams,
      );
      expect(ownerPrivateGet.status).toBe(200);
    });
  });
});
