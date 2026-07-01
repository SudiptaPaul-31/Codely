"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWallet } from "@/wallet/context/WalletContext";
import { WalletConnectButton } from "@/wallet/components/WalletConnectButton";
import type { WalletProviderType } from "@/wallet/types/wallet";

// Re-export the new WalletProvider and useWallet for backward compatibility
export { WalletProvider, useWallet } from "@/wallet/context/WalletContext";

// Re-export the new WalletConnectButton
export { WalletConnectButton };

// Legacy WalletButton component — uses the new wallet context internally
// but keeps the same modal UX the app depends on.
export function WalletButton() {
  const wallet = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  if (!wallet) return null;

  const {
    connected,
    publicKey,
    connecting,
    reconnecting,
    connect,
    disconnect,
    error,
    clearError,
    token,
  } = wallet;

  const fetchWalletBalance = async (address: string) => {
    setBalanceLoading(true);
    try {
      const response = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(address)}`
      );
      if (!response.ok) {
        setBalance("0.00");
        return;
      }

      const account = await response.json();
      const nativeBalance = account.balances?.find(
        (item: any) => item.asset_type === "native"
      )?.balance;
      setBalance(nativeBalance ?? "0.00");
    } catch (err) {
      console.error("Error fetching wallet balance:", err);
      setBalance("0.00");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchWalletBalance(publicKey);
    }
  }, [connected, publicKey]);

  const handleRequestFaucet = async () => {
    if (!publicKey) {
      return;
    }

    setFaucetLoading(true);
    try {
      const response = await fetch("/api/wallet/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to request Stellar testnet tokens."
        );
      }

      await fetchWalletBalance(publicKey);
    } catch (err: any) {
      console.error("Faucet request failed:", err);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setShowStatusDialog(false);
    setBalance(null);
    await disconnect();
  };

  const handleWalletSelect = async (walletType: WalletProviderType) => {
    setShowModal(false);
    await connect(walletType);
  };

  const handleOpenModal = () => {
    if (clearError) clearError();
    setShowModal(true);
  };

  if (connected && publicKey) {
    return (
      <>
        <Button
          onClick={() => setShowStatusDialog(true)}
          variant="outline"
          size="sm"
          className="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 gap-2"
        >
          <Wallet className="w-4 h-4" />
          {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
        </Button>

        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Wallet</DialogTitle>
              <DialogDescription>
                View connected wallet details and request Stellar testnet tokens.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Connected wallet
                </p>
                <p className="mt-2 font-mono text-sm text-white break-all">
                  {publicKey}
                </p>
                <p className="mt-3 text-sm text-slate-300">
                  Balance:{" "}
                  {balanceLoading
                    ? "Loading..."
                    : balance
                      ? `${balance} XLM`
                      : "Unavailable"}
                </p>
              </div>

              <Button
                onClick={handleRequestFaucet}
                disabled={faucetLoading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
              >
                {faucetLoading ? "Requesting tokens..." : "Request Testnet Tokens"}
              </Button>

              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="w-full"
              >
                Disconnect Wallet
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {/* Use WalletConnectButton for the trigger, giving reconnection feedback */}
      <WalletConnectButton onOpenModal={handleOpenModal} />

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>
              Choose your Stellar wallet to connect
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <Button
              onClick={() => handleWalletSelect("freighter")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">🚀 Freighter</div>
                <div className="text-sm text-muted-foreground">
                  Browser extension wallet
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleWalletSelect("albedo")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">⭐ Albedo</div>
                <div className="text-sm text-muted-foreground">
                  Web-based wallet
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleWalletSelect("lobstr")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">🦞 Lobstr</div>
                <div className="text-sm text-muted-foreground">
                  Mobile & web wallet
                </div>
              </div>
            </Button>
          </div>

          {error && (
            <div className="mt-4 text-red-500 text-sm">{error}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

  const wallet = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  if (!wallet) return null;

  const {
    connected,
    publicKey,
    connecting,
    reconnecting,
    connect,
    disconnect,
    error,
    clearError,
    token,
  } = wallet;

  const fetchWalletBalance = async (address: string) => {
    setBalanceLoading(true);
    try {
      const response = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(address)}`
      );
      if (!response.ok) {
        setBalance("0.00");
        return;
      }

      const account = await response.json();
      const nativeBalance = account.balances?.find(
        (item: any) => item.asset_type === "native"
      )?.balance;
      setBalance(nativeBalance ?? "0.00");
    } catch (err) {
      console.error("Error fetching wallet balance:", err);
      setBalance("0.00");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchWalletBalance(publicKey);
    }
  }, [connected, publicKey]);

  const handleRequestFaucet = async () => {
    if (!publicKey) {
      return;
    }

    setFaucetLoading(true);
    try {
      const response = await fetch("/api/wallet/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to request Stellar testnet tokens."
        );
      }

      await fetchWalletBalance(publicKey);
    } catch (err: any) {
      console.error("Faucet request failed:", err);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setShowStatusDialog(false);
    setBalance(null);
    await disconnect();
  };

  const handleWalletSelect = async (walletType: WalletProviderType) => {
    setShowModal(false);
    await connect(walletType);
  };

  const handleOpenModal = () => {
    if (clearError) clearError();
    setShowModal(true);
  };

  if (connected && publicKey) {
    return (
      <>
        <Button
          onClick={() => setShowStatusDialog(true)}
          variant="outline"
          size="sm"
          className="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 gap-2"
        >
          <Wallet className="w-4 h-4" />
          {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
        </Button>

        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Wallet</DialogTitle>
              <DialogDescription>
                View connected wallet details and request Stellar testnet tokens.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Connected wallet
                </p>
                <p className="mt-2 font-mono text-sm text-white break-all">
                  {publicKey}
                </p>
                <p className="mt-3 text-sm text-slate-300">
                  Balance:{" "}
                  {balanceLoading
                    ? "Loading..."
                    : balance
                      ? `${balance} XLM`
                      : "Unavailable"}
                </p>
              </div>

              <Button
                onClick={handleRequestFaucet}
                disabled={faucetLoading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white"
              >
                {faucetLoading ? "Requesting tokens..." : "Request Testnet Tokens"}
              </Button>

              <Button
                onClick={handleDisconnect}
                variant="outline"
                className="w-full"
              >
                Disconnect Wallet
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {/* Use WalletConnectButton for the trigger, giving reconnection feedback */}
      <WalletConnectButton onOpenModal={handleOpenModal} />

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>
              Choose your Stellar wallet to connect
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-4">
            <Button
              onClick={() => handleWalletSelect("freighter")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">🚀 Freighter</div>
                <div className="text-sm text-muted-foreground">
                  Browser extension wallet
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleWalletSelect("albedo")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">⭐ Albedo</div>
                <div className="text-sm text-muted-foreground">
                  Web-based wallet
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleWalletSelect("lobstr")}
              variant="outline"
              className="justify-start h-auto py-4"
            >
              <div className="text-left">
                <div className="font-semibold">🦞 Lobstr</div>
                <div className="text-sm text-muted-foreground">
                  Mobile & web wallet
                </div>
              </div>
            </Button>
          </div>

          {error && (
            <div className="mt-4 text-red-500 text-sm">{error}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}