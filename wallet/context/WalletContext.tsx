/**
 * WalletContext — Enhanced wallet provider with encrypted session persistence,
 * auto-reconnect, session expiration handling, and multi-wallet support.
 */

"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { toast } from "sonner";
import {
  WalletContextValue,
  WalletProviderType,
  SESSION_EXPIRY_MS,
} from "@/wallet/types/wallet";
import { walletStore } from "@/wallet/store/walletStore";
import { getPublicKey, signMessage } from "@/wallet/lib/walletAdapters";
import {
  persistSession,
  readSession,
  clearSession,
} from "@/wallet/lib/sessionStorage";

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [walletProvider, setWalletProvider] =
    useState<WalletProviderType | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reconnectAttempted = useRef(false);

  // ─── Auto-reconnect on mount ─────────────────────────────────
  useEffect(() => {
    if (reconnectAttempted.current) return;
    reconnectAttempted.current = true;

    let cancelled = false;

    const attempt = async () => {
      setReconnecting(true);
      try {
        const session = await readSession();
        if (!session || cancelled) return;

        const { publicKey: pk, walletName: wn, token: t, walletProvider: wp } =
          session;

        // Verify the token is still valid by making a lightweight API call
        const verifyRes = await fetch("/api/auth/verify-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ publicKey: pk }),
        });

        if (!verifyRes.ok) {
          // Session expired or invalidated server-side
          clearSession();
          if (!cancelled) {
            toast.error("Wallet session expired. Please reconnect.");
          }
          return;
        }

        if (cancelled) return;

        // Restore session
        setPublicKey(pk);
        setWalletName(wn);
        setWalletProvider(wp);
        setToken(t);
        setConnected(true);
        walletStore.setState({
          connected: true,
          publicKey: pk,
          walletName: wn,
          walletProvider: wp,
          token: t,
        });

        // Refresh the session expiry
        await persistSession({
          publicKey: pk,
          walletName: wn,
          token: t,
          expiresAt: Date.now() + SESSION_EXPIRY_MS,
          walletProvider: wp,
        });

        toast.success(`Reconnected to ${wn} wallet`);
      } catch (err) {
        console.error("[Wallet] Auto-reconnect failed:", err);
        clearSession();
        if (!cancelled) {
          setError("Failed to restore wallet session");
        }
      } finally {
        if (!cancelled) {
          setReconnecting(false);
        }
      }
    };

    attempt();

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Connect ─────────────────────────────────────────────────
  const connect = useCallback(
    async (walletType: WalletProviderType) => {
      try {
        setConnecting(true);
        setError(null);

        // Step 1: Get public key from wallet
        const pubKey = await getPublicKey(walletType);
        const displayName =
          walletType === "freighter"
            ? "Freighter"
            : walletType === "albedo"
              ? "Albedo"
              : walletType === "lobstr"
                ? "Lobstr"
                : walletType;

        // Step 2: Get nonce from server
        const nonceRes = await fetch("/api/auth/nonce");
        if (!nonceRes.ok) {
          throw new Error("Failed to get authentication nonce");
        }
        const { nonce, message } = await nonceRes.json();

        // Step 3: Sign the message
        const signature = await signMessage(walletType, message);

        // Step 4: Verify signature and get JWT
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: pubKey, signature, nonce }),
        });

        if (!verifyRes.ok) {
          const errorData = await verifyRes.json();
          throw new Error(errorData.error || "Authentication failed");
        }

        const { token: authToken } = await verifyRes.json();

        // Step 5: Persist session with encryption
        await persistSession({
          publicKey: pubKey,
          walletName: displayName,
          token: authToken,
          expiresAt: Date.now() + SESSION_EXPIRY_MS,
          walletProvider: walletType,
        });

        // Step 6: Update state
        setPublicKey(pubKey);
        setWalletName(displayName);
        setWalletProvider(walletType);
        setToken(authToken);
        setConnected(true);
        walletStore.setState({
          connected: true,
          publicKey: pubKey,
          walletName: displayName,
          walletProvider: walletType,
          token: authToken,
        });

        // Step 7: Log connection to server (best-effort)
        fetch("/api/transactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": pubKey,
          },
          body: JSON.stringify({
            type: "wallet_connect",
            description: `Connected via ${displayName}`,
            metadata: { walletType },
          }),
        }).catch(() => {});
      } catch (err: any) {
        const msg = err?.message || "Connection failed";
        setError(msg);
        toast.error(msg);
        console.error("Wallet connection error:", err);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    []
  );

  // ─── Disconnect ──────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    try {
      const currentToken = token;
      if (currentToken) {
        // Logout on server (best-effort)
        fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: currentToken }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Logout error:", err);
    }

    // Clear encrypted session
    clearSession();

    // Reset state
    setConnected(false);
    setPublicKey(null);
    setWalletName(null);
    setWalletProvider(null);
    setToken(null);
    setError(null);
    walletStore.reset();

    toast.success("Wallet disconnected");
  }, [token]);

  const clearError = useCallback(() => setError(null), []);

  const signAction = useCallback(
    async (action: string, resourceId: string) => {
      if (!connected || !publicKey || !walletProvider) {
        throw new Error("Wallet not connected");
      }

      const nonce = crypto.randomUUID();
      const timestamp = Date.now();
      const message = `Codely signature request\nAction: ${action}\nResource: ${resourceId}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

      const signature = await signMessage(walletProvider, message);
      if (!signature) {
        throw new Error("Failed to sign message");
      }

      return { signature, nonce, timestamp };
    },
    [connected, publicKey, walletProvider]
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      connected,
      publicKey,
      walletName,
      walletProvider,
      token,
      connecting,
      reconnecting,
      error,
      connect,
      disconnect,
      clearError,
      signAction,
    }),
    [
      connected,
      publicKey,
      walletName,
      walletProvider,
      token,
      connecting,
      reconnecting,
      error,
      connect,
      disconnect,
      clearError,
      signAction,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error(
      "useWallet must be used within a <WalletProvider>"
    );
  }
  return ctx;
}