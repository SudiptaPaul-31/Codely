"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Code2,
  Eye,
  EyeOff,
} from "lucide-react";
import { DerivationBadge } from "./DerivationBadge";
import { UsageInstructionsPanel } from "./UsageInstructionsPanel";
import { useWallet } from "./WalletConnect";
import { toast } from "sonner";
import { SnippetSummary } from "@/types/type";
import Loader from "./ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

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
  visibility?: "private" | "public" | "shared";
  /** Raw `usage_instructions` column; parsed by UsageInstructionsPanel. */
  usage_instructions?: unknown;
}

type EmbedTheme = "light" | "dark" | "system";

interface EmbedConfig {
  theme: EmbedTheme;
  showTitle: boolean;
  showAuthor: boolean;
  showLanguage: boolean;
  showLineNumbers: boolean;
  showCopyButton: boolean;
  showDependencies: boolean;
  showUpdatedAt: boolean;
  responsiveWidth: boolean;
  fixedWidth: number;
  autoHeight: boolean;
  fixedHeight: number;
  wrapCode: boolean;
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
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedConfig, setEmbedConfig] = useState<EmbedConfig>({
    theme: "dark",
    showTitle: true,
    showAuthor: false,
    showLanguage: true,
    showLineNumbers: true,
    showCopyButton: true,
    showDependencies: false,
    showUpdatedAt: false,
    responsiveWidth: true,
    fixedWidth: 600,
    autoHeight: true,
    fixedHeight: 500,
    wrapCode: false,
  });
  const [embedCopied, setEmbedCopied] = useState(false);

  const isOwner =
    !!snippet?.owner_wallet_address &&
    !!wallet?.publicKey &&
    snippet.owner_wallet_address === wallet.publicKey;

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

  const handleChangeVisibility = async (
    visibility: "private" | "public" | "shared",
  ) => {
    if (!snippet || !wallet?.publicKey) return;

    try {
      setSavingVisibility(true);
      const res = await fetch(`/api/snippets/${snippet.id}/visibility`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": wallet.publicKey,
          ...(wallet?.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
        },
        body: JSON.stringify({ visibility }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to change visibility");
      }

      setSnippet({ ...snippet, visibility });
      toast.success(`Snippet is now ${visibility}`);
    } catch (err: any) {
      console.error("Visibility change error:", err);
      toast.error(err.message || "Failed to change visibility");
    } finally {
      setSavingVisibility(false);
    }
  };

  const isPublic = snippet?.visibility === "public";

  const embedUrl = useMemo(() => {
    if (!snippet) return "";
    const base =
      typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams();
    params.set("theme", embedConfig.theme);
    params.set("title", String(embedConfig.showTitle));
    params.set("author", String(embedConfig.showAuthor));
    params.set("language", String(embedConfig.showLanguage));
    params.set("lineNumbers", String(embedConfig.showLineNumbers));
    params.set("copyButton", String(embedConfig.showCopyButton));
    params.set("dependencies", String(embedConfig.showDependencies));
    params.set("updatedAt", String(embedConfig.showUpdatedAt));
    params.set("wrap", String(embedConfig.wrapCode));
    return `${base}/embed/snippets/${snippet.id}?${params.toString()}`;
  }, [snippet, embedConfig]);

  const embedCode = useMemo(() => {
    if (!snippet || !isPublic) return "";
    const width = embedConfig.responsiveWidth
      ? "100%"
      : String(embedConfig.fixedWidth);
    const height = embedConfig.autoHeight
      ? "500"
      : String(embedConfig.fixedHeight);
    return `<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  loading="lazy"
  title="Embedded Code Snippet: ${snippet.title.replace(/"/g, "&quot;")}"
  style="border:0;border-radius:8px;"
></iframe>`;
  }, [snippet, isPublic, embedUrl, embedConfig]);

  const handleCopyEmbed = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
      toast.success("Embed code copied to clipboard!");
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch {
      toast.error("Failed to copy embed code");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-full bg-slate-900 border-purple-500/30 text-slate-100 backdrop-blur-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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

              
              {snippet.visibility && snippet.visibility !== "public" && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${
                      snippet.visibility === "private"
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    {snippet.visibility === "private" ? "Private" : "Shared"}
                  </span>
                )}

              <DialogTitle className="text-2xl font-bold text-white tracking-tight">
                {snippet.title}
              </DialogTitle>

              {snippet.description && (
                <DialogDescription className="text-slate-300 text-sm leading-relaxed">
                  {snippet.description}
                </DialogDescription>
              )}
            </DialogHeader>

            {isOwner && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-500/20 bg-slate-900/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Visibility</p>
                  <p className="text-xs text-slate-400">
                    Who can see this snippet.
                  </p>
                </div>
                <Select
                  value={snippet.visibility || "private"}
                  onValueChange={(v) =>
                    handleChangeVisibility(
                      v as "private" | "public" | "shared",
                    )
                  }
                  disabled={savingVisibility}
                >
                  <SelectTrigger className="w-44 bg-slate-800/60 border-purple-500/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}


            {/* Usage Instructions: author documentation, distinct from the code below */}
            <UsageInstructionsPanel
              snippetId={snippet.id}
              usage={snippet.usage_instructions}
              isOwner={isOwner}
              token={wallet?.token}
              onChange={(usage_instructions) => setSnippet({ ...snippet, usage_instructions })}
            />

            {/* Code Block with Header Actions */}
            <h3 className="text-sm font-semibold text-slate-300 -mb-4">Source code</h3>
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
            <h3 className="sr-only">Details</h3>
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
                onClick={() => setEmbedOpen(true)}
                disabled={!isPublic}
                title={!isPublic ? "Only public snippets can be embedded" : "Generate embed code"}
                className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/20 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Code2 className="h-4 w-4 mr-1.5" />
                Embed
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

        {snippet && (
          <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
            <DialogContent className="max-w-4xl bg-slate-900 border-purple-500/30 text-slate-100 backdrop-blur-2xl max-h-[90vh] overflow-y-auto p-6">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-cyan-400" />
                  Embed Snippet
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-sm">
                  Customize how this snippet appears when embedded on external sites.
                </DialogDescription>
              </DialogHeader>

              {!isPublic ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <EyeOff className="h-4 w-4" />
                    Embedding unavailable
                  </div>
                  Only publicly accessible snippets can be embedded. Change this snippet's
                  visibility to public to enable embed generation.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Configuration Panel */}
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="embed-theme" className="text-sm font-medium text-slate-200">
                        Theme
                      </Label>
                      <Select
                        value={embedConfig.theme}
                        onValueChange={(v) =>
                          setEmbedConfig((c) => ({ ...c, theme: v as EmbedTheme }))
                        }
                      >
                        <SelectTrigger
                          id="embed-theme"
                          className="bg-slate-800/60 border-purple-500/30 text-white"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-slate-200 mb-2">
                        Display Options
                      </legend>
                      {(
                        [
                          ["showTitle", "Show Title"],
                          ["showAuthor", "Show Author"],
                          ["showLanguage", "Show Language"],
                          ["showLineNumbers", "Show Line Numbers"],
                          ["showCopyButton", "Show Copy Button"],
                          ["showDependencies", "Show Dependencies"],
                          ["showUpdatedAt", "Show Last Updated"],
                        ] as [keyof EmbedConfig, string][]
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                          <Checkbox
                            id={`embed-${key}`}
                            checked={embedConfig[key] as boolean}
                            onCheckedChange={(checked) =>
                              setEmbedConfig((c) => ({ ...c, [key]: !!checked }))
                            }
                          />
                          <Label
                            htmlFor={`embed-${key}`}
                            className="text-sm text-slate-300 cursor-pointer"
                          >
                            {label}
                          </Label>
                        </div>
                      ))}
                    </fieldset>

                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium text-slate-200 mb-2">
                        Layout
                      </legend>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="embed-responsive" className="text-sm text-slate-300">
                          Responsive Width
                        </Label>
                        <Switch
                          id="embed-responsive"
                          checked={embedConfig.responsiveWidth}
                          onCheckedChange={(checked) =>
                            setEmbedConfig((c) => ({ ...c, responsiveWidth: checked }))
                          }
                        />
                      </div>
                      {!embedConfig.responsiveWidth && (
                        <div className="space-y-1">
                          <Label htmlFor="embed-width" className="text-xs text-slate-400">
                            Fixed Width (px)
                          </Label>
                          <Input
                            id="embed-width"
                            type="number"
                            min={200}
                            max={2000}
                            value={embedConfig.fixedWidth}
                            onChange={(e) =>
                              setEmbedConfig((c) => ({
                                ...c,
                                fixedWidth: Math.max(200, Math.min(2000, Number(e.target.value) || 600)),
                              }))
                            }
                            className="bg-slate-800/60 border-purple-500/30 text-white"
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="embed-autoheight" className="text-sm text-slate-300">
                          Auto Height
                        </Label>
                        <Switch
                          id="embed-autoheight"
                          checked={embedConfig.autoHeight}
                          onCheckedChange={(checked) =>
                            setEmbedConfig((c) => ({ ...c, autoHeight: checked }))
                          }
                        />
                      </div>
                      {!embedConfig.autoHeight && (
                        <div className="space-y-1">
                          <Label htmlFor="embed-height" className="text-xs text-slate-400">
                            Fixed Height (px)
                          </Label>
                          <Input
                            id="embed-height"
                            type="number"
                            min={100}
                            max={2000}
                            value={embedConfig.fixedHeight}
                            onChange={(e) =>
                              setEmbedConfig((c) => ({
                                ...c,
                                fixedHeight: Math.max(100, Math.min(2000, Number(e.target.value) || 500)),
                              }))
                            }
                            className="bg-slate-800/60 border-purple-500/30 text-white"
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="embed-wrap" className="text-sm text-slate-300">
                          Wrap Code
                        </Label>
                        <Switch
                          id="embed-wrap"
                          checked={embedConfig.wrapCode}
                          onCheckedChange={(checked) =>
                            setEmbedConfig((c) => ({ ...c, wrapCode: checked }))
                          }
                        />
                      </div>
                    </fieldset>
                  </div>

                  {/* Preview Panel */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                      <Eye className="h-4 w-4 text-cyan-400" />
                      Live Preview
                    </div>
                    <div
                      className={`rounded-xl border overflow-hidden ${
                        embedConfig.theme === "light"
                          ? "bg-white border-slate-300 text-slate-900"
                          : "bg-slate-950 border-purple-500/20 text-slate-100"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between px-3 py-2 text-xs border-b ${
                          embedConfig.theme === "light"
                            ? "bg-slate-100 border-slate-300 text-slate-600"
                            : "bg-slate-900/80 border-purple-500/20 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {embedConfig.showLanguage && (
                            <span className="inline-block bg-purple-600/40 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded-full text-[10px] font-medium">
                              {snippet.language}
                            </span>
                          )}
                          {embedConfig.showTitle && (
                            <span className="font-medium truncate">{snippet.title}</span>
                          )}
                        </div>
                        {embedConfig.showCopyButton && (
                          <span className="text-[10px] opacity-70">Copy</span>
                        )}
                      </div>
                      <pre
                        className={`p-3 text-[11px] font-mono leading-relaxed max-h-64 overflow-auto ${
                          embedConfig.wrapCode ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                        }`}
                      >
                        <code>
                          {(snippet.code || "").split("\n").map((line, i) => (
                            <div key={i} className="flex">
                              {embedConfig.showLineNumbers && (
                                <span className="select-none opacity-40 mr-3 text-right w-6 shrink-0">
                                  {i + 1}
                                </span>
                              )}
                              <span>{line || "\u00A0"}</span>
                            </div>
                          ))}
                        </code>
                      </pre>
                      {(embedConfig.showAuthor || embedConfig.showUpdatedAt || embedConfig.showDependencies) && (
                        <div
                          className={`px-3 py-2 text-[10px] border-t flex flex-wrap gap-3 ${
                            embedConfig.theme === "light"
                              ? "border-slate-300 text-slate-600"
                              : "border-purple-500/20 text-slate-400"
                          }`}
                        >
                          {embedConfig.showAuthor && snippet.owner_wallet_address && (
                            <span>
                              by {snippet.owner_wallet_address.slice(0, 6)}...
                              {snippet.owner_wallet_address.slice(-4)}
                            </span>
                          )}
                          {embedConfig.showUpdatedAt && snippet.updated_at && (
                            <span>
                              Updated {new Date(snippet.updated_at).toLocaleDateString()}
                            </span>
                          )}
                          {embedConfig.showDependencies && (
                            <span>Dependencies: —</span>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Preview approximates the final embedded appearance.
                    </p>
                  </div>
                </div>
              )}

              {isPublic && (
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <Label htmlFor="embed-code" className="text-sm font-medium text-slate-200">
                    Generated Embed Code
                  </Label>
                  <Textarea
                    id="embed-code"
                    readOnly
                    value={embedCode}
                    rows={6}
                    className="font-mono text-xs bg-slate-950 border-purple-500/20 text-slate-200 resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleCopyEmbed}
                      className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white gap-1.5"
                    >
                      {embedCopied ? (
                        <>
                          <Check className="h-4 w-4" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" /> Copy Embed Code
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SnippetDetailModal;
