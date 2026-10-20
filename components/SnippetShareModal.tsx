"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Copy,
  Check,
  Trash2,
  Eye,
  Globe,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import Loader from "@/components/ui/loader";
import { useWallet } from "@/components/WalletConnect";
import { toast } from "sonner";

export type ShareLinkVisibilityOption = "read-only" | "read-write";

export interface ActiveShareLink {
  id: string;
  snippetId: string;
  token: string;
  shareUrl: string;
  visibility: "read-only" | "read-write";
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "revoked";
}

export interface SnippetShareModalProps {
  snippetId: string | null;
  snippetTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  isOwner?: boolean;
}

export function SnippetShareModal({
  snippetId,
  snippetTitle,
  isOpen,
  onClose,
  isOwner = true,
}: SnippetShareModalProps) {
  const wallet = useWallet();
  const [visibility, setVisibility] = useState<ShareLinkVisibilityOption>("read-only");
  const [activeLinks, setActiveLinks] = useState<ActiveShareLink[]>([]);
  const [recentGeneratedLink, setRecentGeneratedLink] = useState<ActiveShareLink | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Fetch active share links for this snippet
  const fetchActiveLinks = useCallback(async () => {
    if (!snippetId) return;
    setLoadingLinks(true);
    setErrorNotice(null);
    try {
      const headers: Record<string, string> = {};
      if (wallet?.publicKey) {
        headers["x-wallet-address"] = wallet.publicKey;
      }
      const res = await fetch(`/api/share-links?snippetId=${encodeURIComponent(snippetId)}`, {
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || "Failed to load share links");
      }

      const payload = await res.json();
      setActiveLinks(Array.isArray(payload.data) ? payload.data : []);
    } catch (err: any) {
      console.error("[SnippetShareModal] Error loading links:", err);
      setErrorNotice(err.message || "Failed to load active share links");
    } finally {
      setLoadingLinks(false);
    }
  }, [snippetId, wallet?.publicKey]);

  // Load active links when modal opens
  useEffect(() => {
    if (isOpen && snippetId) {
      setRecentGeneratedLink(null);
      setErrorNotice(null);
      void fetchActiveLinks();
    }
  }, [isOpen, snippetId, fetchActiveLinks]);

  // Generate a new share link
  const handleGenerateLink = async () => {
    if (!snippetId) return;
    setGenerating(true);
    setErrorNotice(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (wallet?.publicKey) {
        headers["x-wallet-address"] = wallet.publicKey;
      }

      const res = await fetch("/api/share-links", {
        method: "POST",
        headers,
        body: JSON.stringify({
          snippetId,
          visibility,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || payload.message || "Failed to generate share link");
      }

      const newLink: ActiveShareLink = payload.data;
      setRecentGeneratedLink(newLink);

      // Prepend to active links list
      setActiveLinks((prev) => [newLink, ...prev.filter((l) => l.id !== newLink.id)]);

      toast.success("Share link created successfully!");
    } catch (err: any) {
      console.error("[SnippetShareModal] Generate link error:", err);
      const msg = err.message || "Failed to generate share link";
      setErrorNotice(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Copy link to clipboard with visual and toast feedback
  const handleCopyLink = async (linkUrl: string, linkId: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(linkUrl);
      } else {
        // Fallback for non-secure contexts and browsers without Clipboard API.
        const textArea = document.createElement("textarea");
        textArea.value = linkUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        try {
          textArea.focus();
          textArea.select();
          if (!document.execCommand("copy")) {
            throw new Error("Clipboard copy is not supported in this browser");
          }
        } finally {
          document.body.removeChild(textArea);
        }
      }

      setCopiedId(linkId);
      toast.success("Link copied to clipboard!");

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error("[SnippetShareModal] Copy failed:", err);
      toast.error("Failed to copy link to clipboard");
    }
  };

  // Revoke an existing share link
  const handleRevokeLink = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      const headers: Record<string, string> = {};
      if (wallet?.publicKey) {
        headers["x-wallet-address"] = wallet.publicKey;
      }

      const res = await fetch(`/api/share-links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
        headers,
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || payload.message || "Failed to revoke share link");
      }

      // Remove from active links state
      setActiveLinks((prev) => prev.filter((l) => l.id !== linkId));
      if (recentGeneratedLink?.id === linkId) {
        setRecentGeneratedLink(null);
      }

      toast.success("Share link revoked successfully");
    } catch (err: any) {
      console.error("[SnippetShareModal] Revoke error:", err);
      toast.error(err.message || "Failed to revoke share link");
    } finally {
      setRevokingId(null);
    }
  };

  const toggleExpand = (linkId: string) => {
    setExpandedId((prev) => (prev === linkId ? null : linkId));
  };

  const formatCreatedDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Recently";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg sm:max-w-xl bg-slate-900 border-purple-500/30 text-slate-100 backdrop-blur-2xl max-h-[88vh] overflow-y-auto p-5 sm:p-6 shadow-2xl"
        data-testid="snippet-share-modal"
      >
        <DialogHeader className="text-left space-y-1.5 pb-2 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                Share Snippet
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {snippetTitle ? `Create and manage shareable links for "${snippetTitle}"` : "Create and manage shareable links for this snippet"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorNotice && (
          <div className="flex items-start gap-2 p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 mt-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorNotice}</span>
          </div>
        )}

        <div className="space-y-5 pt-3">
          {/* Visibility Selection Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Link Visibility
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setVisibility("read-only")}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                  visibility === "read-only"
                    ? "bg-purple-950/40 border-purple-500 text-white shadow-sm ring-1 ring-purple-500"
                    : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
                data-testid="visibility-read-only"
              >
                <div className={`p-1.5 rounded-md ${visibility === "read-only" ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-400"}`}>
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-100">Read-Only</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-snug">
                    Recipients can view & copy code
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("read-write")}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                  visibility === "read-write"
                    ? "bg-purple-950/40 border-purple-500 text-white shadow-sm ring-1 ring-purple-500"
                    : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
                data-testid="visibility-public"
              >
                <div className={`p-1.5 rounded-md ${visibility === "read-write" ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-400"}`}>
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-100">Public / Collaborative</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-snug">
                    Recipients can view & collaborate
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleGenerateLink}
              disabled={generating || !snippetId}
              className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm gap-2 shadow-lg shadow-purple-900/30"
              data-testid="generate-share-link-button"
            >
              {generating ? (
                <>
                  <Loader /> Generating Link...
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4" />
                  Generate Link
                </>
              )}
            </Button>
          </div>

          {/* Newly Generated Link Callout */}
          {recentGeneratedLink && (
            <div
              className="p-4 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-slate-900/60 to-purple-950/30 space-y-2 animate-in fade-in-50 duration-200"
              data-testid="newly-generated-link-box"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Share Link Ready
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {recentGeneratedLink.visibility === "read-write" ? "Public" : "Read-Only"}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <div className="flex-1 min-w-0 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate select-all" title={recentGeneratedLink.shareUrl}>
                      {expandedId === recentGeneratedLink.id
                        ? recentGeneratedLink.shareUrl
                        : `${recentGeneratedLink.shareUrl.slice(0, 42)}...`}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpand(recentGeneratedLink.id)}
                      className="text-slate-400 hover:text-white p-0.5 shrink-0"
                      title={expandedId === recentGeneratedLink.id ? "Collapse URL" : "Expand full URL"}
                      aria-label="Toggle URL view"
                    >
                      {expandedId === recentGeneratedLink.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleCopyLink(recentGeneratedLink.shareUrl, recentGeneratedLink.id)}
                  className={`h-9 px-3 gap-1.5 text-xs font-medium shrink-0 transition-colors ${
                    copiedId === recentGeneratedLink.id
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-purple-600 hover:bg-purple-500 text-white"
                  }`}
                  data-testid="copy-recent-link-button"
                >
                  {copiedId === recentGeneratedLink.id ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-white" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </Button>
              </div>

              {copiedId === recentGeneratedLink.id && (
                <p className="text-[11px] text-emerald-400 font-medium">Link copied to clipboard!</p>
              )}
            </div>
          )}

          {/* Manage Existing Links Section */}
          <div className="space-y-3 pt-2 border-t border-purple-500/20">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Active Share Links ({activeLinks.length})
              </h4>
            </div>

            {loadingLinks ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                <Loader />
                <span>Loading active links...</span>
              </div>
            ) : activeLinks.length === 0 ? (
              <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-xs text-slate-400">
                No active share links yet. Generate one above to share this snippet.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {activeLinks.map((link) => {
                  const isCopied = copiedId === link.id;
                  const isRevoking = revokingId === link.id;
                  const isExpanded = expandedId === link.id;

                  return (
                    <div
                      key={link.id}
                      className="p-3 rounded-xl border border-slate-800/90 bg-slate-950/60 hover:border-purple-500/30 transition-colors space-y-2"
                      data-testid={`active-share-link-${link.id}`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                              link.visibility === "read-write"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : "bg-sky-500/10 text-sky-300 border-sky-500/30"
                            }`}
                          >
                            {link.visibility === "read-write" ? "Public" : "Read-Only"}
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            {formatCreatedDate(link.createdAt)}
                          </span>
                        </div>

                        {link.expiresAt && (
                          <span className="text-[10px] text-amber-400">
                            Expires {new Date(link.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0 font-mono text-xs text-slate-300 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate select-all" title={link.shareUrl}>
                              {isExpanded ? link.shareUrl : `${link.shareUrl.slice(0, 36)}...`}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(link.id)}
                              className="text-slate-500 hover:text-slate-300 p-0.5 shrink-0"
                              title={isExpanded ? "Collapse" : "Expand"}
                              aria-label="Toggle link expand"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyLink(link.shareUrl, link.id)}
                            className="h-8 px-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                            title="Copy link"
                            aria-label="Copy share link"
                            data-testid={`copy-link-btn-${link.id}`}
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isRevoking}
                            onClick={() => handleRevokeLink(link.id)}
                            className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            title="Revoke link"
                            aria-label="Revoke share link"
                            data-testid={`revoke-link-btn-${link.id}`}
                          >
                            {isRevoking ? <Loader /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>

                      {isCopied && (
                        <p className="text-[10px] text-emerald-400 font-medium">Link copied!</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SnippetShareModal;
