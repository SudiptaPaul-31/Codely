jest.mock("@neondatabase/serverless", () => {
  const mockSql = jest.fn().mockResolvedValue([]);
  return { neon: jest.fn(() => mockSql) };
});

jest.mock("./permissions.repository", () => ({
  grantPermission: jest.fn(),
  revokePermission: jest.fn(),
  getPermissionsForSnippet: jest.fn(),
  getPermissionForWallet: jest.fn(),
  hasPermission: jest.fn(),
  getActivityLog: jest.fn(),
}));

import { neon } from "@neondatabase/serverless";
import {
  canView,
  canEdit,
  grant,
  revoke,
  getPermissionsForSnippet,
  getActivityLog,
} from "./permissions.service";
import * as repo from "./permissions.repository";

const SNIPPET_ID = "snippet-1";
const OWNER = "GBRRHRH76DXEKWF3SCDYH7G7M4G3E4DEBIY7WBHBMRGBENRGQWSDLV2V";
const GRANTEE = "GDTNW5S3JSV27YLRU5XXXHXWLKATYO5ZJABA7QUITDO2YMFU5UXXKQRH";
const OTHER = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";

let consoleSpy: jest.SpyInstance;
let mockSql: jest.Mock;

beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSql = (neon as jest.Mock)() as jest.Mock;
  mockSql.mockResolvedValue([]);
});

describe("Permissions Service", () => {
  describe("canView", () => {
    it("returns true when the caller is the snippet owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);

      const result = await canView(SNIPPET_ID, OWNER);

      expect(result).toBe(true);
      expect(repo.hasPermission).not.toHaveBeenCalled();
    });

    it("returns true when the caller has a direct view permission", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.hasPermission as jest.Mock).mockResolvedValueOnce(true);
      (repo.hasPermission as jest.Mock).mockResolvedValueOnce(false);

      const result = await canView(SNIPPET_ID, GRANTEE);

      expect(result).toBe(true);
      expect(repo.hasPermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "view");
      expect(repo.hasPermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "edit");
    });

    it("returns true when the caller has an edit permission (edit implies view)", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.hasPermission as jest.Mock).mockResolvedValueOnce(false);
      (repo.hasPermission as jest.Mock).mockResolvedValueOnce(true);

      const result = await canView(SNIPPET_ID, GRANTEE);

      expect(result).toBe(true);
    });

    it("returns false when the caller has no permission", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.hasPermission as jest.Mock).mockResolvedValue(false);

      const result = await canView(SNIPPET_ID, OTHER);

      expect(result).toBe(false);
    });

    it("returns false when the snippet does not exist", async () => {
      mockSql.mockResolvedValue([]);

      const result = await canView("non-existent", GRANTEE);

      expect(result).toBe(false);
    });
  });

  describe("canEdit", () => {
    it("returns true when the caller is the snippet owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);

      const result = await canEdit(SNIPPET_ID, OWNER);

      expect(result).toBe(true);
      expect(repo.hasPermission).not.toHaveBeenCalled();
    });

    it("returns true when the caller has an edit permission", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.hasPermission as jest.Mock).mockResolvedValue(true);

      const result = await canEdit(SNIPPET_ID, GRANTEE);

      expect(result).toBe(true);
      expect(repo.hasPermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "edit");
    });

    it("returns false when the caller has only view permission", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.hasPermission as jest.Mock).mockResolvedValue(false);

      const result = await canEdit(SNIPPET_ID, GRANTEE);

      expect(result).toBe(false);
    });

    it("returns false when the snippet does not exist", async () => {
      mockSql.mockResolvedValue([]);

      const result = await canEdit("non-existent", GRANTEE);

      expect(result).toBe(false);
    });
  });

  describe("grant", () => {
    it("grants view permission when the grantor is the owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      const expected = { id: "perm-1", snippet_id: SNIPPET_ID };
      (repo.grantPermission as jest.Mock).mockResolvedValue(expected);

      const result = await grant(SNIPPET_ID, GRANTEE, "view", OWNER);

      expect(result).toEqual({ success: true, permission: expected });
      expect(repo.grantPermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "view", OWNER);
    });

    it("grants edit permission when the grantor is the owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      const expected = { id: "perm-2", snippet_id: SNIPPET_ID };
      (repo.grantPermission as jest.Mock).mockResolvedValue(expected);

      const result = await grant(SNIPPET_ID, GRANTEE, "edit", OWNER);

      expect(result).toEqual({ success: true, permission: expected });
      expect(repo.grantPermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "edit", OWNER);
    });

    it("rejects grant when the snippet does not exist", async () => {
      mockSql.mockResolvedValue([]);

      const result = await grant("non-existent", GRANTEE, "view", OWNER);

      expect(result).toEqual({ success: false, error: "Snippet not found" });
      expect(repo.grantPermission).not.toHaveBeenCalled();
    });

    it("rejects grant when the grantor is not the owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);

      const result = await grant(SNIPPET_ID, GRANTEE, "view", OTHER);

      expect(result).toEqual({ success: false, error: "Only the snippet owner can grant permissions" });
      expect(repo.grantPermission).not.toHaveBeenCalled();
    });

    it("rejects grant when the grantee is the owner themselves", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);

      const result = await grant(SNIPPET_ID, OWNER, "view", OWNER);

      expect(result).toEqual({ success: false, error: "Owner already has full access" });
      expect(repo.grantPermission).not.toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("revokes permission when the revoker is the owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.revokePermission as jest.Mock).mockResolvedValue(true);

      const result = await revoke(SNIPPET_ID, GRANTEE, "view", OWNER);

      expect(result).toEqual({ success: true });
      expect(repo.revokePermission).toHaveBeenCalledWith(SNIPPET_ID, GRANTEE, "view", OWNER);
    });

    it("rejects revoke when the snippet does not exist", async () => {
      mockSql.mockResolvedValue([]);

      const result = await revoke("non-existent", GRANTEE, "view", OWNER);

      expect(result).toEqual({ success: false, error: "Snippet not found" });
      expect(repo.revokePermission).not.toHaveBeenCalled();
    });

    it("rejects revoke when the revoker is not the owner", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);

      const result = await revoke(SNIPPET_ID, GRANTEE, "view", OTHER);

      expect(result).toEqual({ success: false, error: "Only the snippet owner can revoke permissions" });
      expect(repo.revokePermission).not.toHaveBeenCalled();
    });

    it("returns error when the permission does not exist or is already revoked", async () => {
      mockSql.mockResolvedValue([{ owner_wallet_address: OWNER }]);
      (repo.revokePermission as jest.Mock).mockResolvedValue(false);

      const result = await revoke(SNIPPET_ID, GRANTEE, "view", OWNER);

      expect(result).toEqual({ success: false, error: "Permission not found or already revoked" });
    });
  });

  describe("re-exports", () => {
    it("re-exports getPermissionsForSnippet from the repository", () => {
      expect(getPermissionsForSnippet).toBe(repo.getPermissionsForSnippet);
    });

    it("re-exports getActivityLog from the repository", () => {
      expect(getActivityLog).toBe(repo.getActivityLog);
    });
  });
});
