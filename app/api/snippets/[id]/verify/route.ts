import { NextRequest, NextResponse } from "next/server";
import {
  blockchainVerificationService,
  VerificationAuthorizationError,
  VerificationValidationError,
} from "@/lib/blockchain-verification-service";

/**
 * POST /api/snippets/[id]/verify
 * Trigger or re-verify a blockchain transaction linked to a snippet.
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
      body.actorWallet ||
      body.walletAddress ||
      req.headers.get("x-wallet-address") ||
      null;

    const result =
      await blockchainVerificationService.verifySnippetTransaction({
        snippetId: id,
        transactionHash: body.transactionHash,
        network: body.network,
        expectedOperation: body.expectedOperation,
        expectedMemo: body.expectedMemo,
        actorWallet,
        visibility: body.visibility,
        ownerWallet: body.ownerWallet,
        allowedWallets: body.allowedWallets,
        forceRevalidate: Boolean(body.forceRevalidate),
      });

    const status = result.verification.status;
    const httpStatus =
      status === "confirmed"
        ? 200
        : status === "pending" || status === "retry_scheduled"
          ? 202
          : result.error?.code === "WRONG_NETWORK" ||
              result.error?.code === "OPERATION_MISMATCH" ||
              result.error?.code === "TRANSACTION_FAILED"
            ? 422
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

    const message =
      error instanceof Error
        ? error.message
        : "Unable to verify snippet transaction.";
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

/**
 * GET /api/snippets/[id]/verify
 * Retrieve verification status for the snippet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const viewerWallet = req.headers.get("x-wallet-address") || null;
    const result =
      await blockchainVerificationService.getSnippetVerificationStatus(id, {
        viewerWallet,
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
    return NextResponse.json(
      {
        status: "unverifiable",
        code: "NETWORK_UNAVAILABLE",
        message: "Failed to verify snippet status.",
      },
      { status: 500 },
    );
  }
}
