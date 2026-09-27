import * as StellarSdk from "stellar-sdk";
import {
  canonicalizeProofPayload,
  hashSnippetContent,
  signSnippetOwnershipProof,
  verifySnippetOwnershipProof,
} from "./snippet-ownership-proof";

describe("snippet ownership proofs", () => {
  const keypair = StellarSdk.Keypair.random();
  const payload = {
    snippetId: "9d2d8f45-0e6b-4aa2-8bf6-0f1a4d9c7c77",
    hash: hashSnippetContent("const answer = 42;"),
    ownerWallet: keypair.publicKey(),
    createdAt: "2026-08-27T12:00:00.000Z",
  };

  it("verifies a proof signed by the owner", () => {
    const proof = signSnippetOwnershipProof(keypair.secret(), payload);
    expect(verifySnippetOwnershipProof(proof)).toEqual({ valid: true });
  });

  it("rejects a tampered payload", () => {
    const proof = signSnippetOwnershipProof(keypair.secret(), payload);
    expect(verifySnippetOwnershipProof({ ...proof, hash: "0".repeat(64) }).valid).toBe(false);
  });

  it("rejects a signature from another wallet", () => {
    const proof = signSnippetOwnershipProof(keypair.secret(), payload);
    const otherWallet = StellarSdk.Keypair.random().publicKey();
    expect(verifySnippetOwnershipProof({ ...proof, ownerWallet: otherWallet }).valid).toBe(false);
  });

  it("rejects a replayed proof with a different snippet id", () => {
    const proof = signSnippetOwnershipProof(keypair.secret(), payload);
    expect(
      verifySnippetOwnershipProof({
        ...proof,
        snippetId: "c4d5e6f7-1234-4abc-8def-0123456789ab",
      }).valid,
    ).toBe(false);
  });

  it("uses stable canonical ordering for replay detection", () => {
    expect(canonicalizeProofPayload(payload)).toBe(
      '{"createdAt":"2026-08-27T12:00:00.000Z","hash":"' +
        payload.hash +
        '","ownerWallet":"' +
        payload.ownerWallet +
        '","snippetId":"9d2d8f45-0e6b-4aa2-8bf6-0f1a4d9c7c77"}',
    );
  });

  describe("replay attack prevention", () => {
    it("accepts a proof within the valid time window when a max age is provided", () => {
      const now = new Date();
      const recentProof = {
        ...payload,
        createdAt: new Date(now.getTime() - 60 * 1000).toISOString(), // 1 minute ago
      };
      const proof = signSnippetOwnershipProof(keypair.secret(), recentProof);
      expect(verifySnippetOwnershipProof(proof, { now, maxAgeSeconds: 300 })).toEqual({ valid: true });
    });

    it("rejects a proof that is too old when a max age is provided", () => {
      const now = new Date();
      const oldProof = {
        ...payload,
        createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      };
      const proof = signSnippetOwnershipProof(keypair.secret(), oldProof);
      const result = verifySnippetOwnershipProof(proof, { now, maxAgeSeconds: 300 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Proof expired");
    });

    it("respects custom maxAgeSeconds parameter", () => {
      const now = new Date();
      const slightlyOldProof = {
        ...payload,
        createdAt: new Date(now.getTime() - 60 * 1000).toISOString(), // 1 minute ago
      };
      const proof = signSnippetOwnershipProof(keypair.secret(), slightlyOldProof);

      // Should pass with 2 minute window
      expect(verifySnippetOwnershipProof(proof, { now, maxAgeSeconds: 120 }).valid).toBe(true);

      // Should fail with 30 second window
      expect(verifySnippetOwnershipProof(proof, { now, maxAgeSeconds: 30 }).valid).toBe(false);
    });

    it("rejects a proof with a future timestamp when max age is checked", () => {
      const now = new Date();
      const futureProof = {
        ...payload,
        createdAt: new Date(now.getTime() + 60 * 1000).toISOString(), // 1 minute in future
      };
      const proof = signSnippetOwnershipProof(keypair.secret(), futureProof);
      const result = verifySnippetOwnershipProof(proof, { now, maxAgeSeconds: 300 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("future");
    });
  });
});