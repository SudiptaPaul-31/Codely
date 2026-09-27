import { NextRequest, NextResponse } from "next/server";
import { StellarTransactionConfirmationService } from "@/lib/transaction-confirmation.service";

/**
 * GET /api/transactions/status?hash=<stellar_tx_hash>
 *
 * Look up the confirmation status of a Stellar transaction by its hash.
 * Supports optional paginated wallet listing.
 */
export async function GET(req: NextRequest) {
  try {
    const service = new StellarTransactionConfirmationService();
    const url = new URL(req.url);
    const hash = url.searchParams.get("hash");
    const wallet = url.searchParams.get("wallet");

    // Lookup by hash
    if (hash) {
      const confirmation = await service.getStatusByHash(hash);
      if (!confirmation) {
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(confirmation);
    }

    // Paginated wallet listing
    if (wallet) {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = parseInt(url.searchParams.get("pageSize") || "20");

      const result = await service.getByWallet(wallet, page, pageSize);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Either 'hash' or 'wallet' query parameter is required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[TransactionStatus] GET error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch transaction status",
      },
      { status: 500 },
    );
  }
}