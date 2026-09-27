export type SnippetTransactionStatus = "pending" | "confirmed" | "failed";

/**
 * A Stellar transaction that carries a snippet memo reference.
 *
 * The row is created as soon as the transaction is submitted (`pending`), and
 * its status follows the transaction through to `confirmed` (ledger sequence
 * recorded) or `failed`.
 */
export interface SnippetTransaction {
  id: string;
  snippetId: string;
  transactionHash: string;
  memoRef: string;
  ledgerSequence: number | null;
  status: SnippetTransactionStatus;
  txType: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetTransactionRow {
  id: string;
  snippet_id: string;
  transaction_hash: string;
  memo_ref: string;
  ledger_sequence: number | null;
  status: SnippetTransactionStatus;
  tx_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkSnippetTransactionParams {
  snippetId: string;
  transactionHash: string;
  memoRef: string;
  txType?: string | null;
}
