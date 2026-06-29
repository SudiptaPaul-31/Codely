import crypto from "crypto";

// The encryption key should be 32 bytes (256 bits) for AES-256-GCM.
// We fallback to a hashed version of the env variable if it is not 32 bytes.
function getEncryptionKey(): Buffer {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || "default-secret-key-change-in-production";
  if (Buffer.from(secret).length === 32) {
    return Buffer.from(secret);
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext The string to encrypt.
 * @returns The encrypted string encoded in base64, including the IV and auth tag.
 */
export function encryptData(plaintext: string): string {
  const iv = crypto.randomBytes(16); // Initialization vector
  const key = getEncryptionKey();
  
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts an encrypted string that was encrypted with `encryptData`.
 * @param encryptedPayload The encrypted string in the format iv:authTag:encryptedData.
 * @returns The decrypted plaintext string.
 */
export function decryptData(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }
  
  const [ivBase64, authTagBase64, encryptedBase64] = parts;
  
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
