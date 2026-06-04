"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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
  const [token, setToken] = useState<string | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const storedPublicKey = localStorage.getItem("walletAddress");
    const storedWalletName = localStorage.getItem("walletName");

    if (storedToken && storedPublicKey) {
      setToken(storedToken);
      setPublicKey(storedPublicKey);
      setWalletName(storedWalletName);
      setConnected(true);
    }
  }, []);

  const connect = async (walletType: "freighter" | "albedo" | "lobstr") => {
    try {
      setConnecting(true);
      setError(null);

      let pubKey: string | null = null;

      // ==========================
      // FREIGHTER
      // ==========================
      if (walletType === "freighter") {
        // Wait for Freighter to load
        let freighter = null;
        for (let i = 0; i < 50; i++) {
          if (window.freighter || window.freighterApi) {
            freighter = window.freighter || window.freighterApi;
            console.log("Freighter detected");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (!freighter) {
          throw new Error(
            "Freighter wallet not detected. Please install from https://www.freighter.app/ and refresh the page",
          );
        }

        pubKey = await freighter.getPublicKey();
        if (!pubKey)
          throw new Error("Failed to retrieve public key from Freighter.");
      }

      // ==========================
      // ALBEDO
      // ==========================
      else if (walletType === "albedo") {
        const albedo = await import("@albedo-link/intent");
        const result = await albedo.default.publicKey({});
        pubKey = result.pubkey;
      }

      // ==========================
      // LOBSTR (Placeholder)
      // ==========================
      else if (walletType === "lobstr") {
        throw new Error(
          "Lobstr wallet integration coming soon (requires WalletConnect).",
        );
      }

      if (!pubKey) {
        throw new Error("Failed to get wallet public key");
      }

      // ====== Signature-Based Authentication ======
      // Step 1: Get nonce from server
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) {
        throw new Error("Failed to get authentication nonce");
      }
      const { nonce, message } = await nonceRes.json();

      // Step 2: Request wallet to sign the nonce
      let signature: string | null = null;

      if (walletType === "freighter") {
        let freighter = window.freighter || window.freighterApi;
        signature = await freighter.signMessage(message, {
          domain: "codely.app",
        });
      } else if (walletType === "albedo") {
        const albedo = await import("@albedo-link/intent");
        const result = await albedo.default.signMessage({
          message,
        });
        signature = result.signature;
      }

      if (!signature) {
        throw new Error("Failed to sign message");
      }

      // Step 3: Verify signature on server and get JWT
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: pubKey,
          signature,
          nonce,
        }),
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json();
        throw new Error(errorData.error || "Authentication failed");
      }

      const { token: authToken } = await verifyRes.json();

      // Store token and user info
      localStorage.setItem("authToken", authToken);
      localStorage.setItem("walletAddress", pubKey);
      localStorage.setItem("walletName", walletName || walletType);

      setToken(authToken);
      setPublicKey(pubKey);
      setWalletName(walletName || walletType);
      setConnected(true);
    } catch (err: any) {
      setError(err?.message || "Connection failed");
      console.error("Wallet connection error:", err);
      throw err;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      // Logout on server
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(console.error);
      }
    } catch (err) {
      console.error("Logout error:", err);
    }

    // Clear local state
    localStorage.removeItem("authToken");
    localStorage.removeItem("walletAddress");
    localStorage.removeItem("walletName");

    setConnected(false);
    setPublicKey(null);
    setWalletName(null);
    setToken(null);
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
      token,
      connect,
      disconnect,
      clearError,
    }),
    [connected, publicKey, walletName, connecting, error, token],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);

// ====================================
// Wallet Button Component
// ====================================

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
    connect,
    disconnect,
    error,
    clearError,
    token,
  } = wallet;

  const fetchWalletBalance = async (address: string) => {
    setBalanceLoading(true);
    try {
      const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(address)}`);
      if (!response.ok) {
        setBalance("0.00");
        return;
      }

      const account = await response.json();
      const nativeBalance = account.balances?.find((item: any) => item.asset_type === "native")?.balance;
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
      toast.error("Wallet address unavailable.");
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
        throw new Error(result?.error || "Failed to request Stellar testnet tokens.");
      }

      toast.success("Testnet tokens requested successfully.");
      await fetchWalletBalance(publicKey);
    } catch (err: any) {
      console.error("Faucet request failed:", err);
      toast.error(err?.message || "Failed to request Stellar testnet tokens.");
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setShowStatusDialog(false);
    setBalance(null);
    await disconnect();
  };

  const handleWalletSelect = async (
    walletType: "freighter" | "albedo" | "lobstr",
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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Connected wallet</p>
                <p className="mt-2 font-mono text-sm text-white break-all">{publicKey}</p>
                <p className="mt-3 text-sm text-slate-300">
                  Balance: {balanceLoading ? "Loading..." : balance ? `${balance} XLM` : "Unavailable"}
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

          {error && <div className="mt-4 text-red-500 text-sm">{error}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
