"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window {
    freighter?: any;
    freighterApi?: any;
  }
}

const WalletContext = createContext<any>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (walletType: "freighter" | "albedo" | "lobstr") => {
    try {
      setConnecting(true);
      setError(null);

      // ==========================
      // FREIGHTER
      // ==========================
      if (walletType === "freighter") {
        // Wait for Freighter to load
        let freighter = null;
        for (let i = 0; i < 50; i++) {
          if (window.freighter || window.freighterApi) {
            freighter = window.freighter || window.freighterApi;
            console.log('Freighter detected');
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!freighter) {
          throw new Error(
            "Freighter wallet not detected. Please install from https://www.freighter.app/ and refresh the page"
          );
        }

        const pubKey = await freighter.getPublicKey();
        if (!pubKey) throw new Error("Failed to retrieve public key from Freighter.");

        setPublicKey(pubKey);
        setWalletName("Freighter");
        setConnected(true);
      }

      // ==========================
      // ALBEDO
      // ==========================
      else if (walletType === "albedo") {
        const albedo = await import("@albedo-link/intent");
        const result = await albedo.default.publicKey({});

        setPublicKey(result.pubkey);
        setWalletName("Albedo");
        setConnected(true);
      }

      // ==========================
      // LOBSTR (Placeholder)
      // ==========================
      else if (walletType === "lobstr") {
        throw new Error(
          "Lobstr wallet integration coming soon (requires WalletConnect)."
        );
      }
    } catch (err: any) {
      setError(err?.message || "Connection failed");
      console.error("Wallet connection error:", err);
      throw err;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setConnected(false);
    setPublicKey(null);
    setWalletName(null);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  const value = useMemo(
    () => ({
      connected,
      publicKey,
      walletName,
      connecting,
      error,
      connect,
      disconnect,
      clearError,
    }),
    [connected, publicKey, walletName, connecting, error]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);

// ====================================
// Wallet Button Component
// ====================================

export function WalletButton() {
  const wallet = useWallet();
  const [showModal, setShowModal] = useState(false);

  if (!wallet) return null;

  const { connected, publicKey, connecting, connect, disconnect, error, clearError } = wallet;

  const handleWalletSelect = async (
    walletType: "freighter" | "albedo" | "lobstr"
  ) => {
    setShowModal(false);
    await connect(walletType);
  };

  const handleOpenModal = () => {
    if (clearError) clearError();
    setShowModal(true);
  };

  if (connected && publicKey) {
    return (
      <Button
        onClick={disconnect}
        variant="outline"
        size="sm"
        className="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={handleOpenModal}
        disabled={connecting}
        size="sm"
        className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-0 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {connecting ? "Connecting..." : "Connect Wallet"}
      </Button>

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