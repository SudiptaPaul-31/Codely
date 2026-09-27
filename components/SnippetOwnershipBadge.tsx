"use client";

import { useEffect, useState } from "react";
import VerificationBadge from "@/components/verification-badge";

export function SnippetOwnershipBadge({ snippetId }: { snippetId: string }) {
  const [verified, setVerified] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | undefined>();
  const [walletAddress, setWalletAddress] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    fetch(`/api/snippets/${snippetId}/ownership-proof`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!active || !result?.verified) return;
        setVerified(true);
        setVerifiedAt(result.proof?.createdAt);
        setWalletAddress(result.proof?.ownerWallet);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [snippetId]);

  return (
    <VerificationBadge
      verified={verified}
      verifiedAt={verifiedAt}
      walletAddress={walletAddress}
    />
  );
}