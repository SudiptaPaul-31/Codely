jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    public headers: Headers;
    private _body: any;
    public url: string;

    constructor(input: string | URL, init?: RequestInit & { headers: Headers }) {
      this.url = typeof input === "string" ? input : input.toString();
      this.headers = init?.headers ?? new Headers();
      this._body = init?.body ? JSON.parse(init.body as string) : null;
    }

    async json() {
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

jest.mock("@/lib/permissions.service", () => ({
  grant: jest.fn(),
  revoke: jest.fn(),
  getPermissionsForSnippet: jest.fn(),
  getActivityLog: jest.fn(),
}));

jest.mock("../../ownership.middleware", () => ({
  OwnershipMiddleware: {
    extractWalletAddress: jest.fn(),
  },
}));

import { NextRequest } from "next/server";

import { GET, POST, DELETE } from "./route";
import * as permissionsService from "@/lib/permissions.service";
import { OwnershipMiddleware } from "../../ownership.middleware";

const SNIPPET_ID = "550e8400-e29b-41d4-a716-446655440000";
const WALLET = "GBRRHRH76DXEKWF3SCDYH7G7M4G3E4DEBIY7WBHBMRGBENRGQWSDLV2V";
const GRANTEE = "GDTNW5S3JSV27YLRU5XXXHXWLKATYO5ZJABA7QUITDO2YMFU5UXXKQRH";
const VALID_STELLAR = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";
const SHORT_ADDR = "GABCDEF";
const BAD_PREFIX = "A" + "X".repeat(55);
const INVALID_CHARS = "G" + "0".repeat(55);

function makeRequest(overrides: {
  method?: string;
  body?: unknown;
  wallet?: string | null;
  searchParams?: string;
} = {}): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (overrides.wallet) {
    headers.set("x-wallet-address", overrides.wallet);
  }
  const init: any = { method: overrides.method ?? "GET", headers };
  if (overrides.body !== undefined) {
    init.body = JSON.stringify(overrides.body);
  }
  return new (NextRequest as any)("http://localhost:3000/api/snippets/" + SNIPPET_ID + "/permissions" + (overrides.searchParams ? "?" + overrides.searchParams : ""), init);
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
});

describe("GET /api/snippets/[id]/permissions", () => {
  it("returns 401 when no wallet address is provided", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);

    const req = makeRequest({ wallet: null });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await GET(req, { params });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns permissions and optionally activity log", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    const mockPermissions = [
      { id: "perm-1", grantee_wallet_address: GRANTEE, permission_type: "view" },
    ];
    (permissionsService.getPermissionsForSnippet as jest.Mock).mockResolvedValue(mockPermissions);
    (permissionsService.getActivityLog as jest.Mock).mockResolvedValue([]);

    const req = makeRequest({ wallet: WALLET, searchParams: "includeLog=true" });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await GET(req, { params });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.permissions).toEqual(mockPermissions);
    expect(json.activityLog).toEqual([]);
    expect(permissionsService.getActivityLog).toHaveBeenCalledWith(SNIPPET_ID);
  });

  it("skips activity log when includeLog is not true", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.getPermissionsForSnippet as jest.Mock).mockResolvedValue([]);

    const req = makeRequest({ wallet: WALLET });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await GET(req, { params });

    expect(res.status).toBe(200);
    expect(permissionsService.getActivityLog).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.getPermissionsForSnippet as jest.Mock).mockRejectedValue(new Error("DB error"));

    const req = makeRequest({ wallet: WALLET });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await GET(req, { params });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to fetch permissions");
  });
});

describe("POST /api/snippets/[id]/permissions", () => {
  it("returns 401 when no wallet address is provided", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);

    const req = makeRequest({ method: "POST", wallet: null, body: { granteeWalletAddress: GRANTEE, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(401);
  });

  it("returns 400 when the grantee address is too short", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: SHORT_ADDR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when the grantee address does not start with G", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: BAD_PREFIX, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when the grantee address contains invalid characters", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: INVALID_CHARS, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when permission type is invalid", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "admin" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(400);
  });

  it("returns 201 on successful grant", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    const mockPermission = { id: "perm-1", snippet_id: SNIPPET_ID, grantee_wallet_address: VALID_STELLAR, permission_type: "view" };
    (permissionsService.grant as jest.Mock).mockResolvedValue({ success: true, permission: mockPermission });

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("perm-1");
    expect(permissionsService.grant).toHaveBeenCalledWith(SNIPPET_ID, VALID_STELLAR, "view", WALLET);
  });

  it("returns 403 when the service returns an error", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.grant as jest.Mock).mockResolvedValue({ success: false, error: "Only the snippet owner can grant permissions" });

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Only the snippet owner can grant permissions");
  });

  it("returns 500 when service throws unexpectedly", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.grant as jest.Mock).mockRejectedValue(new Error("Unexpected"));

    const req = makeRequest({ method: "POST", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await POST(req, { params });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to grant permission");
  });
});

describe("DELETE /api/snippets/[id]/permissions", () => {
  it("returns 401 when no wallet address is provided", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(null);

    const req = makeRequest({ method: "DELETE", wallet: null, body: { granteeWalletAddress: GRANTEE, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await DELETE(req, { params });

    expect(res.status).toBe(401);
  });

  it("returns 400 when the wallet address is invalid format", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);

    const req = makeRequest({ method: "DELETE", wallet: WALLET, body: { granteeWalletAddress: "invalid", permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await DELETE(req, { params });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 200 on successful revoke", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.revoke as jest.Mock).mockResolvedValue({ success: true });

    const req = makeRequest({ method: "DELETE", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "edit" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await DELETE(req, { params });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Permission revoked");
    expect(permissionsService.revoke).toHaveBeenCalledWith(SNIPPET_ID, VALID_STELLAR, "edit", WALLET);
  });

  it("returns 403 when the service returns an error", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.revoke as jest.Mock).mockResolvedValue({ success: false, error: "Permission not found or already revoked" });

    const req = makeRequest({ method: "DELETE", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await DELETE(req, { params });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Permission not found or already revoked");
  });

  it("returns 500 when service throws unexpectedly", async () => {
    (OwnershipMiddleware.extractWalletAddress as jest.Mock).mockResolvedValue(WALLET);
    (permissionsService.revoke as jest.Mock).mockRejectedValue(new Error("Unexpected"));

    const req = makeRequest({ method: "DELETE", wallet: WALLET, body: { granteeWalletAddress: VALID_STELLAR, permissionType: "view" } });
    const params = Promise.resolve({ id: SNIPPET_ID });
    const res = await DELETE(req, { params });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to revoke permission");
  });
});
