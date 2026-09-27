import crypto from "crypto";
import * as StellarSdk from "stellar-sdk";

export interface SnippetOwnershipProof {
  snippetId: string;
  hash: string;
  ownerWallet: string;
  signature: string;
  createdAt: string;
}

export interface SnippetProofPayload {
  snippetId: string;
  hash: string;
  ownerWallet: string;
  createdAt: string;
}

export function hashSnippetContent(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

export function canonicalizeProofPayload(payload: SnippetProofPayload): string {
  return JSON.stringify({
    createdAt: payload.createdAt,
    hash: payload.hash,
    ownerWallet: payload.ownerWallet.toUpperCase(),
    snippetId: payload.snippetId,
  });
}

function signatureBytes(signature: string): Buffer {
  if (/^[0-9a-f]{128}$/i.test(signature)) {
    return Buffer.from(signature, "hex");
  }
  return Buffer.from(signature, "base64");
}

export function signSnippetOwnershipProof(
  secretKey: string,
  payload: SnippetProofPayload,
): SnippetOwnershipProof {
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);
  const normalizedPayload = {
    ...payload,
    ownerWallet: keypair.publicKey(),
  };
  const signature = keypair
    .sign(Buffer.from(canonicalizeProofPayload(normalizedPayload), "utf8"))
    .toString("base64");

  return { ...normalizedPayload, signature };
}

export function verifySnippetOwnershipProof(
  proof: SnippetOwnershipProof,
  options?: { maxAgeSeconds?: number; now?: Date },
): { valid: boolean; error?: string } {
  try {
    if (!proof.snippetId || !proof.hash || !proof.ownerWallet || !proof.signature || !proof.createdAt) {
      return { valid: false, error: "Incomplete ownership proof" };
    }

    const createdAt = new Date(proof.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return { valid: false, error: "Invalid proof timestamp" };
    }

    // Replay attack prevention is optional and opt-in so legacy proofs do not fail by default.
    if (options?.maxAgeSeconds !== undefined) {
      const maxAgeSeconds = options.maxAgeSeconds;
      const now = options?.now ?? new Date();
      const ageSeconds = (now.getTime() - createdAt.getTime()) / 1000;
      if (ageSeconds < 0) {
        return { valid: false, error: "Proof timestamp is in the future" };
      }
      if (ageSeconds > maxAgeSeconds) {
        return { valid: false, error: `Proof expired (older than ${maxAgeSeconds} seconds)` };
      }
    }

    const keypair = StellarSdk.Keypair.fromPublicKey(proof.ownerWallet);
    const valid = keypair.verify(
      Buffer.from(canonicalizeProofPayload({
        snippetId: proof.snippetId,
        hash: proof.hash,
        ownerWallet: proof.ownerWallet,
        createdAt: proof.createdAt,
      }), "utf8"),
      signatureBytes(proof.signature),
    );

    return valid ? { valid: true } : { valid: false, error: "Invalid ownership signature" };
  } catch {
    return { valid: false, error: "Malformed ownership proof" };
  }
}