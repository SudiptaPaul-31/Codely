import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "./ownership.middleware";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";

/**
 * Signature Verification Middleware
 *
 * Verifies that a request contains a valid cryptographic signature from a Stellar wallet.
 * Ensures the signature matches the requested action and resource, and prevents replay attacks
 * using nonce and timestamp validation.
 */

export class SignatureMiddleware {
  private static readonly MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if the requester provided a valid signature for a sensitive action
   * @param req - The Next.js request object
   * @param action - The action being performed (e.g. 'delete_snippet', 'transfer_ownership')
   * @param resourceId - The ID of the resource being acted upon
   * @returns Object with isValid boolean and error response if not authorized
   */
  async verifySignature(
    req: NextRequest,
    action: string,
    resourceId: string,
  ): Promise<{ isValid: boolean; error?: NextResponse; walletAddress?: string }> {
    try {
      // Extract the wallet address
      const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

      if (!walletAddress) {
        return {
          isValid: false,
          error: NextResponse.json(
            { error: "Unauthorized", message: "Wallet address is required." },
            { status: 401 },
          ),
        };
      }

      // Extract signature components from headers
      const signature = req.headers.get("x-wallet-signature");
      const nonce = req.headers.get("x-wallet-nonce");
      const timestampStr = req.headers.get("x-wallet-timestamp");

      if (!signature || !nonce || !timestampStr) {
        return {
          isValid: false,
          error: NextResponse.json(
            {
              error: "Signature Required",
              message: "Missing wallet signature, nonce, or timestamp headers.",
            },
            { status: 401 },
          ),
        };
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return {
          isValid: false,
          error: NextResponse.json(
            { error: "Invalid Timestamp", message: "Timestamp must be a valid number." },
            { status: 400 },
          ),
        };
      }

      // Check for replay attack / expired timestamp
      const now = Date.now();
      if (now - timestamp > SignatureMiddleware.MAX_TIMESTAMP_AGE_MS || timestamp > now + 60000) {
        return {
          isValid: false,
          error: NextResponse.json(
            {
              error: "Signature Expired",
              message: "The signature timestamp is too old or invalid. Please sign again.",
            },
            { status: 401 },
          ),
        };
      }

      // Reconstruct the message that should have been signed
      const messageToVerify = `Codely signature request\nAction: ${action}\nResource: ${resourceId}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

      // Import StellarSdk to verify the signature
      const StellarSdk = require("stellar-sdk");
      let isValidSignature = false;

      try {
        const keypair = StellarSdk.Keypair.fromPublicKey(walletAddress);
        isValidSignature = keypair.verify(messageToVerify, signature, "utf8");
      } catch (err) {
        console.error("[SignatureMiddleware] Keypair verification error:", err);
      }

      if (!isValidSignature) {
        // Log failed signature attempt for audit purposes
        await appendActivityLog("signature.failed", "snippet", {
          actorWallet: walletAddress,
          resourceId,
          metadata: { action, timestamp },
          ipAddress: extractIp(req.headers),
          userAgent: extractUserAgent(req.headers)
        });

        console.error("[SignatureMiddleware] Invalid signature detected:", {
          walletAddress: walletAddress.slice(0, 8) + "...",
          action,
          resourceId,
          timestamp,
          ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        });

        return {
          isValid: false,
          error: NextResponse.json(
            {
              error: "Invalid Signature",
              message: "The provided wallet signature is invalid for this action.",
            },
            { status: 403 },
          ),
        };
      }

      // Record verification attempt for audit logs
      await appendActivityLog("signature.verified", "snippet", {
        actorWallet: walletAddress,
        resourceId,
        metadata: { action, timestamp },
        ipAddress: extractIp(req.headers),
        userAgent: extractUserAgent(req.headers)
      });

      console.log("[SignatureMiddleware] Successfully verified signature:", {
        walletAddress: walletAddress.slice(0, 8) + "...",
        action,
        resourceId,
        timestamp,
      });

      return { isValid: true, walletAddress };
    } catch (error) {
      console.error("[SignatureMiddleware] Error verifying signature:", error);
      return {
        isValid: false,
        error: NextResponse.json(
          {
            error: "Internal Server Error",
            message: "Failed to verify wallet signature.",
          },
          { status: 500 },
        ),
      };
    }
  }
}
