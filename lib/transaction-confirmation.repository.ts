import { neon } from "@neondatabase/serverless";
import type {
  TransactionConfirmation,
  TransactionConfirmationRow,
  TransactionLifecycle,
  TransactionStatus,
} from "@/lib/transaction-confirmation.types";

export type {
  TransactionConfirmation,
  TransactionConfirmationRow,
  TransactionLifecycle,
  TransactionStatus,
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

function toConfirmation(row: TransactionConfirmationRow): TransactionConfirmation {
  return {
    id: row.id,
    stellarTxHash: row.stellar_tx_hash,
    status: row.status,
    lifecycle: row.lifecycle,
    walletAddress: row.wallet_address,
    memo: row.memo,
    ledger: row.ledger ? Number(row.ledger) : null,
    metadata: row.metadata,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    lastPolledAt: row.last_polled_at,
    confirmedAt: row.confirmed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TransactionConfirmationRepositoryLike {
  insert(params: {
    id: string;
    stellarTxHash: string;
    walletAddress: string;
    memo?: string | null;
    metadata?: Record<string, unknown> | null;
    maxRetries?: number;
  }): Promise<TransactionConfirmation>;
  updateLifecycle(
    id: string,
    lifecycle: TransactionLifecycle,
    status: TransactionStatus,
    updates?: {
      ledger?: number | null;
      errorMessage?: string | null;
      confirmedAt?: string | null;
      failedAt?: string | null;
    },
  ): Promise<void>;
  incrementRetry(id: string, errorMessage: string): Promise<void>;
  updateLastPolledAt(id: string): Promise<void>;
  findByHash(stellarTxHash: string): Promise<TransactionConfirmation | null>;
  findByWallet(
    walletAddress: string,
    page?: number,
    pageSize?: number,
  ): Promise<{ confirmations: TransactionConfirmation[]; total: number }>;
  findPendingForPolling(): Promise<TransactionConfirmation[]>;
}

export class TransactionConfirmationRepository
  implements TransactionConfirmationRepositoryLike
{
  async insert(params: {
    id: string;
    stellarTxHash: string;
    walletAddress: string;
    memo?: string | null;
    metadata?: Record<string, unknown> | null;
    maxRetries?: number;
  }): Promise<TransactionConfirmation> {
    const result = (await getSql()`
      INSERT INTO transaction_confirmations (
        id,
        stellar_tx_hash,
        status,
        lifecycle,
        wallet_address,
        memo,
        metadata,
        max_retries
      )
      VALUES (
        ${params.id},
        ${params.stellarTxHash},
        'pending',
        'preparing',
        ${params.walletAddress},
        ${params.memo ?? null},
        ${params.metadata ? JSON.stringify(params.metadata) : null}::jsonb,
        ${params.maxRetries ?? 3}
      )
      RETURNING *
    `) as TransactionConfirmationRow[];

    return toConfirmation(result[0]);
  }

  async updateLifecycle(
    id: string,
    lifecycle: TransactionLifecycle,
    status: TransactionStatus,
    updates?: {
      ledger?: number | null;
      errorMessage?: string | null;
      confirmedAt?: string | null;
      failedAt?: string | null;
    },
  ): Promise<void> {
    await getSql()`
      UPDATE transaction_confirmations
      SET
        lifecycle = ${lifecycle},
        status = ${status},
        ledger = COALESCE(${updates?.ledger ?? null}, ledger),
        error_message = ${updates?.errorMessage ?? null},
        confirmed_at = COALESCE(${updates?.confirmedAt ?? null}::timestamptz, confirmed_at),
        failed_at = COALESCE(${updates?.failedAt ?? null}::timestamptz, failed_at),
        updated_at = NOW()
      WHERE id = ${id}
        AND lifecycle NOT IN ('confirmed', 'failed')
    `;
  }

  async incrementRetry(id: string, errorMessage: string): Promise<void> {
    await getSql()`
      UPDATE transaction_confirmations
      SET
        retry_count = retry_count + 1,
        error_message = ${errorMessage},
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  async updateLastPolledAt(id: string): Promise<void> {
    await getSql()`
      UPDATE transaction_confirmations
      SET
        last_polled_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
    `;
  }

  async findByHash(
    stellarTxHash: string,
  ): Promise<TransactionConfirmation | null> {
    const result = (await getSql()`
      SELECT * FROM transaction_confirmations
      WHERE stellar_tx_hash = ${stellarTxHash}
      LIMIT 1
    `) as TransactionConfirmationRow[];

    return result.length ? toConfirmation(result[0]) : null;
  }

  async findByWallet(
    walletAddress: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ confirmations: TransactionConfirmation[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const countResult = await getSql()`
      SELECT COUNT(*)::int AS total
      FROM transaction_confirmations
      WHERE wallet_address = ${walletAddress}
    `;
    const total = (countResult as Array<{ total: number }>)[0]?.total ?? 0;

    const rows = (await getSql()`
      SELECT *
      FROM transaction_confirmations
      WHERE wallet_address = ${walletAddress}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `) as TransactionConfirmationRow[];

    return {
      confirmations: rows.map(toConfirmation),
      total,
    };
  }

  async findPendingForPolling(): Promise<TransactionConfirmation[]> {
    const rows = (await getSql()`
      SELECT *
      FROM transaction_confirmations
      WHERE lifecycle IN ('submitted', 'confirming')
        AND retry_count < max_retries
      ORDER BY last_polled_at ASC NULLS FIRST
      LIMIT 50
    `) as TransactionConfirmationRow[];

    return rows.map(toConfirmation);
  }
}