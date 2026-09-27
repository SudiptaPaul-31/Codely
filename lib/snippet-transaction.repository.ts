import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { assertSnippetMemoRef } from "@/lib/snippet-memo";
import type {
  LinkSnippetTransactionParams,
  SnippetTransaction,
  SnippetTransactionRow,
} from "@/lib/snippet-transaction.types";

export type {
  LinkSnippetTransactionParams,
  SnippetTransaction,
  SnippetTransactionRow,
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

function toSnippetTransaction(row: SnippetTransactionRow): SnippetTransaction {
  return {
    id: row.id,
    snippetId: row.snippet_id,
    transactionHash: row.transaction_hash,
    memoRef: row.memo_ref,
    ledgerSequence: row.ledger_sequence ? Number(row.ledger_sequence) : null,
    status: row.status,
    txType: row.tx_type,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SnippetTransactionRepositoryLike {
  linkPending(params: LinkSnippetTransactionParams): Promise<SnippetTransaction>;
  markConfirmed(params: {
    transactionHash: string;
    ledgerSequence?: number | null;
  }): Promise<void>;
  markFailed(params: {
    transactionHash: string;
    errorMessage: string;
  }): Promise<void>;
  findBySnippetId(snippetId: string): Promise<SnippetTransaction[]>;
  findByTransactionHash(transactionHash: string): Promise<SnippetTransaction | null>;
  findByMemoRef(memoRef: string): Promise<SnippetTransaction[]>;
}

/**
 * Persists the many-to-many association between snippets and the Stellar
 * transactions that reference them through a memo.
 */
export class SnippetTransactionRepository implements SnippetTransactionRepositoryLike {
  /**
   * Record a submitted transaction against a snippet.
   *
   * The memo reference is validated (and rejected when malformed or longer than
   * Stellar's 28-byte limit) before anything is written.
   */
  async linkPending(
    params: LinkSnippetTransactionParams,
  ): Promise<SnippetTransaction> {
    const memoRef = assertSnippetMemoRef(params.memoRef);

    if (!params.snippetId || !params.transactionHash) {
      throw new Error("snippetId and transactionHash are required");
    }

    const result = (await getSql()`
      INSERT INTO snippet_transactions (
        id,
        snippet_id,
        transaction_hash,
        memo_ref,
        status,
        tx_type
      )
      VALUES (
        ${crypto.randomUUID()},
        ${params.snippetId},
        ${params.transactionHash},
        ${memoRef},
        'pending',
        ${params.txType ?? null}
      )
      ON CONFLICT (snippet_id, transaction_hash) DO UPDATE SET
        memo_ref = EXCLUDED.memo_ref,
        status = 'pending',
        error_message = NULL,
        updated_at = NOW()
      RETURNING *
    `) as SnippetTransactionRow[];

    return toSnippetTransaction(result[0]);
  }

  async markConfirmed(params: {
    transactionHash: string;
    ledgerSequence?: number | null;
  }): Promise<void> {
    await getSql()`
      UPDATE snippet_transactions
      SET
        status = 'confirmed',
        ledger_sequence = COALESCE(${params.ledgerSequence ?? null}, ledger_sequence),
        error_message = NULL,
        updated_at = NOW()
      WHERE transaction_hash = ${params.transactionHash}
        AND status <> 'confirmed'
    `;
  }

  async markFailed(params: {
    transactionHash: string;
    errorMessage: string;
  }): Promise<void> {
    await getSql()`
      UPDATE snippet_transactions
      SET
        status = 'failed',
        error_message = ${params.errorMessage},
        updated_at = NOW()
      WHERE transaction_hash = ${params.transactionHash}
        AND status = 'pending'
    `;
  }

  async findBySnippetId(snippetId: string): Promise<SnippetTransaction[]> {
    const rows = (await getSql()`
      SELECT * FROM snippet_transactions
      WHERE snippet_id = ${snippetId}
      ORDER BY created_at DESC
    `) as SnippetTransactionRow[];

    return rows.map(toSnippetTransaction);
  }

  async findByTransactionHash(
    transactionHash: string,
  ): Promise<SnippetTransaction | null> {
    const rows = (await getSql()`
      SELECT * FROM snippet_transactions
      WHERE transaction_hash = ${transactionHash}
      LIMIT 1
    `) as SnippetTransactionRow[];

    return rows.length ? toSnippetTransaction(rows[0]) : null;
  }

  async findByMemoRef(memoRef: string): Promise<SnippetTransaction[]> {
    const rows = (await getSql()`
      SELECT * FROM snippet_transactions
      WHERE memo_ref = ${memoRef}
      ORDER BY created_at DESC
    `) as SnippetTransactionRow[];

    return rows.map(toSnippetTransaction);
  }
}
