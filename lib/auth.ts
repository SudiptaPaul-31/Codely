import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

// ====== JWT & Token Management ======

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRY = "7d"; // 7 days
const NONCE_EXPIRY = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a JWT token for a wallet address
 */
export async function generateJWT(walletAddress: string): Promise<string> {
  // Simple JWT implementation (in production, use 'jsonwebtoken' package)
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds

  const payload = {
    sub: walletAddress,
    iat: now,
    exp: now + expiresIn,
    walletAddress,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

  // Store token hash in database for session management
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  try {
    await sql`
      INSERT INTO auth_sessions (wallet_address, token_hash, expires_at)
      VALUES (${walletAddress}, ${tokenHash}, ${expiresAt})
      ON CONFLICT (token_hash) DO NOTHING
    `;
  } catch (error) {
    console.error("Error storing session:", error);
  }

  return token;
}

/**
 * Verify and decode a JWT token
 */
export function verifyJWT(token: string): {
  valid: boolean;
  payload?: any;
  error?: string;
} {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const [headerEncoded, payloadEncoded, signatureProvided] = parts;

    // Verify signature
    const signature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    if (signature !== signatureProvided) {
      return { valid: false, error: "Invalid signature" };
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, payload };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Generate a unique nonce for login
 */
export async function generateNonce(): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_EXPIRY);

  try {
    await sql`
      INSERT INTO login_nonces (nonce, expires_at)
      VALUES (${nonce}, ${expiresAt})
    `;
  } catch (error) {
    console.error("Error creating nonce:", error);
  }

  return nonce;
}

/**
 * Verify and consume a nonce (prevent replay attacks)
 */
export async function verifyNonce(
  nonce: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const result = await sql`
      SELECT * FROM login_nonces 
      WHERE nonce = ${nonce} 
      AND used = false 
      AND expires_at > now()
    `;

    if (result.length === 0) {
      return { valid: false, error: "Invalid or expired nonce" };
    }

    // Mark nonce as used
    await sql`
      UPDATE login_nonces 
      SET used = true 
      WHERE nonce = ${nonce}
    `;

    return { valid: true };
  } catch (error: any) {
    console.error("Error verifying nonce:", error);
    return { valid: false, error: "Nonce verification failed" };
  }
}

// ====== User Management ======

/**
 * Get or create a user by wallet address
 */
export async function getOrCreateUser(walletAddress: string) {
  try {
    // Try to find existing user
    const existing = await sql`
      SELECT * FROM users WHERE wallet_address = ${walletAddress}
    `;

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new user
    const result = await sql`
      INSERT INTO users (wallet_address) 
      VALUES (${walletAddress})
      RETURNING *
    `;

    return result[0];
  } catch (error) {
    console.error("Error managing user:", error);
    throw error;
  }
}

/**
 * Verify wallet signature using Stellar SDK
 */
export async function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Import Stellar SDK
    const StellarSdk = require("stellar-sdk");

    // Verify the signature
    const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
    const isValid = keypair.verify(message, signature, "utf8");

    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }

    return { valid: true };
  } catch (error: any) {
    console.error("Signature verification error:", error);
    return { valid: false, error: error.message };
  }
}

// ====== Helper Functions ======

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
  let decoded = str.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
  while (decoded.length % 4 !== 0) {
    decoded += "=";
  }

  return Buffer.from(decoded, "base64").toString();
}

/**
 * Clean up expired sessions and nonces
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await sql`DELETE FROM auth_sessions WHERE expires_at < now()`;
    await sql`DELETE FROM login_nonces WHERE expires_at < now()`;
  } catch (error) {
    console.error("Error cleaning up expired sessions:", error);
  }
}
