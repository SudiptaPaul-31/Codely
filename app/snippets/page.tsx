"use client";

import React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Copy, Plus, Star } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import Loader from "@/components/ui/loader";
import { VersionHistoryPanel } from "@/components/VersionHistory";
import { PermissionsManager } from "@/components/PermissionsManager";
import VerificationBadge from "@/components/verification-badge";
import VerifyOwnershipButton from "@/components/verify-ownership-button";
import { useWallet } from "@/components/WalletConnect";

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "csharp",
  "cpp",
  "go",
  "rust",
  "php",
  "ruby",
  "sql",
  "html",
  "css",
  "bash",
];

interface Snippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  owner_wallet_address: string | null;
  created_at: string;
  updated_at: string;
}

// Paginated response interface
interface PaginatedResponse {
  data: Snippet[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface VerificationStatus {
  verified: boolean;
  walletAddress?: string;
  verifiedAt?: string;
}

const DEFAULT_LIMIT = 20;

export default function SnippetsPage() {
  const wallet = useWallet();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    code: "",
    language: "javascript",
    tags: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationStatuses, setVerificationStatuses] = useState<Record<string, VerificationStatus>>({});
  const [favoriteStatuses, setFavoriteStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSnippets();
  }, []);

  const fetchVerificationStatuses = async (snippetList: Snippet[]) => {
    try {
      const statuses = await Promise.all(
        snippetList.map(async (snippet) => {
          try {
            const res = await fetch(`/api/snippets/${snippet.id}/verification-status`);
            if (!res.ok) {
              return [snippet.id, { verified: false } as VerificationStatus] as const;
            }
            const json = await res.json();
            return [
              snippet.id,
              {
                verified: Boolean(json.verification),
                walletAddress: json.verification?.wallet_address,
                verifiedAt: json.verification?.verified_at,
              } as VerificationStatus,
            ] as const;
          } catch (err) {
            console.error("Failed to fetch verification status for snippet:", snippet.id, err);
            return [snippet.id, { verified: false } as VerificationStatus] as const;
          }
        }),
      );

      setVerificationStatuses((prev) => ({ ...prev, ...Object.fromEntries(statuses) }));
    } catch (err) {
      console.error("Failed to load verification statuses:", err);
    }
  };

