import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sha256Hex, verifyJWT } from "@/lib/auth";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/auth/logout
 * Invalidate user session
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "No token provided" }, { status: 400 });
    }

    // Hash the token to find and delete the session
    const tokenHash = await sha256Hex(token);
    const verification = await verifyJWT(token);
    const walletAddress = verification.valid
      ? verification.payload?.walletAddress || verification.payload?.sub
      : null;

    try {
      await sql`
        DELETE FROM auth_sessions 
        WHERE token_hash = ${tokenHash}
      `;
    } catch (error) {
      console.error("Error deleting session:", error);
      // Continue even if deletion fails
    }

    await appendActivityLog("wallet.disconnected", "wallet", {
      actorWallet: typeof walletAddress === "string" ? walletAddress : null,
      resourceId: typeof walletAddress === "string" ? walletAddress : null,
      metadata: { reason: "user_logout" },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    return NextResponse.json({ message: "Logout successful" }, { status: 200 });
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: error.message || "Logout failed" },
      { status: 500 },
    );
  }
}
