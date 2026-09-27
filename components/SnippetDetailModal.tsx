"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  GitFork,
  Files,
  Calendar,
  User,
  Shield,
  ExternalLink,
} from "lucide-react";
import { DerivationBadge } from "./DerivationBadge";
import { useWallet } from "./WalletConnect";
import { toast } from "sonner";
import { SnippetSummary } from "@/types/type";
import Loader from "./ui/loader";

interface SnippetDetailModalProps {
  snippetId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDuplicate?: (snippet: SnippetDetail) => Promise<void> | void;
  onFork?: (snippet: SnippetDetail) => void;
  onDeleted?: () => void;
}

export interface SnippetDetail extends SnippetSummary {
  code?: string;
  tags?: string[];
  license_type?: string;
  license_transaction_hash?: string;
  created_at?: string;
  updated_at?: string;
  forked_from_id?: string | null;
  is_fork?: boolean;
}

export function SnippetDetailModal({
  snippetId,
  isOpen,
  onClose,
  onDuplicate,
  onFork,
  onDeleted,
}: SnippetDetailModalProps) {
  const wallet = useWallet();
  const [snippet, setSnippet] = useState<SnippetDetail | null>(null);
  const [originSnippet, setOriginSnippet] = useState<SnippetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!isOpen || !snippetId) {
      setSnippet(null);
      setOriginSnippet(null);
      return;
    }

    async function fetchDetails() {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (wallet?.publicKey) {
          headers["x-wallet-address"] = wallet.publicKey;
        }

        const res = await fetch(`/api/snippets/${snippetId}`, { headers });
        if (!res.ok) throw new Error("Could not load snippet details");
        const data = await res.json();
        setSnippet(data);

        // Fetch derivation origin if forked
        if (data.forked_from_id) {
          try {
            const originRes = await fetch(`/api/snippets/${snippetId}/origin`);
            if (originRes.ok) {
              const originData = await originRes.json();
              if (originData.origin) {
                setOriginSnippet(originData.origin);
              }
            }
          } catch (originErr) {
            console.warn("Failed to fetch origin snippet info:", originErr);
          }
        }
      } catch (err: any) {
        console.error("Failed to load snippet details:", err);
        toast.error(err.message || "Failed to load snippet");
      } finally {
        setLoading(false);
      }
    }

    void fetchDetails();
  }, [snippetId, isOpen, wallet?.publicKey]);

  const handleCopy = async () => {
    if (!snippet?.code) return;
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      toast.success("Code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleDuplicate = async () => {
    if (!snippet) return;
    const walletAddress = wallet?.publicKey;
    if (!walletAddress) {
      toast.error("Please connect your wallet to duplicate this snippet.");
      return;
    }

    try {
      setDuplicating(true);
      const res = await fetch(`/api/snippets/${snippet.id}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({ ownerWalletAddress: walletAddress }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to duplicate snippet");
      }

      const duplicate = await res.json();
      toast.success(`Duplicated "${snippet.title}" to your collection!`);

      if (onDuplicate) {
        await onDuplicate(duplicate);
      }
    } catch (err: any) {
      console.error("Duplicate error:", err);
      toast.error(err.message || "Failed to duplicate snippet");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-slate-900 border-purple-500/30 text-slate-100 backdrop-blur-2xl max-h-[90vh] overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader />
            <p className="text-sm text-slate-400 mt-4">Loading snippet details...</p>
          </div>
        ) : !snippet ? (
          <div className="text-center py-12 text-slate-400">
            Snippet not found or failed to load.
          </div>
        ) : (
          <div className="space-y-6">
            <DialogHeader className="space-y-3 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block bg-purple-600/40 text-purple-200 border border-purple-500/30 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  {snippet.language}
                </span>

                {snippet.forked_from_id && (
                  <DerivationBadge
                    forkedFromId={snippet.forked_from_id}
                    originTitle={originSnippet?.title}
                    size="sm"
                  />
                )}

                {snippet.license_type && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                    <Shield className="h-3 w-3" />
                    {snippet.license_type}
                  </span>
                )}
              </div>

              <DialogTitle className="text-2xl font-bold text-white tracking-tight">
                {snippet.title}
              </DialogTitle>

              {snippet.description && (
                <DialogDescription className="text-slate-300 text-sm leading-relaxed">
                  {snippet.description}
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Code Block with Header Actions */}
            <div className="rounded-xl border border-purple-500/20 bg-slate-950 overflow-hidden shadow-inner">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-purple-500/20 text-xs text-slate-400">
                <span className="font-mono">{snippet.language}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy Code
                    </>
                  )}
                </Button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-80 leading-relaxed">
                <code>{snippet.code}</code>
              </pre>
            </div>

            {/* Tags */}
            {Array.isArray(snippet.tags) && snippet.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-slate-400 mr-1">Tags:</span>
                {snippet.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Metadata Footer Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400 border-t border-purple-500/20 pt-4">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  Created:{" "}
                  {snippet.created_at
                    ? new Date(snippet.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Recently"}
                </span>
              </div>

              {snippet.owner_wallet_address && (
                <div className="flex items-center gap-1.5 truncate">
                  <User className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">
                    Owner:{" "}
                    <span className="font-mono text-slate-300">
                      {snippet.owner_wallet_address.slice(0, 8)}...
                      {snippet.owner_wallet_address.slice(-6)}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons: Duplicate, Fork, Copy */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-purple-500/20">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <Copy className="h-4 w-4 mr-1.5" />
                {copied ? "Copied" : "Copy"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicating}
                className="border-purple-500/40 text-purple-300 hover:bg-purple-600/20 hover:text-white"
              >
                {duplicating ? (
                  <>
                    <Loader /> Duplicating...
                  </>
                ) : (
                  <>
                    <Files className="h-4 w-4 mr-1.5" />
                    Duplicate
                  </>
                )}
              </Button>

              <Button
                size="sm"
                onClick={() => onFork && onFork(snippet)}
                className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-medium gap-1.5 shadow-md"
              >
                <GitFork className="h-4 w-4" />
                Fork Snippet
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SnippetDetailModal;
