import { NextRequest, NextResponse } from "next/server";
import { generateNonce } from "@/lib/auth";

/**
 * GET /api/auth/nonce
 * Generate a new nonce for wallet signature
 */
export async function GET() {
  try {
    const nonce = await generateNonce();

    return NextResponse.json(
      {
        nonce,
        message: `Sign this nonce to login to Codely: ${nonce}`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error generating nonce:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 },
    );
  }
}
