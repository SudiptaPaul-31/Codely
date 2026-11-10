"use client";

import React, { useState } from "react";
import type {
  OwnershipProofRecord,
  ProofVerificationResult,
  SignedJsonProofExport,
} from "@/lib/ownership-proof-service";

export interface OwnershipProofPanelProps {
  proof: OwnershipProofRecord;
  signedJson?: SignedJsonProofExport;
  verificationLink?: string;
  initialVerification?: ProofVerificationResult | null;
  onExportJson?: (jsonText: string) => void;
  onExportSignedJson?: (signedJsonText: string) => void;
  onCopyVerificationLink?: (link: string) => void;
  onVerifyProof?: (
    proof: OwnershipProofRecord,
  ) => Promise<ProofVerificationResult> | ProofVerificationResult;
}

function formatNetworkLabel(network: string): string {
  const n = network.toLowerCase();
  if (n === "testnet") return "Stellar Testnet";
  if (n === "mainnet" || n === "public") return "Stellar Mainnet";
  return `Stellar ${network}`;
}

function formatStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function OwnershipProofPanel({
  proof,
  signedJson,
  verificationLink,
  initialVerification = null,
  onExportJson,
  onExportSignedJson,
  onCopyVerificationLink,
  onVerifyProof,
}: OwnershipProofPanelProps) {
  const [verificationResult, setVerificationResult] =
    useState<ProofVerificationResult | null>(initialVerification);
  const [verifying, setVerifying] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const resolvedLink =
    verificationLink || `https://app.example.com/proofs/${proof.proofId}`;

  const handleExportJson = () => {
    const payload = JSON.stringify(
      {
        walletAddress: proof.walletAddress,
        snippetId: proof.snippetId,
        transactionHash: proof.transactionHash,
        network: proof.network,
        proofId: proof.proofId,
        verificationTimestamp: proof.verificationTimestamp,
        proofVersion: proof.proofVersion,
        status: proof.status,
      },
      null,
      2,
    );
    onExportJson?.(payload);
    setActionFeedback("Exported JSON proof");
  };

  const handleExportSignedJson = () => {
    const payload = JSON.stringify(
      signedJson ?? {
        payload: {
          walletAddress: proof.walletAddress,
          snippetId: proof.snippetId,
          transactionHash: proof.transactionHash,
          network: proof.network,
          proofId: proof.proofId,
          verificationTimestamp: proof.verificationTimestamp,
          proofVersion: proof.proofVersion,
        },
        signature: proof.signature,
      },
      null,
      2,
    );
    onExportSignedJson?.(payload);
    setActionFeedback("Exported signed JSON proof");
  };

  const handleCopyLink = () => {
    onCopyVerificationLink?.(resolvedLink);
    setActionFeedback("Copied verification link");
  };

  const handleVerify = async () => {
    if (!onVerifyProof) return;
    setVerifying(true);
    try {
      const res = await onVerifyProof(proof);
      setVerificationResult(res);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section
      aria-label="Wallet Ownership Proof"
      className="rounded-lg border p-4 space-y-4"
    >
      <h3 className="text-lg font-semibold">Wallet Ownership Proof</h3>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground font-medium">Wallet Address</dt>
          <dd data-testid="proof-wallet">{proof.walletAddress}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground font-medium">Snippet</dt>
          <dd data-testid="proof-snippet">{proof.snippetId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground font-medium">Transaction</dt>
          <dd data-testid="proof-tx">{proof.transactionHash}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground font-medium">Network</dt>
          <dd data-testid="proof-network">{formatNetworkLabel(proof.network)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground font-medium">Status</dt>
          <dd data-testid="proof-status">{formatStatusLabel(proof.status)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExportJson}
          className="px-3 py-1.5 rounded border text-sm font-medium"
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={handleExportSignedJson}
          className="px-3 py-1.5 rounded border text-sm font-medium"
        >
          Export Signed JSON
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="px-3 py-1.5 rounded border text-sm font-medium"
        >
          Copy Verification Link
        </button>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-medium"
        >
          {verifying ? "Verifying..." : "Verify Proof"}
        </button>
      </div>

      {actionFeedback && (
        <p role="status" className="text-xs text-muted-foreground">
          {actionFeedback}
        </p>
      )}

      {verificationResult && (
        <div
          data-testid="proof-verification-result"
          className="rounded border p-3 text-sm space-y-1"
        >
          <h4 className="font-semibold">
            {verificationResult.verified
              ? "Ownership Proof Verified"
              : `Verification Status: ${formatStatusLabel(verificationResult.status)}`}
          </h4>
          <ul className="space-y-0.5">
            <li>
              {verificationResult.checks.walletVerified ? "✓" : "✗"} Wallet
              verified
            </li>
            <li>
              {verificationResult.checks.transactionVerified ? "✓" : "✗"}{" "}
              Transaction verified
            </li>
            <li>
              {verificationResult.checks.snippetMatchConfirmed ? "✓" : "✗"}{" "}
              Snippet match confirmed
            </li>
            <li>
              {verificationResult.checks.networkVerified ? "✓" : "✗"} Network
              verified
            </li>
          </ul>
          {verificationResult.reason && (
            <p className="text-xs text-destructive">
              {verificationResult.reason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default OwnershipProofPanel;
