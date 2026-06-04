import { NextRequest, NextResponse } from "next/server";
import {
  verifyNonce,
  getOrCreateUser,
  generateJWT,
} from "@/lib/auth";
import { verifyWalletSignature } from "@/lib/stellar-auth";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";

interface VerifyRequest {
  publicKey: string;
  signature: string;
  nonce: string;
}

/**
 * POST /api/auth/verify
 * Verify wallet signature and issue JWT token
 */
export async function POST(req: NextRequest) {
  try {
    const body: VerifyRequest = await req.json();
    const { publicKey, signature, nonce } = body;

    // Validate input
    if (!publicKey || !signature || !nonce) {
      return NextResponse.json(
        { error: "Missing required fields: publicKey, signature, nonce" },
        { status: 400 },
      );
    }

    // Verify nonce (prevents replay attacks)
    const nonceVerification = await verifyNonce(nonce);
    if (!nonceVerification.valid) {
      return NextResponse.json(
        { error: nonceVerification.error || "Invalid nonce" },
        { status: 401 },
      );
    }

    // Verify wallet signature
    const message = `Sign this nonce to login to Codely: ${nonce}`;
    const signatureVerification = await verifyWalletSignature(
      message,
      signature,
      publicKey,
    );

    if (!signatureVerification.valid) {
      return NextResponse.json(
        { error: signatureVerification.error || "Invalid signature" },
        { status: 401 },
      );
    }

    // Get or create user
    const user = await getOrCreateUser(publicKey);

    // Generate JWT token
    const token = await generateJWT(publicKey);

    await appendActivityLog("wallet.connected", "wallet", {
      actorWallet: publicKey,
      resourceId: publicKey,
      metadata: { authMethod: "signature_nonce" },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    // Return token and user info
    return NextResponse.json(
      {
        token,
        user: {
          walletAddress: user.wallet_address,
          createdAt: user.created_at,
        },
        message: "Authentication successful",
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: error.message || "Authentication failed" },
      { status: 500 },
    );
  }
}
