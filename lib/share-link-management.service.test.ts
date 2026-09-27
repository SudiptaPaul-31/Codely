import {
  InMemoryShareLinkStore,
  ShareLinkManagementService,
} from "./share-link-management.service";

jest.mock("@/lib/audit", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

describe("ShareLinkManagementService", () => {
  let store: InMemoryShareLinkStore;
  let service: ShareLinkManagementService;

  beforeEach(() => {
    store = new InMemoryShareLinkStore();
    service = new ShareLinkManagementService(store);
  });

  describe("generateSecureToken", () => {
    it("creates unique non-guessable 64-char hex tokens", () => {
      const a = service.generateSecureToken();
      const b = service.generateSecureToken();
      expect(a).toMatch(/^[a-f0-9]{64}$/);
      expect(b).toMatch(/^[a-f0-9]{64}$/);
      expect(a).not.toBe(b);
    });
  });

  describe("createShareLink", () => {
    it("requires snippetId", async () => {
      await expect(service.createShareLink({ snippetId: "" })).rejects.toThrow(
        "snippetId is required",
      );
    });

    it("creates a secure link with optional expiry and defaults to read-only", async () => {
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      const link = await service.createShareLink({
        snippetId: "abc123",
        visibility: "read-only",
        expiresAt,
        createdBy: "GTEST",
      });

      expect(link.snippetId).toBe("abc123");
      expect(link.visibility).toBe("read-only");
      expect(link.status).toBe("active");
      expect(link.token).toMatch(/^[a-f0-9]{64}$/);
      expect(link.expiresAt).toBe(expiresAt);
      expect(link.shareUrl).toContain(link.token);
      // Never expose snippet content fields
      expect(link as any).not.toHaveProperty("code");
      expect(link as any).not.toHaveProperty("content");
    });

    it("rejects past expiration timestamps", async () => {
      await expect(
        service.createShareLink({
          snippetId: "abc123",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      ).rejects.toThrow("expiresAt must be in the future");
    });

    it("records a creation audit event", async () => {
      const link = await service.createShareLink({ snippetId: "s1", createdBy: "G1" });
      const audit = await service.getAuditLog(link.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("created");
      expect(audit[0].actor).toBe("G1");
      expect(audit[0].tokenPrefix).toBe(link.token.slice(0, 8));
    });
  });

  describe("listActiveShareLinks", () => {
    it("lists only active links and excludes expired/revoked", async () => {
      const active = await service.createShareLink({
        snippetId: "snip",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const expired = await service.createShareLink({
        snippetId: "snip",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      // Force-expire by rewriting store record
      const expiredRecord = await store.findById(expired.id);
      await store.upsert({
        ...expiredRecord!,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      const revoked = await service.createShareLink({ snippetId: "snip" });
      await service.revokeShareLink(revoked.id, "G1");

      const other = await service.createShareLink({ snippetId: "other" });

      const listed = await service.listActiveShareLinks("snip");
      expect(listed.map((l) => l.id)).toEqual([active.id]);
      expect(listed.every((l) => l.status === "active")).toBe(true);
      expect(listed.find((l) => l.id === other.id)).toBeUndefined();
    });
  });

  describe("revokeShareLink", () => {
    it("revokes immediately so validation fails", async () => {
      const link = await service.createShareLink({ snippetId: "snip" });
      const before = await service.validateShareLink(link.token);
      expect(before.valid).toBe(true);

      const revoked = await service.revokeShareLink(link.id, "Gowner");
      expect(revoked.status).toBe("revoked");

      const after = await service.validateShareLink(link.token);
      expect(after.valid).toBe(false);
      expect(after.reason).toBe("revoked");
    });

    it("throws when link is missing", async () => {
      await expect(service.revokeShareLink("missing")).rejects.toThrow(
        "Share link not found",
      );
    });
  });

  describe("validateShareLink", () => {
    it("returns valid metadata without snippet content", async () => {
      const link = await service.createShareLink({
        snippetId: "abc123",
        visibility: "read-write",
      });
      const result = await service.validateShareLink(link.token);
      expect(result.valid).toBe(true);
      expect(result.link?.snippetId).toBe("abc123");
      expect(result.link?.visibility).toBe("read-write");
      expect(result.link as any).not.toHaveProperty("code");
    });

    it("enforces expiration automatically", async () => {
      const link = await service.createShareLink({
        snippetId: "abc123",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const record = await store.findById(link.id);
      await store.upsert({
        ...record!,
        expiresAt: new Date(Date.now() - 1).toISOString(),
      });

      const result = await service.validateShareLink(link.token);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("returns not_found for unknown tokens", async () => {
      const result = await service.validateShareLink("deadbeef".repeat(8));
      expect(result).toEqual({ valid: false, reason: "not_found" });
    });

    it("records validation audit events", async () => {
      const link = await service.createShareLink({ snippetId: "s1" });
      await service.validateShareLink(link.token);
      const audit = await service.getAuditLog(link.id);
      expect(audit.some((a) => a.action === "validated")).toBe(true);
    });
  });
});
