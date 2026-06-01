import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

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
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    try {
      await sql`
        DELETE FROM auth_sessions 
        WHERE token_hash = ${tokenHash}
      `;
    } catch (error) {
      console.error("Error deleting session:", error);
      // Continue even if deletion fails
    }

    return NextResponse.json({ message: "Logout successful" }, { status: 200 });
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: error.message || "Logout failed" },
      { status: 500 },
    );
  }
}
