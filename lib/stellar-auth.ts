import { validateStellarAddress } from "./stellar-wallet-validation";

/**
 * Verify wallet signature using Stellar SDK
 */
export async function verifyWalletSignature(
  message: string,
  signature: string,
  publicKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Validate the Stellar wallet address first
    if (!validateStellarAddress(publicKey)) {
      return { valid: false, error: "Invalid Stellar wallet address" };
    }

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
