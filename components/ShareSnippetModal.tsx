"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "./WalletConnect";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export type ShareVisibility = "read-only" | "read-write";

export interface ShareLink {
  id: string;
  snippetId: string;
  shareUrl: string;
  visibility: ShareVisibility;
  createdAt: string;
  status: "active" | "expired" | "revoked";
}

interface ShareSnippetModalProps {
  snippetId: string;
  snippetTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny access.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand?.("copy") ?? false;
  document.body.removeChild(input);
  if (!copied) throw new Error("Clipboard access is unavailable");
}

export function ShareSnippetModal({
  snippetId,
  snippetTitle,
  isOpen,
  onClose,
}: ShareSnippetModalProps) {
  const wallet = useWallet();
  const [visibility, setVisibility] = useState<ShareVisibility>("read-only");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const requestHeaders = useCallback((): HeadersInit => ({
    "Content-Type": "application/json",
    ...(wallet.publicKey ? { "x-wallet-address": wallet.publicKey } : {}),
    ...(wallet.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
  }), [wallet.publicKey, wallet.token]);

  const loadLinks = useCallback(async () => {
    if (!wallet.publicKey) {
      setError("Connect the owner wallet to manage share links.");
      setLinks([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/share-links?snippetId=${encodeURIComponent(snippetId)}`,
        { headers: requestHeaders() },
      );
      const body = await response.json() as ApiResponse<ShareLink[]>;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Failed to load share links");
      }
      setLinks(body.data ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load share links");
    } finally {
      setLoading(false);
    }
  }, [requestHeaders, snippetId, wallet.publicKey]);

  useEffect(() => {
    if (!isOpen) {
      setFeedback("");
      setError("");
      setCopiedId(null);
      return;
    }
    void loadLinks();
  }, [isOpen, loadLinks]);

  const createLink = async () => {
    if (!wallet.publicKey) {
      setError("Connect the owner wallet to create a share link.");
      return;
    }

    setCreating(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/share-links", {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ snippetId, visibility }),
      });
      const body = await response.json() as ApiResponse<ShareLink>;
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.error || "Failed to generate share link");
      }
      setLinks((current) => [body.data!, ...current]);
      setFeedback("Share link created.");
      toast.success("Share link created");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Failed to generate share link";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (link: ShareLink) => {
    try {
      await copyToClipboard(link.shareUrl);
      setCopiedId(link.id);
      setFeedback("Link copied!");
      toast.success("Link copied to clipboard");
      window.setTimeout(() => setCopiedId((id) => id === link.id ? null : id), 2000);
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
      toast.error("Failed to copy link");
    }
  };

  const revokeLink = async (link: ShareLink) => {
    setRevokingId(link.id);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/share-links/${encodeURIComponent(link.id)}`, {
        method: "DELETE",
        headers: requestHeaders(),
      });
      const body = await response.json() as ApiResponse<ShareLink>;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Failed to revoke share link");
      }
      setLinks((current) => current.filter((item) => item.id !== link.id));
      setFeedback("Share link revoked.");
      toast.success("Share link revoked");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Failed to revoke share link";
      setError(message);
      toast.error(message);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border-purple-500/30 bg-slate-950 p-4 text-slate-100 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Link2 className="h-5 w-5 text-purple-300" />
            Share snippet
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Generate and manage secure links{snippetTitle ? ` for “${snippetTitle}”` : ""}.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-xl border border-purple-500/20 bg-slate-900/60 p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-200">Link visibility</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-700 p-3 has-[:checked]:border-purple-400 has-[:checked]:bg-purple-500/10">
                <input
                  type="radio"
                  name="share-visibility"
                  value="read-only"
                  checked={visibility === "read-only"}
                  onChange={() => setVisibility("read-only")}
                  className="mt-1 accent-purple-500"
                />
                <span>
                  <span className="block text-sm font-medium text-white">Read-only</span>
                  <span className="block text-xs text-slate-400">Anyone with the link can view.</span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-700 p-3 has-[:checked]:border-purple-400 has-[:checked]:bg-purple-500/10">
                <input
                  type="radio"
                  name="share-visibility"
                  value="read-write"
                  checked={visibility === "read-write"}
                  onChange={() => setVisibility("read-write")}
                  className="mt-1 accent-purple-500"
                />
                <span>
                  <span className="block text-sm font-medium text-white">Public collaboration</span>
                  <span className="block text-xs text-slate-400">Anyone with the link can view and edit.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <Button
            type="button"
            onClick={createLink}
            disabled={creating || !wallet.publicKey}
            className="w-full bg-purple-600 text-white hover:bg-purple-500 sm:w-auto"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {creating ? "Generating…" : "Generate link"}
          </Button>
        </section>

        <div aria-live="polite" role="status" className="min-h-5 text-sm text-emerald-300">
          {feedback}
        </div>
        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section aria-label="Active share links" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Active links</h3>
            <span className="text-xs text-slate-500">{links.length} active</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading links…
            </div>
          ) : links.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
              No active links yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-200">
                          <Shield className="h-3 w-3" />
                          {link.visibility === "read-only" ? "Read-only" : "Public collaboration"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(link.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <input
                        aria-label="Share link"
                        readOnly
                        value={link.shareUrl}
                        onFocus={(event) => event.currentTarget.select()}
                        className="w-full truncate rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-300 outline-none focus:border-purple-400"
                      />
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="Copy share link"
                        onClick={() => void copyLink(link)}
                        className="flex-1 border-slate-700 text-slate-200 sm:flex-none"
                      >
                        {copiedId === link.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        {copiedId === link.id ? "Copied" : "Copy"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="Revoke share link"
                        disabled={revokingId === link.id}
                        onClick={() => void revokeLink(link)}
                        className="flex-1 border-rose-500/40 text-rose-300 hover:bg-rose-500/10 sm:flex-none"
                      >
                        {revokingId === link.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Revoke
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

export default ShareSnippetModal;
