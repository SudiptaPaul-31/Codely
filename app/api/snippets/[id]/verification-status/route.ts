import { NextRequest, NextResponse } from "next/server";
import {
  blockchainVerificationService,
  VerificationAuthorizationError,
  VerificationValidationError,
} from "@/lib/blockchain-verification-service";

/**
 * GET /api/snippets/[id]/verification-status
 * Retrieve the authoritative blockchain verification status for a snippet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const viewerWallet = req.headers.get("x-wallet-address") || null;
    const url = new URL(req.url);
    const revalidate = url.searchParams.get("revalidate") === "true";

    const result =
      await blockchainVerificationService.getSnippetVerificationStatus(id, {
        viewerWallet,
        revalidate,
      });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof VerificationAuthorizationError) {
      return NextResponse.json(
        {
          status: "unverifiable",
          code: error.code,
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    if (error instanceof VerificationValidationError) {
      return NextResponse.json(
        {
          status: "unverifiable",
          code: error.code,
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      {
        status: "unverifiable",
        code: "NETWORK_UNAVAILABLE",
        message,
      },
      { status: 500 },
    );
  }
}
