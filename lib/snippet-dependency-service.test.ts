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
  SnippetDependencyService,
  snippetDependencyService,
  validateDependencyName,
  validateDependencyVersion,
  validateDependencyEcosystem,
  validateDependencyConfiguration,
  MAX_DEPENDENCY_NAME_LENGTH,
  MAX_VERSION_LENGTH,
  MAX_CONFIG_PAYLOAD_BYTES,
} from "./snippet-dependency-service";
import {
  GET as getSnippetDependencies,
  POST as createSnippetDependency,
} from "@/app/api/snippets/[id]/dependencies/route";
import {
  PUT as updateDependencyRoute,
  DELETE as deleteDependencyRoute,
} from "@/app/api/dependencies/[dependencyId]/route";

const OWNER = "GOWNER" + "A".repeat(50);
const EDITOR = "GEDITOR" + "B".repeat(49);
const STRANGER = "GSTRANGER" + "C".repeat(47);
const SNIPPET_1 = "snippet_001";
const SNIPPET_2 = "snippet_002";

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

describe("SnippetDependencyService — Validation Rules", () => {
  it("validates and trims dependency names and rejects invalid names", () => {
    expect(validateDependencyName("  react  ")).toEqual({
      valid: true,
      value: "react",
    });
    expect(validateDependencyName("@types/node")).toEqual({
      valid: true,
      value: "@types/node",
    });
    expect(validateDependencyName("org.springframework.boot:spring-boot")).toEqual({
      valid: true,
      value: "org.springframework.boot:spring-boot",
    });

    expect(validateDependencyName("")).toMatchObject({ valid: false });
    expect(validateDependencyName("   ")).toMatchObject({ valid: false });
    expect(validateDependencyName("<script>alert(1)</script>")).toMatchObject({
      valid: false,
    });
    expect(validateDependencyName("../etc/passwd")).toMatchObject({
      valid: false,
    });
    expect(validateDependencyName("a".repeat(MAX_DEPENDENCY_NAME_LENGTH + 1))).toMatchObject({
      valid: false,
    });
  });

  it("validates version formats and enforces max length", () => {
    expect(validateDependencyVersion(" 18.3.1 ")).toEqual({
      valid: true,
      value: "18.3.1",
    });
    expect(validateDependencyVersion("^15.0.0-canary.1")).toEqual({
      valid: true,
      value: "^15.0.0-canary.1",
    });
    expect(validateDependencyVersion(">=1.2.0")).toEqual({
      valid: true,
      value: ">=1.2.0",
    });

    expect(validateDependencyVersion("")).toMatchObject({ valid: false });
    expect(validateDependencyVersion("not a valid version!!")).toMatchObject({
      valid: false,
    });
    expect(validateDependencyVersion("1".repeat(MAX_VERSION_LENGTH + 1))).toMatchObject({
      valid: false,
    });
  });

  it("validates supported ecosystems and rejects unknown ecosystems", () => {
    for (const eco of ["npm", "pip", "Cargo", "Maven", "NuGet", "Composer", "Other"]) {
      expect(validateDependencyEcosystem(eco)).toEqual({
        valid: true,
        value: eco,
      });
    }
    expect(validateDependencyEcosystem(undefined)).toEqual({
      valid: true,
      value: "npm",
    });
    expect(validateDependencyEcosystem("UnknownRepo")).toMatchObject({
      valid: false,
    });
  });

  it("validates configuration payload properties and size limits", () => {
    expect(
      validateDependencyConfiguration({
        peerDependency: false,
        required: true,
        registryUrl: "https://registry.npmjs.org",
      }),
    ).toEqual({
      valid: true,
      value: {
        peerDependency: false,
        required: true,
        registryUrl: "https://registry.npmjs.org/",
      },
    });

    expect(
      validateDependencyConfiguration({ unknownField: true }),
    ).toMatchObject({
      valid: false,
      error: expect.stringContaining("Unsupported configuration property"),
    });

    expect(
      validateDependencyConfiguration({ registryUrl: "javascript:alert(1)" }),
    ).toMatchObject({
      valid: false,
    });

    expect(
      validateDependencyConfiguration({
        notes: "x".repeat(MAX_CONFIG_PAYLOAD_BYTES + 100),
      }),
    ).toMatchObject({
      valid: false,
      error: expect.stringContaining("exceeds maximum size"),
    });
  });
});

