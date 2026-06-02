import { neon } from "@neondatabase/serverless";

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

  const signature = await signHmacSha256(JWT_SECRET, `${headerEncoded}.${payloadEncoded}`);

  const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

  // Store token hash in database for session management
  const tokenHash = await sha256Hex(token);

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
export async function verifyJWT(token: string): Promise<{
  valid: boolean;
  payload?: any;
  error?: string;
}> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const [headerEncoded, payloadEncoded, signatureProvided] = parts;

    // Verify signature
    const signature = await signHmacSha256(JWT_SECRET, `${headerEncoded}.${payloadEncoded}`);

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
  const nonceBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// Moved verifyWalletSignature to stellar-auth.ts to prevent Edge runtime errors
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

  // Use standard atob instead of Buffer for Edge compatibility
  return decodeURIComponent(
    atob(decoded)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
}

// Edge-compatible HMAC-SHA256 signature
async function signHmacSha256(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );
  return arrayBufferToBase64Url(signatureBuffer);
}

// Edge-compatible SHA-256 hex hash
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
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
