import { NextRequest, NextResponse } from "next/server";
import {
  snippetAttestationService,
  SnippetAttestationAuthError,
  SnippetAttestationValidationError,
} from "@/lib/snippet-attestation-service";

/**
 * POST /api/snippets/[id]/attest
 * Create a Stellar-backed attestation for the current snippet content.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) || {};
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const headerWallet = req.headers.get("x-wallet-address");
    const attestedBy = body.attestedBy || body.walletAddress || headerWallet || "";

    const attestation = await snippetAttestationService.createAttestation({
      snippetId: id,
      code: body.code,
      attestedBy,
      stellarTransactionHash: body.stellarTransactionHash || body.transactionHash,
      network: body.network,
      ledger: body.ledger,
      clientProvidedHash: body.contentHash,
    });

    return NextResponse.json({ attestation }, { status: 201 });
  } catch (error) {
    if (error instanceof SnippetAttestationAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof SnippetAttestationValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to create snippet attestation." },
      { status: 500 },
    );
  }
}
