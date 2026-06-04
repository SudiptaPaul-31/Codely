import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Pagination options interface
export interface PaginationOptions {
  limit: number;
  offset: number;
}

// Paginated result interface
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Verification record interface
export interface VerificationRecord {
  id: string;
  snippet_id: string;
  wallet_address: string;
  signature: string;
  message: string;
  verified_at: Date;
  is_revoked: boolean;
  revoked_at: Date | null;
}

// Verification attempt log interface
export interface VerificationAttemptLog {
  id: string;
  snippet_id: string;
  wallet_address: string;
  action: string;
  success: boolean;
  error_message: string | null;
  ip_address: string | null;
  attempted_at: Date;
}

export class VerificationRepository {
  private sql;

  constructor() {
    // Initialize the database connection
    this.sql = neon(process.env.DATABASE_URL!);
  }

  /**
   * Record a verification for a snippet
   */
  async recordVerification(
    snippetId: string,
    walletAddress: string,
    signature: string,
    message: string,
  ) {
    const id = crypto.randomUUID();
    const verifiedAt = new Date();

    const result = await this.sql`
      INSERT INTO snippet_verifications (id, snippet_id, wallet_address, signature, message, verified_at, is_revoked)
      VALUES (${id}, ${snippetId}, ${walletAddress}, ${signature}, ${message}, ${verifiedAt}, false)
      RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Get the latest verification status for a snippet
   */
  async getVerificationStatus(snippetId: string) {
    const result = await this.sql`
      SELECT * FROM snippet_verifications
      WHERE snippet_id = ${snippetId} AND is_revoked = false
      ORDER BY verified_at DESC
      LIMIT 1
    `;
    return result[0] || null;
  }

  /**
   * Get all verifications by a wallet address with pagination
   */
  async getVerificationsByWallet(
    walletAddress: string,
    options?: PaginationOptions,
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Get total count
    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM snippet_verifications
      WHERE wallet_address = ${walletAddress} AND is_revoked = false
    `;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated verifications
    const result = await this.sql`
      SELECT * FROM snippet_verifications
      WHERE wallet_address = ${walletAddress} AND is_revoked = false
      ORDER BY verified_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const data = result as any[];

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Get audit log for a snippet with pagination
   */
  async getVerificationAuditLog(
    snippetId: string,
    options?: PaginationOptions,
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Get total count
    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM verification_attempt_logs
      WHERE snippet_id = ${snippetId}
    `;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated audit logs
    const result = await this.sql`
      SELECT * FROM verification_attempt_logs
      WHERE snippet_id = ${snippetId}
      ORDER BY attempted_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const data = result as any[];

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  /**
   * Log a verification attempt
   */
  async logVerificationAttempt(
    snippetId: string,
    walletAddress: string,
    action: string,
    success: boolean,
    errorMessage?: string,
    ipAddress?: string,
  ) {
    const id = crypto.randomUUID();
    const attemptedAt = new Date();

    const result = await this.sql`
      INSERT INTO verification_attempt_logs (id, snippet_id, wallet_address, action, success, error_message, ip_address, attempted_at)
      VALUES (${id}, ${snippetId}, ${walletAddress}, ${action}, ${success}, ${errorMessage || null}, ${ipAddress || null}, ${attemptedAt})
      RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Revoke a verification
   */
  async revokeVerification(snippetId: string, walletAddress: string) {
    const revokedAt = new Date();

    const result = await this.sql`
      UPDATE snippet_verifications
      SET is_revoked = true, revoked_at = ${revokedAt}
      WHERE snippet_id = ${snippetId} AND wallet_address = ${walletAddress} AND is_revoked = false
      RETURNING *
    `;
    return result[0] || null;
  }
}
