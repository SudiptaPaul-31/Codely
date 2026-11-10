import { NextRequest, NextResponse } from "next/server";
import {
  snippetAttestationService,
  SnippetAttestationAuthError,
  SnippetAttestationValidationError,
} from "@/lib/snippet-attestation-service";

/**
 * GET /api/snippets/[id]/verify
 * Verify whether the current snippet content matches the attested hash and on-chain Stellar transaction.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const attestationId = url.searchParams.get("attestationId") || undefined;
    const actorWallet = req.headers.get("x-wallet-address") || null;

    const outcome = await snippetAttestationService.verifySnippetAttestation(
      id,
      {
        attestationId,
        actorWallet,
      },
    );

    return NextResponse.json(outcome, { status: 200 });
  } catch (error) {
    if (error instanceof SnippetAttestationValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to verify snippet attestation." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/snippets/[id]/verify
 * Create or verify a snippet attestation.
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
      body = {};
    }

    const actorWallet =
      body.attestedBy ||
      body.walletAddress ||
      req.headers.get("x-wallet-address") ||
      "";

    const attestation = await snippetAttestationService.createAttestation({
      snippetId: id,
      code: body.code,
      attestedBy: actorWallet,
      stellarTransactionHash:
        body.stellarTransactionHash || body.transactionHash,
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
      { error: "Failed to anchor snippet attestation." },
      { status: 500 },
    );
  }
}
