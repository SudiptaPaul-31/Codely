import { NextRequest, NextResponse } from "next/server";
import {
  blockchainVerificationService,
  VerificationAuthorizationError,
  VerificationValidationError,
} from "@/lib/blockchain-verification-service";

/**
 * GET /api/verifications/[verificationId]
 * Retrieve a specific blockchain verification record by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> },
) {
  try {
    const { verificationId } = await params;
    const viewerWallet = req.headers.get("x-wallet-address") || null;

    const verification =
      await blockchainVerificationService.getVerificationById(verificationId, {
        viewerWallet,
      });

    return NextResponse.json(
      {
        verification,
      },
      { status: 200 },
    );
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

    return NextResponse.json(
      {
        status: "unverifiable",
        code: "NETWORK_UNAVAILABLE",
        message: "Failed to retrieve verification record.",
      },
      { status: 500 },
    );
  }
}
