export type TransactionStatus = "pending" | "successful" | "failed";

export type TransactionLifecycle =
  | "preparing"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

/**
 * Stored record for the confirmation lifecycle of a Stellar transaction.
 *
 * State machine:
 *   preparing → submitted → confirming → confirmed
 *                                     → failed
 */
export interface TransactionConfirmation {
  id: string;
  stellarTxHash: string;
  status: TransactionStatus;
  lifecycle: TransactionLifecycle;
  walletAddress: string;
  memo?: string | null;
  ledger?: number | null;
  metadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
  retryCount: number;
  maxRetries: number;
  lastPolledAt?: string | null;
  confirmedAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionConfirmationRow {
  id: string;
  stellar_tx_hash: string;
  status: TransactionStatus;
  lifecycle: TransactionLifecycle;
  wallet_address: string;
  memo: string | null;
  ledger: number | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  last_polled_at: string | null;
  confirmed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StellarTxResponse {
  hash: string;
  ledger: number;
  successful: boolean;
  result_xdr?: string;
  result_meta_xdr?: string;
}

/**
 * Configuration for polling Stellar Horizon for confirmation.
 */
export interface PollingConfig {
  /** Interval between polls in milliseconds (default 3000). */
  pollIntervalMs: number;
  /** Maximum number of poll attempts before marking as failed (default 20). */
  maxPollAttempts: number;
  /** Maximum number of retries for submission/monitoring failures (default 3). */
  maxRetries: number;
  /** Base delay for exponential backoff in ms (default 1000). */
  retryBaseDelayMs: number;
  /** Maximum backoff delay in ms (default 30000). */
  retryMaxDelayMs: number;
}