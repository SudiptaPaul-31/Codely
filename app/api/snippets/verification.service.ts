import {
  VerificationRepository,
  VerificationRecord,
  VerificationAttemptLog,
} from "./verification.repository";

/**
 * Regular expression to validate message format
 * Expected format: "Verify ownership of snippet [snippetId] at [timestamp]"
 */
const MESSAGE_FORMAT_REGEX = /^Verify ownership of snippet [a-f0-9-]+ at \d+$/;

export class VerificationService {
  constructor(private verificationRepository: VerificationRepository) {}

  /**
   * Verify ownership of a snippet by validating signature
   * 
   * @param snippetId - The ID of the snippet being verified
   * @param walletAddress - The Stellar wallet address attempting verification
   * @param signature - The cryptographic signature (base64 encoded)
   * @param message - The message that was signed
   * @param ipAddress - Optional IP address of the requester
   * @returns The verification record if successful
   * @throws Error if validation or verification fails
   */
    async getVerificationAuditLog(snippetId: string, options?: any) {
    return this.verificationRepository.getVerificationAuditLog(snippetId, options);
  }

  async verifyOwnership(
    snippetId: string,
    walletAddress: string,
    signature: string,
    message: string,
    ipAddress?: string,
  ): Promise<VerificationRecord> {
    try {
      // 1. Validate message format
      if (!this.validateMessageFormat(message, snippetId)) {
        console.error(
          `[Verification Service] Invalid message format for snippetId: ${snippetId}`,
        );
        await this.verificationRepository.logVerificationAttempt(
          snippetId,
          walletAddress,
          "verify_ownership",
          false,
          "Invalid message format",
          ipAddress,
        );
        throw new Error(
          `Invalid message format. Expected: "Verify ownership of snippet ${snippetId} at [timestamp]"`,
        );
      }

      // 2. Validate signature format (base64)
      if (!this.validateSignatureFormat(signature)) {
        console.error(
          `[Verification Service] Invalid signature format for wallet: ${walletAddress}`,
        );
        await this.verificationRepository.logVerificationAttempt(
          snippetId,
          walletAddress,
          "verify_ownership",
          false,
          "Invalid signature format",
          ipAddress,
        );
        throw new Error("Invalid signature format. Signature must be base64 encoded");
      }

      // 3. Validate wallet address format (Stellar public key)
      if (!this.validateWalletAddress(walletAddress)) {
        console.error(
          `[Verification Service] Invalid wallet address format: ${walletAddress}`,
        );
        await this.verificationRepository.logVerificationAttempt(
          snippetId,
          walletAddress,
          "verify_ownership",
          false,
          "Invalid wallet address format",
          ipAddress,
        );
        throw new Error("Invalid wallet address format");
      }

      // 4. Verify signature using Stellar SDK
      const isSignatureValid = await this.verifySignature(
        message,
        signature,
        walletAddress,
      );

      if (!isSignatureValid) {
        console.error(
          `[Verification Service] Signature verification failed for wallet: ${walletAddress}`,
        );
        await this.verificationRepository.logVerificationAttempt(
          snippetId,
          walletAddress,
          "verify_ownership",
          false,
          "Signature verification failed",
          ipAddress,
        );
        throw new Error("Signature verification failed");
      }

      // 5. Record successful verification
      const verificationRecord = await this.verificationRepository.recordVerification(
        snippetId,
        walletAddress,
        signature,
        message,
      );

      // 6. Log successful verification attempt
      await this.verificationRepository.logVerificationAttempt(
        snippetId,
        walletAddress,
        "verify_ownership",
        true,
        undefined,
        ipAddress,
      );

      console.log(
        `[Verification Service] Successfully verified ownership for snippet: ${snippetId} by wallet: ${walletAddress}`,
      );

      return verificationRecord as unknown as VerificationRecord;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `[Verification Service] Error in verifyOwnership: ${errorMessage}`,
      );
      throw error instanceof Error
        ? error
        : new Error("Failed to verify ownership");
    }
  }

  /**
   * Get the verification status of a snippet
   * 
   * @param snippetId - The ID of the snippet to check
   * @returns The verification record if verified, null otherwise
   */
  async getVerificationStatus(snippetId: string): Promise<VerificationRecord | null> {
    try {
      const status = await this.verificationRepository.getVerificationStatus(snippetId);
      if (!status) {
        console.log(`[Verification Service] No active verification found for snippet: ${snippetId}`);
        return null;
      }
      return status as unknown as VerificationRecord;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `[Verification Service] Error getting verification status: ${errorMessage}`,
      );
      throw new Error("Failed to get verification status");
    }
  }

  /**
   * Revoke a verification for a snippet
   * 
   * @param snippetId - The ID of the snippet
   * @param walletAddress - The wallet address that holds the verification
   * @param revokedBy - The wallet address revoking the verification
   */
  async revokeVerification(
    snippetId: string,
    walletAddress: string,
    revokedBy: string,
  ): Promise<VerificationRecord | null> {
    try {
      // Revoke the verification
      const revoked = await this.verificationRepository.revokeVerification(
        snippetId,
        walletAddress,
      );

      // Log the revocation action
      await this.verificationRepository.logVerificationAttempt(
        snippetId,
        walletAddress,
        `revoke_verification_by_${revokedBy}`,
        true,
        undefined,
      );

      console.log(
        `[Verification Service] Revoked verification for snippet: ${snippetId} by wallet: ${revokedBy}`,
      );

      return revoked as unknown as VerificationRecord;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error(
        `[Verification Service] Error revoking verification: ${errorMessage}`,
      );
      throw new Error("Failed to revoke verification");
    }
  }

  // ====== Private Helper Methods ======

  /**
   * Validate message format matches expected pattern
   * Format: "Verify ownership of snippet [snippetId] at [timestamp]"
   */
  private validateMessageFormat(message: string, snippetId: string): boolean {
    if (!message || typeof message !== "string") {
      return false;
    }

    // Check if message starts with expected prefix
    if (!message.startsWith(`Verify ownership of snippet ${snippetId} at `)) {
      return false;
    }

    // Extract timestamp and validate it's a valid number
    const timestampMatch = message.match(/at (\d+)$/);
    if (!timestampMatch || !timestampMatch[1]) {
      return false;
    }

    const timestamp = parseInt(timestampMatch[1], 10);
    if (isNaN(timestamp)) {
      return false;
    }

    return MESSAGE_FORMAT_REGEX.test(message);
  }

  /**
   * Validate signature is base64 encoded
   */
  private validateSignatureFormat(signature: string): boolean {
    if (!signature || typeof signature !== "string") {
      return false;
    }

    // Basic base64 validation
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(signature)) {
      return false;
    }

    // Check if length is valid (base64 encoded strings should be multiple of 4)
    if (signature.length % 4 !== 0) {
      return false;
    }

    return true;
  }

  /**
   * Validate wallet address is a valid Stellar public key
   * Stellar public keys start with 'G' and are 56 characters long
   */
  private validateWalletAddress(walletAddress: string): boolean {
    if (!walletAddress || typeof walletAddress !== "string") {
      return false;
    }

    // Stellar public keys: start with 'G', 56 characters, alphanumeric
    const stellarPublicKeyRegex = /^G[A-Z2-7]{54}$/;
    return stellarPublicKeyRegex.test(walletAddress);
  }

  /**
   * Verify signature using Stellar SDK
   */
  private async verifySignature(
    message: string,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    try {
      // Import Stellar SDK
      const StellarSdk = require("stellar-sdk");

      // Create keypair from public key
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);

      // Verify the signature
      const isValid = keypair.verify(message, signature, "utf8");

      return isValid;
    } catch (error: any) {
      console.error(
        `[Verification Service] Signature verification error: ${error.message}`,
      );
      return false;
    }
  }
}
