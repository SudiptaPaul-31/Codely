export type SnippetVerificationStatus = "pending" | "confirmed" | "failed";

/**
 * A blockchain verification event for a snippet.
 *
 * One row is kept per transaction hash: it is created when the transaction is
 * submitted (`pending`) and converges to `confirmed` (ledger sequence and
 * verification timestamp recorded) or `failed`. Reprocessing the same
 * transaction updates the existing row instead of creating a duplicate.
 */
export interface SnippetVerificationHistoryEvent {
  id: string;
  snippetId: string;
  transactionHash: string;
  ledgerSequence: number | null;
  status: SnippetVerificationStatus;
  txType: string | null;
  errorMessage: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetVerificationHistoryRow {
  id: string;
  snippet_id: string;
  transaction_hash: string;
  ledger_sequence: number | string | null;
  status: SnippetVerificationStatus;
  tx_type: string | null;
  error_message: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordSnippetVerificationEventParams {
  snippetId: string;
  transactionHash: string;
  status: SnippetVerificationStatus;
  txType?: string | null;
  ledgerSequence?: number | null;
  errorMessage?: string | null;
  verifiedAt?: Date | string | null;
}

export interface SnippetVerificationHistoryQueryOptions {
  limit?: number;
  offset?: number;
}
