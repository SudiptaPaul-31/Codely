"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { useWallet } from "@/components/WalletConnect";
import { toast } from "sonner";

interface VerifyOwnershipModalProps {
  snippetId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function VerifyOwnershipModal({
  snippetId,
  isOpen,
  onClose,
  onSuccess,
}: VerifyOwnershipModalProps) {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [signature, setSignature] = useState<string>("");

  // Generate verification message
  const generateMessage = useCallback(() => {
    const timestamp = new Date().toISOString();
    const msg = `Verify ownership of snippet ${snippetId} at ${timestamp}`;
    setMessage(msg);
    return msg;
  }, [snippetId]);

  // Initialize message when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setSignature("");
      generateMessage();
    }
  }, [isOpen, generateMessage]);

  // Sign message with wallet
  const handleSign = useCallback(async () => {
    if (!wallet?.publicKey) {
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }

    if (!message) {
      setError("Message generation failed. Please try again.");
      return;
    }

    try {
      setSigning(true);
      setError(null);

      let sig: string | null = null;

      // Sign with Freighter
      if (window.freighter || window.freighterApi) {
        const freighter = window.freighter || window.freighterApi;
        sig = await freighter.signMessage(message, {
          domain: "codely.app",
        });
      } else {
        setError("Freighter wallet not detected. Please ensure it is installed.");
        return;
      }

      if (!sig) {
        throw new Error("Failed to sign message");
      }

      setSignature(sig);
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to sign message";
      setError(errorMessage);
      console.error("Signing error:", err);
    } finally {
      setSigning(false);
    }
  }, [wallet?.publicKey, message]);

  // Submit verification to API
  const handleVerify = useCallback(async () => {
    if (!wallet?.publicKey) {
      setError("Wallet not connected");
      return;
    }

    if (!signature) {
      setError("Please sign the message first");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/snippets/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippetId,
          walletAddress: wallet.publicKey,
          signature,
          message,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Verification failed. Please try again."
        );
      }

      toast.success("Snippet ownership verified successfully!");
      onSuccess();
    } catch (err: any) {
      const errorMessage = err?.message || "Verification failed";
      setError(errorMessage);
      console.error("Verification error:", err);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [wallet?.publicKey, signature, message, snippetId, onSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify Snippet Ownership</DialogTitle>
          <DialogDescription>
            Sign a message with your wallet to verify you own this snippet on
            the blockchain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Message Display */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Message to Sign
            </label>
            <div className="p-3 rounded-md bg-muted border border-input">
              <p className="text-xs font-mono break-all text-foreground">
                {message}
              </p>
            </div>
          </div>

          {/* Wallet Connection Status */}
          <div className="text-sm">
            {wallet?.connected ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-muted-foreground">
                  Wallet connected:{" "}
                  <span className="font-mono">
                    {wallet.publicKey?.slice(0, 8)}...
                    {wallet.publicKey?.slice(-8)}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-red-500">Wallet not connected</span>
              </div>
            )}
          </div>

          {/* Signature Status */}
          {signature && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Signature
              </label>
              <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-xs font-mono break-all text-green-700 dark:text-green-400">
                  {signature.slice(0, 32)}...
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={signing || loading}
          >
            Cancel
          </Button>

          {!signature ? (
            <Button
              type="button"
              onClick={handleSign}
              disabled={
                signing || !wallet?.connected || !message || loading
              }
              className="gap-2"
            >
              {signing && <Loader />}
              {signing ? "Signing..." : "Sign with Wallet"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleVerify}
              disabled={loading || signing}
              className="gap-2"
            >
              {loading && <Loader />}
              {loading ? "Verifying..." : "Verify Ownership"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
