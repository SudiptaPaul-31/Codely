import { NextRequest, NextResponse } from "next/server";
import {
  ownershipProofService,
  OwnershipProofAuthError,
  OwnershipProofValidationError,
} from "@/lib/ownership-proof-service";

/**
 * POST /api/snippets/[id]/ownership-proof
 * Generate an exportable Stellar wallet ownership proof for a snippet.
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
    const walletAddress = body.walletAddress || headerWallet || "";
    const actorWallet = headerWallet || body.actorWallet || walletAddress;

    const bundle = await ownershipProofService.generateOwnershipProof({
      snippetId: id,
      walletAddress,
      actorWallet,
      transactionHash: body.transactionHash,
      network: body.network,
      verificationTimestamp: body.verificationTimestamp,
    });

    return NextResponse.json(bundle, { status: 201 });
  } catch (error) {
    if (error instanceof OwnershipProofAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    if (error instanceof OwnershipProofValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to generate ownership proof." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/snippets/[id]/ownership-proof
 * Retrieve and export the ownership proof associated with a snippet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    const bundle = await ownershipProofService.getProofBySnippetId(id);

    if (format === "json") {
      return NextResponse.json(bundle.json, { status: 200 });
    }
    if (format === "signed_json") {
      return NextResponse.json(bundle.signedJson, { status: 200 });
    }
    if (format === "verification_link") {
      return NextResponse.json(
        { verificationLink: bundle.verificationLink },
        { status: 200 },
      );
    }

    return NextResponse.json(bundle, { status: 200 });
  } catch (error) {
    if (error instanceof OwnershipProofValidationError) {
      return NextResponse.json(
        { verified: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { verified: false, error: "Failed to retrieve ownership proof." },
      { status: 500 },
    );
  }
}
