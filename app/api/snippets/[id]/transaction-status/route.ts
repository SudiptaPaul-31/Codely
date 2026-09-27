import { NextRequest, NextResponse } from "next/server";
import { StellarRecoveryService } from "@/lib/stellar-recovery.service";

const service = new StellarRecoveryService();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const [transactions, snippetTransactions] = await Promise.all([
      service.getBySnippetId(id),
      service.getSnippetTransactions(id),
    ]);

    return NextResponse.json({
      snippetId: id,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        txType: tx.tx_type,
        status: tx.status,
        idempotencyKey: tx.idempotency_key,
        stellarTxHash: tx.stellar_tx_hash,
        stellarLedger: tx.stellar_ledger,
        attemptCount: tx.attempt_count,
        maxAttempts: tx.max_attempts,
        lastError: tx.last_error,
        callbackStatus: tx.callback_status,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
      })),
      // Stellar transactions whose memo references this snippet.
      snippetTransactions: snippetTransactions.map((tx) => ({
        id: tx.id,
        memoRef: tx.memoRef,
        transactionHash: tx.transactionHash,
        ledgerSequence: tx.ledgerSequence,
        status: tx.status,
        txType: tx.txType,
        errorMessage: tx.errorMessage,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[TransactionStatus] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction status" },
      { status: 500 },
    );
  }
}
