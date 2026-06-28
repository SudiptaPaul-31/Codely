/**
 * Secure wallet session storage with AES-256-GCM encryption.
 * Uses the Web Crypto API (SubtleCrypto) for key derivation (PBKDF2) and encryption.
 * Stores encrypted data in localStorage.
 */

import {
  WalletSession,
  EncryptedWalletData,
  STORAGE_KEY,
  SESSION_EXPIRY_MS,
  ENCRYPTION_VERSION,
} from "@/wallet/types/wallet";

/**
 * Derive an AES-256-GCM key from a static app secret + random salt via PBKDF2.
 * The app secret provides a basic layer of obfuscation; the salt ensures IV uniqueness.
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const appSecret = new TextEncoder().encode(
    "codely-wallet-2024-session-v1"
  );
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    appSecret,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encode an ArrayBuffer as a base64 string. */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode a base64 string into a Uint8Array. */
function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Serialize and encrypt a wallet session. Stores the result in localStorage. */
export async function persistSession(session: WalletSession): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    plaintext
  );

  const data: EncryptedWalletData = {
    iv: bufferToBase64(iv.buffer as ArrayBuffer),
    ciphertext: bufferToBase64(ciphertext),
    salt: bufferToBase64(salt.buffer as ArrayBuffer),
    version: ENCRYPTION_VERSION,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Read encrypted session from localStorage, decrypt, validate expiry. Returns null if invalid. */
export async function readSession(): Promise<WalletSession | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  let data: EncryptedWalletData;
  try {
    data = JSON.parse(raw) as EncryptedWalletData;
  } catch {
    clearSession();
    return null;
  }

  // Version check for forward-compatibility
  if (data.version !== ENCRYPTION_VERSION) {
    clearSession();
    return null;
  }

  try {
    const salt = base64ToBuffer(data.salt);
    const iv = base64ToBuffer(data.iv);
    const ciphertext = base64ToBuffer(data.ciphertext);
    const key = await deriveKey(salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    const session: WalletSession = JSON.parse(
      new TextDecoder().decode(plaintext)
    );

    // Expiry check
    if (Date.now() >= session.expiresAt) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    // Decryption failure — data is corrupt or tampered with
    clearSession();
    return null;
  }
}

/** Remove the persisted session. */
export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check whether a valid session exists (synchronous quick-check). */
export function hasSession(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}