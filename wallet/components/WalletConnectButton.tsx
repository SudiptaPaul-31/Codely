/**
 * WalletConnectButton — UI component that shows reconnect status,
 * loading state, success/error feedback per the acceptance criteria.
 */

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Wallet, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useWallet } from "@/wallet/context/WalletContext";

export function WalletConnectButton({
  onOpenModal,
}: {
  onOpenModal: () => void;
}) {
  const { connected, publicKey, connecting, reconnecting, error } =
    useWallet();

  // ── Reconnect / connecting state ───────────────────────────
  if (reconnecting) {
    return (
      <Button
        disabled
        variant="outline"
        size="sm"
        className="gap-2 bg-amber-500/10 border-amber-500/20 text-amber-300"
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        Restoring session...
      </Button>
    );
  }

  if (connecting) {
    return (
      <Button
        disabled
        variant="outline"
        size="sm"
        className="gap-2 bg-blue-500/10 border-blue-500/20 text-blue-300"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Connecting...
      </Button>
    );
  }

  // ── Error state (not connected, but has error) ─────────────
  if (error && !connected) {
    return (
      <Button
        onClick={onOpenModal}
        variant="outline"
        size="sm"
        className="gap-2 bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20"
      >
        <AlertCircle className="w-4 h-4" />
        Reconnect
      </Button>
    );
  }

  // ── Connected state ────────────────────────────────────────
  if (connected && publicKey) {
    return (
      <Button
        onClick={onOpenModal}
        variant="outline"
        size="sm"
        className="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
      </Button>
    );
  }

  // ── Disconnected state ─────────────────────────────────────
  return (
    <Button
      onClick={onOpenModal}
      size="sm"
      className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-0 gap-2"
    >
      <Wallet className="w-4 h-4" />
      Connect Wallet
    </Button>
  );
}