  const fetchFavoriteStatuses = async (snippetIds: string[]) => {
    try {
      const res = await fetch("/api/favorites/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippetIds }),
      });
      if (res.ok) {
        const statuses = await res.json();
        setFavoriteStatuses((prev) => ({ ...prev, ...statuses }));
      }
    } catch (err) {
      console.error("Failed to fetch favorite statuses:", err);
    }
  };

  const toggleFavorite = async (snippetId: string) => {
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippetId }),
      });
      if (res.ok) {
        const result = await res.json();
        setFavoriteStatuses((prev) => ({ ...prev, [snippetId]: result.favorited }));
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const fetchSnippets = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setVerificationStatuses({});
      }
      
      const currentOffset = loadMore ? offset : 0;
      const res = await fetch(`/api/snippets?limit=${DEFAULT_LIMIT}&offset=${currentOffset}`);
      
      if (!res.ok) throw new Error("Failed to fetch snippets");
      
      const data: PaginatedResponse = await res.json();
      
      if (loadMore) {
        setSnippets(prev => [...prev, ...data.data]);
      } else {
        setSnippets(data.data);
      }
      
      setTotal(data.total);
      setHasMore(data.hasMore);
      setOffset(currentOffset + data.data.length);
      await fetchVerificationStatuses(data.data);
      await fetchFavoriteStatuses(data.data.map((s) => s.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchSnippets(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const res = await fetch(
        editingId ? `/api/snippets/${editingId}` : "/api/snippets",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error("Failed to save snippet");
      
      // Reset pagination and fetch fresh data
      setOffset(0);
      setHasMore(true);
      await fetchSnippets();
      handleCancel();
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to save snippet. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (s: Snippet) => {
    setEditingId(s.id);
    setFormData({
      title: s.title,
      description: s.description,
      code: s.code,
      language: s.language,
      tags: Array.isArray(s.tags) ? s.tags.join(", ") : "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snippet?")) return;
    
    let signatureData = null;
    
    // Request wallet signature if connected
    if (wallet?.connected && wallet?.signAction) {
      try {
        signatureData = await wallet.signAction("delete_snippet", id);
      } catch (err: any) {
        console.error("Signature failed:", err);
        alert(`Signature required to delete snippet: ${err.message}`);
        return; // Abort deletion if signature fails
      }
    }
    
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      
      // Include signature headers if available
      if (signatureData) {
        headers["x-wallet-signature"] = signatureData.signature;
        headers["x-wallet-nonce"] = signatureData.nonce;
        headers["x-wallet-timestamp"] = signatureData.timestamp.toString();
        headers["x-wallet-address"] = wallet.publicKey;
      }
      
      // Add standard auth header if token exists
      if (wallet?.token) {
        headers["Authorization"] = `Bearer ${wallet.token}`;
      }
      
      const res = await fetch(`/api/snippets/${id}`, { 
        method: "DELETE",
        headers
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || "Failed to delete snippet");
      }
      
      // Reset pagination and fetch fresh data
      setOffset(0);
      setHasMore(true);
      await fetchSnippets();
    } catch (e: any) {
      console.error(e);
      alert(e.message || "An error occurred");
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setError(null);
    setFormData({
      title: "",
      description: "",
      code: "",
      language: "javascript",
      tags: "",
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />

      <main className="flex-1 min-w-0 relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse animation-delay-1000" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:pl-8">
        {/* Page heading row */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">My Snippets</h1>
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="rounded-[50px] bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 gap-2"
            >
              <Plus className="w-4 h-4" /> Add Snippet
            </Button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <Card
            className="mb-10 relative overflow-hidden
  bg-linear-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80
  border border-purple-500/20
  backdrop-blur-2xl
  shadow-2xl shadow-purple-500/10
  p-8 rounded-2xl"
          >
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingId ? "Edit Snippet" : "Add New Snippet"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 rounded bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-slate-300 font-medium">
                  Title
                </Label>
                <Input
                  id="title"
                  placeholder="e.g., React useEffect Hook"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      title: e.target.value,
                    })
                  }
                  className="bg-slate-800/60
border border-purple-500/30
text-white
placeholder:text-slate-400
focus:border-purple-400
focus:ring-2
focus:ring-purple-500/30
transition-all duration-200"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="description"
                  className="text-slate-300 font-medium"
                >
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this snippet does..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                  className="bg-slate-800/60
border border-purple-500/30
text-white
placeholder:text-slate-400
focus:border-purple-400
focus:ring-2
focus:ring-purple-500/30
transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 font-medium">Language</Label>
                <Select
                  value={formData.language}
                  onValueChange={(v) =>
                    setFormData({ ...formData, language: v })
                  }
                >
                  <SelectTrigger
                    className="bg-slate-800/60
border border-purple-500/30
text-white
placeholder:text-slate-400
focus:border-purple-400
focus:ring-2
focus:ring-purple-500/30
transition-all duration-200"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-300 font-medium">
                  Code
                </Label>
                <Textarea
                  id="code"
                  placeholder="Paste your code here..."
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  className="bg-slate-800/60
border border-purple-500/30
text-white
placeholder:text-slate-400
focus:border-purple-400
focus:ring-2
focus:ring-purple-500/30
transition-all duration-200"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-slate-300 font-medium">
                  Tags (comma-separated)
                </Label>
                <Input
                  id="tags"
                  placeholder="e.g., react, hooks, useEffect"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({ ...formData, tags: e.target.value })
                  }
                  className="bg-slate-800/60
border border-purple-500/30
text-white
placeholder:text-slate-400
focus:border-purple-400
focus:ring-2
focus:ring-purple-500/30
transition-all duration-200"
                />
              </div>
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 min-w-30"
                >
                  {saving ? (
                    <Loader />
                  ) : editingId ? (
                    "Update Snippet"
                  ) : (
                    "Save Snippet"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  className="border-purple-400/50 text-white bg-transparent"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Grid */}
        {loading ? (
          <div className="w-full h-full flex items-center justify-center ">
            <Loader />
          </div>
        ) : snippets.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="mb-4 text-slate-900 font-medium ">
              No snippets yet. Create your first one!
            </p>
            {!showForm && (
              <Button
                onClick={() => setShowForm(true)}
                className="rounded-[50px] bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
              >
                Create Snippet
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {snippets.map((snippet) => {
                const verificationStatus = verificationStatuses[snippet.id] || {
                  verified: false,
                };
                const isOwner =
                  wallet?.publicKey && snippet.owner_wallet_address
                    ? wallet.publicKey.toUpperCase() === snippet.owner_wallet_address.toUpperCase()
                    : false;

                return (
                  <Card
                    key={snippet.id}
                    className="bg-slate-800/50 border-purple-500/30 backdrop-blur-xl hover:border-purple-500/60 transition overflow-hidden group"
                  >
                    <div className="p-6 space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="text-lg font-semibold text-white mb-1 truncate">
                                {snippet.title}
                              </h3>
                              <p className="text-sm text-gray-400 line-clamp-2">
                                {snippet.description || "No description"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(snippet.id);
                              }}
                              className={
                                favoriteStatuses[snippet.id]
                                  ? "text-amber-400 hover:text-amber-300"
                                  : "text-gray-400 hover:text-gray-300"
                              }
                            >
                              <Star
                                className="w-5 h-5"
                                fill={favoriteStatuses[snippet.id] ? "currentColor" : "none"}
                              />
                            </Button>
                            {verificationStatus.verified && (
                              <VerificationBadge
                                verified={verificationStatus.verified}
                                walletAddress={verificationStatus.walletAddress}
                                verifiedAt={verificationStatus.verifiedAt}
                              />
                            )}
                          </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block bg-purple-600/50 text-purple-100 text-xs px-3 py-1 rounded-full">
                            {snippet.language}
                          </span>
                          {isOwner && !verificationStatus.verified && (
                            <span className="text-xs text-slate-400">
                              Owns snippet — ready to verify
                            </span>
                          )}
                        </div>
                      </div>
                    <div className="bg-slate-900/50 border border-purple-500/20 rounded p-3 max-h-32 overflow-hidden">
                      <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
                        {snippet.code.slice(0, 200)}
                        {snippet.code.length > 200 ? "..." : ""}
                      </pre>
                    </div>
                    {Array.isArray(snippet.tags) && snippet.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {snippet.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-blue-600/30 text-blue-200 px-2 py-1 rounded"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 border-t border-purple-500/20 pt-4">
                      Created: {new Date(snippet.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-4 border-t border-purple-500/20">
                      <Button
                        onClick={() => handleCopy(snippet.code)}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-purple-400/50 text-purple-300 hover:bg-purple-400/10"
                      >
                        <Copy className="w-4 h-4 mr-2" /> Copy
                      </Button>
                      <VersionHistoryPanel
                        snippetId={snippet.id}
                        onRestore={() => fetchSnippets()}
                      />
                      {snippet.owner_wallet_address && (
                        <PermissionsManager
                          snippetId={snippet.id}
                          snippetTitle={snippet.title}
                          ownerWalletAddress={snippet.owner_wallet_address}
                        />
                      )}
                      {!verificationStatus.verified && (
                        <VerifyOwnershipButton
                          snippetId={snippet.id}
                          isOwner={isOwner}
                          onSuccess={() => {
                            setOffset(0);
                            setHasMore(true);
                            fetchSnippets();
                          }}
                          className="flex-1"
                        />
                      )}
                      <Button
                        onClick={() => handleEdit(snippet)}
                        size="sm"
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDelete(snippet.id)}
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-[50px] bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 gap-2"
                >
                  {loadingMore ? (
                    <>
                      <Loader /> Loading...
                    </>
                  ) : (
                    <>Load More ({snippets.length} of {total})</>
                  )}
                </Button>
              </div>
            )}
            
            {!hasMore && snippets.length > 0 && (
              <p className="text-center text-gray-400 mt-8">
                Showing all {total} snippets
              </p>
            )}
          </>
        )}
      </div>
      </main>
    </div>
  );
}
