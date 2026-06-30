import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

export interface SnippetShare {
  id: string;
  snippet_id: string;
  share_token: string;
  is_read_only: boolean;
  expires_at: string | null;
  created_by_wallet_address: string;
  revoked_at: string | null;
  revoked_by_wallet_address: string | null;
  created_at: string;
}

export interface CreateShareDTO {
  snippetId: string;
  isReadOnly?: boolean;
  expiresAt?: Date | null;
  createdByWalletAddress: string;
}

export class ShareRepository {
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async createShare(data: CreateShareDTO): Promise<SnippetShare> {
    const shareToken = this.generateSecureToken();
    const now = new Date();
    const expiresAt = data.expiresAt ?? null;

    const result = await sql`
      INSERT INTO snippet_shares (snippet_id, share_token, is_read_only, expires_at, created_by_wallet_address, created_at)
      VALUES (${data.snippetId}, ${shareToken}, ${data.isReadOnly ?? true}, ${expiresAt}, ${data.createdByWalletAddress}, ${now})
      RETURNING *
    `;

    return result[0] as SnippetShare;
  }

  async findByToken(shareToken: string): Promise<SnippetShare | null> {
    const result = await sql`
      SELECT * FROM snippet_shares
      WHERE share_token = ${shareToken}
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    return result[0] as SnippetShare | null;
  }

  async findActiveShareBySnippet(snippetId: string): Promise<SnippetShare | null> {
    const result = await sql`
      SELECT * FROM snippet_shares
      WHERE snippet_id = ${snippetId}
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    return result[0] as SnippetShare | null;
  }

  async revokeShare(
    snippetId: string,
    revokedByWalletAddress: string,
  ): Promise<boolean> {
    const now = new Date();

    const result = await sql`
      UPDATE snippet_shares
      SET revoked_at = ${now}, revoked_by_wallet_address = ${revokedByWalletAddress}
      WHERE snippet_id = ${snippetId}
        AND revoked_at IS NULL
      RETURNING id
    `;

    return result.length > 0;
  }

  async revokeByToken(
    shareToken: string,
    revokedByWalletAddress: string,
  ): Promise<boolean> {
    const now = new Date();

    const result = await sql`
      UPDATE snippet_shares
      SET revoked_at = ${now}, revoked_by_wallet_address = ${revokedByWalletAddress}
      WHERE share_token = ${shareToken}
        AND revoked_at IS NULL
      RETURNING id
    `;

    return result.length > 0;
  }

  async getShareDetails(snippetId: string): Promise<SnippetShare | null> {
    const result = await sql`
      SELECT * FROM snippet_shares
      WHERE snippet_id = ${snippetId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result[0] as SnippetShare | null;
  }
}