describe("SnippetDependencyService — Core CRUD, Integrity & Cascade", () => {
  let service: SnippetDependencyService;

  beforeEach(() => {
    service = new SnippetDependencyService();
    service.registerSnippet({
      id: SNIPPET_1,
      ownerWallet: OWNER,
      editors: [EDITOR],
    });
    service.registerSnippet({
      id: SNIPPET_2,
      ownerWallet: OWNER,
    });
  });

  it("creates, lists, updates, and deletes dependencies for a snippet", async () => {
    const reactDep = await service.createDependency(
      SNIPPET_1,
      {
        name: "  react ",
        version: "18.3.1",
        ecosystem: "npm",
        configuration: { peerDependency: false, required: true },
      },
      OWNER,
    );

    expect(reactDep).toMatchObject({
      snippetId: SNIPPET_1,
      name: "react",
      version: "18.3.1",
      ecosystem: "npm",
      configuration: { peerDependency: false, required: true },
    });

    const nextDep = await service.createDependency(
      SNIPPET_1,
      { name: "next", version: "15.0.0", ecosystem: "npm" },
      EDITOR,
    );

    const listed = await service.listDependencies(SNIPPET_1);
    expect(listed).toHaveLength(2);
    expect(listed.map((d) => d.name)).toEqual(["react", "next"]);

    const updated = await service.updateDependency(
      reactDep.id,
      { version: "19.0.0", configuration: { peerDependency: true, required: true } },
      OWNER,
    );
    expect(updated.version).toBe("19.0.0");
    expect(updated.configuration.peerDependency).toBe(true);

    const deleteRes = await service.deleteDependency(nextDep.id, OWNER);
    expect(deleteRes).toEqual({
      deleted: true,
      id: nextDep.id,
      snippetId: SNIPPET_1,
    });

    const afterDelete = await service.listDependencies(SNIPPET_1);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].version).toBe("19.0.0");
  });

  it("prevents creating dependencies for nonexistent snippets and prevents duplicates", async () => {
    await expect(
      service.createDependency(
        "nonexistent_snippet",
        { name: "react", version: "18.3.1" },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await service.createDependency(
      SNIPPET_1,
      { name: "react", version: "18.3.1", ecosystem: "npm" },
      OWNER,
    );

    await expect(
      service.createDependency(
        SNIPPET_1,
        { name: "React", version: "18.2.0", ecosystem: "npm" },
        OWNER,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("enforces owner and editor permissions and rejects unauthorized callers", async () => {
    await expect(
      service.createDependency(
        SNIPPET_1,
        { name: "zod", version: "3.22.0" },
        null,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    await expect(
      service.createDependency(
        SNIPPET_1,
        { name: "zod", version: "3.22.0" },
        STRANGER,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const created = await service.createDependency(
      SNIPPET_1,
      { name: "zod", version: "3.22.0" },
      OWNER,
    );

    await expect(
      service.updateDependency(created.id, { version: "3.23.0" }, STRANGER),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    await expect(
      service.deleteDependency(created.id, STRANGER),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("isolates dependencies per snippet and attaches them to snippet retrieval payloads", async () => {
    await service.createDependency(
      SNIPPET_1,
      { name: "react", version: "18.3.1" },
      OWNER,
    );
    await service.createDependency(
      SNIPPET_2,
      { name: "tokio", version: "1.38.0", ecosystem: "Cargo" },
      OWNER,
    );

    const s1Deps = await service.listDependencies(SNIPPET_1);
    const s2Deps = await service.listDependencies(SNIPPET_2);
    expect(s1Deps).toHaveLength(1);
    expect(s1Deps[0].name).toBe("react");
    expect(s2Deps).toHaveLength(1);
    expect(s2Deps[0].name).toBe("tokio");

    const enriched = await service.attachDependenciesToSnippet({
      id: SNIPPET_1,
      title: "React Hook",
    });
    expect(enriched.dependencies).toHaveLength(1);
    expect(enriched.dependencies[0].name).toBe("react");
  });

  it("cascades deletion of all associated dependencies when a snippet is deleted", async () => {
    const dep1 = await service.createDependency(
      SNIPPET_1,
      { name: "react", version: "18.3.1" },
      OWNER,
    );
    const dep2 = await service.createDependency(
      SNIPPET_1,
      { name: "tailwindcss", version: "4.0.0" },
      OWNER,
    );

    const cascadeResult = await service.deleteSnippetWithCascade(SNIPPET_1, OWNER);
    expect(cascadeResult).toEqual({
      snippetId: SNIPPET_1,
      deletedDependenciesCount: 2,
    });

    expect(await service.getDependencyById(dep1.id)).toBeNull();
    expect(await service.getDependencyById(dep2.id)).toBeNull();
    await expect(service.listDependencies(SNIPPET_1)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("remains performant when managing large dependency collections", async () => {
    for (let i = 0; i < 40; i++) {
      await service.createDependency(
        SNIPPET_1,
        { name: `pkg-${i}`, version: `1.0.${i}`, ecosystem: "npm" },
        OWNER,
      );
    }
    const deps = await service.listDependencies(SNIPPET_1);
    expect(deps).toHaveLength(40);
  });
});

describe("Dependency API Routes (/api/snippets/[id]/dependencies & /api/dependencies/[dependencyId])", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    snippetDependencyService.clear();
    snippetDependencyService.registerSnippet({
      id: SNIPPET_1,
      ownerWallet: OWNER,
      editors: [EDITOR],
    });
    (verifyAuthentication as jest.Mock).mockResolvedValue({
      walletAddress: OWNER,
    });
  });

  it("handles POST, GET, PUT, and DELETE through route handlers with consistent responses", async () => {
    const postRes = await createSnippetDependency(
      makeReq(`http://localhost/api/snippets/${SNIPPET_1}/dependencies`, {
        body: {
          name: "react",
          version: "18.3.1",
          ecosystem: "npm",
          configuration: { required: true },
        },
      }),
      { params: Promise.resolve({ id: SNIPPET_1 }) },
    );
    expect(postRes.status).toBe(201);
    const createdBody = await postRes.json();
    expect(createdBody.dependency.name).toBe("react");
    const depId = createdBody.dependency.id;

    const getRes = await getSnippetDependencies(
      makeReq(`http://localhost/api/snippets/${SNIPPET_1}/dependencies`),
      { params: Promise.resolve({ id: SNIPPET_1 }) },
    );
    expect(getRes.status).toBe(200);
    const listBody = await getRes.json();
    expect(listBody.total).toBe(1);
    expect(listBody.dependencies[0].id).toBe(depId);

    const putRes = await updateDependencyRoute(
      makeReq(`http://localhost/api/dependencies/${depId}`, {
        body: { version: "18.3.2" },
      }),
      { params: Promise.resolve({ dependencyId: depId }) },
    );
    expect(putRes.status).toBe(200);
    expect((await putRes.json()).dependency.version).toBe("18.3.2");

    const delRes = await deleteDependencyRoute(
      makeReq(`http://localhost/api/dependencies/${depId}`),
      { params: Promise.resolve({ dependencyId: depId }) },
    );
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({
      deleted: true,
      id: depId,
      snippetId: SNIPPET_1,
    });
  });

  it("returns 400 validation errors and 403 forbidden errors appropriately", async () => {
    const badRes = await createSnippetDependency(
      makeReq(`http://localhost/api/snippets/${SNIPPET_1}/dependencies`, {
        body: { name: "", version: "bad version!!" },
      }),
      { params: Promise.resolve({ id: SNIPPET_1 }) },
    );
    expect(badRes.status).toBe(400);
    const badBody = await badRes.json();
    expect(badBody.error).toBe("VALIDATION_ERROR");
    expect(badBody.fields).toHaveProperty("name");
    expect(badBody.fields).toHaveProperty("version");

    (verifyAuthentication as jest.Mock).mockResolvedValue({
      walletAddress: STRANGER,
    });
    const forbiddenRes = await createSnippetDependency(
      makeReq(`http://localhost/api/snippets/${SNIPPET_1}/dependencies`, {
        body: { name: "lodash", version: "4.17.21" },
      }),
      { params: Promise.resolve({ id: SNIPPET_1 }) },
    );
    expect(forbiddenRes.status).toBe(403);
  });
});
