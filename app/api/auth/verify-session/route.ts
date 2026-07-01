import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/auth";

/**
 * POST /api/auth/verify-session
 * Lightweight endpoint to verify a stored JWT session is still valid.
 * Used by the auto-reconnect flow on app load.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No token provided" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);

    // Verify JWT
    const verification = await verifyJWT(token);
    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || "Invalid session" },
        { status: 401 }
      );
    }

    // Optionally validate that the publicKey matches
    const body = await req.json().catch(() => ({}));
    const { publicKey } = body;

    if (publicKey) {
      const walletFromToken =
        verification.payload?.walletAddress ||
        verification.payload?.sub;
      if (walletFromToken !== publicKey) {
        return NextResponse.json(
          { error: "Token does not match wallet address" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      {
        valid: true,
        walletAddress:
          verification.payload?.walletAddress ||
          verification.payload?.sub,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Session verification error:", error);
    return NextResponse.json(
      { error: "Session verification failed" },
      { status: 500 }
    );
  }
}