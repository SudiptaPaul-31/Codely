import { NextRequest, NextResponse } from "next/server";
import {
  verifyNonce,
  getOrCreateUser,
  generateJWT,
} from "@/lib/auth";
import { verifyWalletSignature } from "@/lib/stellar-auth";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import { logEvent } from "@/lib/audit";

interface VerifyRequest {
  publicKey: string;
  signature: string;
  nonce: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: VerifyRequest = await req.json();
    const { publicKey, signature, nonce } = body;

    if (!publicKey || !signature || !nonce) {
      await logEvent("login_failed", "UNKNOWN", undefined, "Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: publicKey, signature, nonce" },
        { status: 400 },
      );
    }

    const nonceVerification = await verifyNonce(nonce);
    if (!nonceVerification.valid) {
      await logEvent("login_failed", publicKey, undefined, "Invalid nonce");
      return NextResponse.json(
        { error: nonceVerification.error || "Invalid nonce" },
        { status: 401 },
      );
    }

    const message = `Sign this nonce to login to Codely: ${nonce}`;
    const signatureVerification = await verifyWalletSignature(
      message,
      signature,
      publicKey,
    );

    if (!signatureVerification.valid) {
      await logEvent("login_failed", publicKey, undefined, "Invalid signature");
      return NextResponse.json(
        { error: signatureVerification.error || "Invalid signature" },
        { status: 401 },
      );
    }

    const user = await getOrCreateUser(publicKey);
    const token = await generateJWT(publicKey);

    await appendActivityLog("wallet.connected", "wallet", {
      actorWallet: publicKey,
      resourceId: publicKey,
      metadata: { authMethod: "signature_nonce" },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    await logEvent("login_success", publicKey, undefined, "Wallet verified and JWT issued");

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
    await logEvent("login_error", "UNKNOWN", undefined, error.message);
    return NextResponse.json(
      { error: error.message || "Authentication failed" },
      { status: 500 },
    );
  }
}
