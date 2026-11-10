import { NextRequest, NextResponse } from "next/server";
import {
  blockchainVerificationService,
  VerificationAuthorizationError,
  VerificationValidationError,
} from "@/lib/blockchain-verification-service";

/**
 * POST /api/verifications/[verificationId]/retry
 * Retry a recoverable verification failure for an existing verification record.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> },
) {
  try {
    const { verificationId } = await params;
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) || {};
    } catch {
      body = {};
    }

    const actorWallet =
      body.actorWallet ||
      body.walletAddress ||
      req.headers.get("x-wallet-address") ||
      null;

    const result = await blockchainVerificationService.retryVerification(
      verificationId,
      { actorWallet },
    );

    const status = result.verification.status;
    const httpStatus =
      status === "confirmed"
        ? 200
        : status === "retry_scheduled" || status === "pending"
          ? 202
          : 200;

    return NextResponse.json(result, { status: httpStatus });
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
        message: "Failed to retry verification.",
      },
      { status: 500 },
    );
  }
}
