import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import type {
  RecordSnippetVerificationEventParams,
  SnippetVerificationHistoryEvent,
  SnippetVerificationHistoryQueryOptions,
  SnippetVerificationHistoryRow,
  SnippetVerificationStatus,
} from "./snippet-verification-history.types";

export type {
  RecordSnippetVerificationEventParams,
  SnippetVerificationHistoryEvent,
  SnippetVerificationHistoryQueryOptions,
  SnippetVerificationStatus,
};

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

function toEvent(row: SnippetVerificationHistoryRow): SnippetVerificationHistoryEvent {
  return {
    id: row.id,
    snippetId: row.snippet_id,
    transactionHash: row.transaction_hash,
    ledgerSequence:
      row.ledger_sequence === null || row.ledger_sequence === undefined
        ? null
        : Number(row.ledger_sequence),
    status: row.status,
    txType: row.tx_type,
    errorMessage: row.error_message,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SnippetVerificationHistoryRepositoryLike {
  recordEvent(params: RecordSnippetVerificationEventParams): Promise<void>;
  findBySnippetId(
    snippetId: string,
    options?: SnippetVerificationHistoryQueryOptions,
  ): Promise<{ data: SnippetVerificationHistoryEvent[]; total: number }>;
  snippetExists(snippetId: string): Promise<boolean>;
}

/**
 * Persists the append-only history of blockchain verification events for
 * snippets. A transaction hash is globally unique, so reprocessing the same
 * transaction converges the existing row rather than creating a duplicate.
 */
export class SnippetVerificationHistoryRepository
  implements SnippetVerificationHistoryRepositoryLike
{
  /**
   * Record a verification event for a snippet.
   *
   * The UNIQUE constraint on transaction_hash makes the write idempotent:
   * a conflict updates the existing row instead of failing. Confirmed rows
   * are never downgraded, and the first ledger sequence / verification
   * timestamp wins (COALESCE) so reprocessing cannot corrupt history.
   */
  async recordEvent(
    params: RecordSnippetVerificationEventParams,
  ): Promise<void> {
    if (!params.snippetId || !params.transactionHash) {
      throw new Error("snippetId and transactionHash are required");
    }

    const verifiedAt = params.verifiedAt
      ? params.verifiedAt instanceof Date
        ? params.verifiedAt
        : new Date(params.verifiedAt)
      : null;

    await getSql()`
      INSERT INTO snippet_verification_history (
        id,
        snippet_id,
        transaction_hash,
        ledger_sequence,
        status,
        tx_type,
        error_message,
        verified_at
      )
      VALUES (
        ${crypto.randomUUID()},
        ${params.snippetId},
        ${params.transactionHash},
        ${params.ledgerSequence ?? null},
        ${params.status},
        ${params.txType ?? null},
        ${params.errorMessage ?? null},
        ${verifiedAt}
      )
      ON CONFLICT (transaction_hash) DO UPDATE SET
        status = EXCLUDED.status,
        ledger_sequence = COALESCE(EXCLUDED.ledger_sequence, snippet_verification_history.ledger_sequence),
        verified_at = COALESCE(EXCLUDED.verified_at, snippet_verification_history.verified_at),
        error_message = EXCLUDED.error_message,
        tx_type = COALESCE(snippet_verification_history.tx_type, EXCLUDED.tx_type),
        updated_at = NOW()
      WHERE snippet_verification_history.status <> 'confirmed'
        OR EXCLUDED.status = 'confirmed'
    `;
  }

  /**
   * Chronological verification history for a snippet (oldest first),
   * with the total row count for pagination.
   */
  async findBySnippetId(
    snippetId: string,
    options?: SnippetVerificationHistoryQueryOptions,
  ): Promise<{ data: SnippetVerificationHistoryEvent[]; total: number }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const countResult = (await getSql()`
      SELECT COUNT(*) as total FROM snippet_verification_history
      WHERE snippet_id = ${snippetId}
    `) as Array<{ total: string | number }>;
    const total = Number(countResult[0]?.total ?? 0);

    const rows = (await getSql()`
      SELECT * FROM snippet_verification_history
      WHERE snippet_id = ${snippetId}
      ORDER BY created_at ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as SnippetVerificationHistoryRow[];

    return {
      data: rows.map(toEvent),
      total,
    };
  }

  /** Whether a snippet with the given id exists. */
  async snippetExists(snippetId: string): Promise<boolean> {
    const result = (await getSql()`
      SELECT 1 FROM snippets
      WHERE id = ${snippetId}
      LIMIT 1
    `) as Array<unknown>;

    return result.length > 0;
  }
}
