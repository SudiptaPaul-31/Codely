import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { rateLimit } from "@/lib/rateLimiter";

const FAUCET_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const FAUCET_RATE_LIMIT_MAX_REQUESTS = 1;

async function faucetHandler(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { error: "Method not allowed" },
      { status: 405 },
    );
  }

  const auth = (req as any).auth;
  const walletAddress = auth?.walletAddress;

  if (!walletAddress) {
    return NextResponse.json(
      { error: "Unauthorized - wallet address is required" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`faucet-request:${walletAddress}`, {
    windowMs: FAUCET_RATE_LIMIT_WINDOW_MS,
    max: FAUCET_RATE_LIMIT_MAX_REQUESTS,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Faucet request rate limit exceeded. Please try again later.",
        limit: limit.limit,
        window: limit.window,
      },
      { status: 429 },
    );
  }

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(walletAddress)}`,
      {
        method: "GET",
      },
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            result?.error || result?.detail ||
            "Stellar friendbot request failed.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Stellar testnet tokens requested successfully.",
      details: result,
    });
  } catch (error: any) {
    console.error("[wallet/faucet] error:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to request Stellar testnet tokens.",
      },
      { status: 500 },
    );
  }
}

export const POST = withAuth(faucetHandler);
