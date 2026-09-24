import crypto from "crypto";
import { logEvent } from "@/lib/audit";

export type ShareLinkVisibility = "read-only" | "read-write";

export type ShareLinkStatus = "active" | "expired" | "revoked";

export type ShareLinkAuditAction = "created" | "revoked" | "validated";

export interface ShareLinkRecord {
  id: string;
  snippetId: string;
  token: string;
  visibility: ShareLinkVisibility;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

/** Public metadata only — never includes snippet content. */
export interface ShareLinkMetadata {
  id: string;
  snippetId: string;
  token: string;
  shareUrl: string;
  visibility: ShareLinkVisibility;
  expiresAt: string | null;
  createdAt: string;
  status: ShareLinkStatus;
}

export interface CreateShareLinkInput {
  snippetId: string;
  visibility?: ShareLinkVisibility;
  expiresAt?: string | Date | null;
  createdBy?: string | null;
}

export interface ValidateShareLinkResult {
  valid: boolean;
  reason?: "not_found" | "revoked" | "expired";
  link?: ShareLinkMetadata;
}

export interface ShareLinkAuditEntry {
  id: string;
  linkId: string;
  snippetId: string;
  action: ShareLinkAuditAction;
  actor: string | null;
  tokenPrefix: string;
  at: string;
  details?: Record<string, unknown>;
}

export interface ShareLinkStore {
  upsert(link: ShareLinkRecord): Promise<ShareLinkRecord>;
  findById(id: string): Promise<ShareLinkRecord | null>;
  findByToken(token: string): Promise<ShareLinkRecord | null>;
  findBySnippetId(snippetId: string): Promise<ShareLinkRecord[]>;
  appendAudit(entry: ShareLinkAuditEntry): Promise<void>;
  listAudit(linkId?: string): Promise<ShareLinkAuditEntry[]>;
}

/** In-memory store used by default (tests + local) and as DB fallback. */
export class InMemoryShareLinkStore implements ShareLinkStore {
  private links = new Map<string, ShareLinkRecord>();
  private byToken = new Map<string, string>();
  private audit: ShareLinkAuditEntry[] = [];

  async upsert(link: ShareLinkRecord): Promise<ShareLinkRecord> {
    this.links.set(link.id, { ...link });
    this.byToken.set(link.token, link.id);
    return { ...link };
  }

  async findById(id: string): Promise<ShareLinkRecord | null> {
    const link = this.links.get(id);
    return link ? { ...link } : null;
  }

  async findByToken(token: string): Promise<ShareLinkRecord | null> {
    const id = this.byToken.get(token);
    if (!id) return null;
    return this.findById(id);
  }

  async findBySnippetId(snippetId: string): Promise<ShareLinkRecord[]> {
    return [...this.links.values()]
      .filter((l) => l.snippetId === snippetId)
      .map((l) => ({ ...l }));
  }

  async appendAudit(entry: ShareLinkAuditEntry): Promise<void> {
    this.audit.push({ ...entry, details: entry.details ? { ...entry.details } : undefined });
  }

  async listAudit(linkId?: string): Promise<ShareLinkAuditEntry[]> {
    const rows = linkId ? this.audit.filter((a) => a.linkId === linkId) : this.audit;
    return rows.map((a) => ({ ...a, details: a.details ? { ...a.details } : undefined }));
  }

  clear(): void {
    this.links.clear();
    this.byToken.clear();
    this.audit = [];
  }
}

const defaultStore = new InMemoryShareLinkStore();

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid expiresAt value");
  }
  return d.toISOString();
}

function computeStatus(link: ShareLinkRecord, now = new Date()): ShareLinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

function buildShareUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/api/share-links/${token}/validate`;
}

function toMetadata(link: ShareLinkRecord, now = new Date()): ShareLinkMetadata {
  return {
    id: link.id,
    snippetId: link.snippetId,
    token: link.token,
    shareUrl: buildShareUrl(link.token),
    visibility: link.visibility,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    status: computeStatus(link, now),
  };
}

export class ShareLinkManagementService {
  constructor(private store: ShareLinkStore = defaultStore) {}

  /** Cryptographically strong, non-guessable token (256-bit hex). */
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async createShareLink(input: CreateShareLinkInput): Promise<ShareLinkMetadata> {
    const snippetId = (input.snippetId || "").trim();
    if (!snippetId) {
      throw new Error("snippetId is required");
    }

    const visibility: ShareLinkVisibility =
      input.visibility === "read-write" ? "read-write" : "read-only";

    const expiresAt = toIso(input.expiresAt ?? null);
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new Error("expiresAt must be in the future");
    }

    const now = new Date().toISOString();
    const token = this.generateSecureToken();
    const record: ShareLinkRecord = {
      id: crypto.randomUUID(),
      snippetId,
      token,
      visibility,
      expiresAt,
      createdAt: now,
      createdBy: input.createdBy ?? null,
      revokedAt: null,
      revokedBy: null,
    };

    await this.store.upsert(record);
    await this.recordAudit(record, "created", input.createdBy ?? null, {
      visibility,
      expiresAt,
    });

    // Best-effort durable audit (DB); never expose snippet content.
    void logEvent(
      "share_link.created",
      input.createdBy || "anonymous",
      snippetId,
      JSON.stringify({ linkId: record.id, tokenPrefix: token.slice(0, 8), visibility }),
    );

    return toMetadata(record);
  }

  /** Returns only active (non-revoked, non-expired) links for a snippet. */
  async listActiveShareLinks(snippetId: string): Promise<ShareLinkMetadata[]> {
    const id = (snippetId || "").trim();
    if (!id) {
      throw new Error("snippetId is required");
    }
    const now = new Date();
    const links = await this.store.findBySnippetId(id);
    return links
      .filter((l) => computeStatus(l, now) === "active")
      .map((l) => toMetadata(l, now))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeShareLink(
    linkId: string,
    revokedBy: string | null = null,
  ): Promise<ShareLinkMetadata> {
    const id = (linkId || "").trim();
    if (!id) {
      throw new Error("link id is required");
    }

    const existing = await this.store.findById(id);
    if (!existing) {
      throw new Error("Share link not found");
    }
    if (existing.revokedAt) {
      throw new Error("Share link already revoked");
    }

    const updated: ShareLinkRecord = {
      ...existing,
      revokedAt: new Date().toISOString(),
      revokedBy,
    };
    await this.store.upsert(updated);
    await this.recordAudit(updated, "revoked", revokedBy, {});

    void logEvent(
      "share_link.revoked",
      revokedBy || "anonymous",
      updated.snippetId,
      JSON.stringify({ linkId: updated.id, tokenPrefix: updated.token.slice(0, 8) }),
    );

    return toMetadata(updated);
  }

  async validateShareLink(token: string): Promise<ValidateShareLinkResult> {
    const t = (token || "").trim();
    if (!t) {
      return { valid: false, reason: "not_found" };
    }

    const existing = await this.store.findByToken(t);
    if (!existing) {
      return { valid: false, reason: "not_found" };
    }

    const now = new Date();
    const status = computeStatus(existing, now);
    const meta = toMetadata(existing, now);

    await this.recordAudit(existing, "validated", null, { status, valid: status === "active" });

    void logEvent(
      "share_link.validated",
      "system",
      existing.snippetId,
      JSON.stringify({
        linkId: existing.id,
        tokenPrefix: existing.token.slice(0, 8),
        status,
        valid: status === "active",
      }),
    );

    if (status === "revoked") {
      return { valid: false, reason: "revoked", link: meta };
    }
    if (status === "expired") {
      return { valid: false, reason: "expired", link: meta };
    }
    return { valid: true, link: meta };
  }

  async getAuditLog(linkId?: string): Promise<ShareLinkAuditEntry[]> {
    return this.store.listAudit(linkId);
  }

  private async recordAudit(
    link: ShareLinkRecord,
    action: ShareLinkAuditAction,
    actor: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.store.appendAudit({
      id: crypto.randomUUID(),
      linkId: link.id,
      snippetId: link.snippetId,
      action,
      actor,
      tokenPrefix: link.token.slice(0, 8),
      at: new Date().toISOString(),
      details,
    });
  }
}

/** Shared singleton for API routes. */
export const shareLinkManagementService = new ShareLinkManagementService();
