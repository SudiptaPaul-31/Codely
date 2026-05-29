"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Trash2, Copy, Plus, Search, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import Loader from "@/components/ui/loader";
import { VersionHistoryPanel } from "@/components/VersionHistory";
import { PermissionsManager } from "@/components/PermissionsManager";
import { useWallet } from "@/components/WalletConnect";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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

const DEFAULT_LIMIT = 20;
const INITIAL_FORM_DATA = {
  title: "",
  description: "",
  code: "",
  language: "javascript",
  tags: "",
};

export default function SnippetsPage() {
  const wallet = useWallet();
  const formRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSnippets();
  }, []);

  const buildSnippetHeaders = useCallback(
    (includeJson = false) => {
      const headers: Record<string, string> = {};

      if (includeJson) {
        headers["Content-Type"] = "application/json";
      }

      if (wallet?.publicKey) {
        headers["x-wallet-address"] = wallet.publicKey;
      }

      if (wallet?.token) {
        headers.Authorization = `Bearer ${wallet.token}`;
      }

      return headers;
    },
    [wallet?.publicKey, wallet?.token],
  );

  const fetchSnippets = async (
    loadMore = false,
    query = activeSearchQuery,
  ) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const currentOffset = loadMore ? offset : 0;
      const params = new URLSearchParams({
        limit: String(DEFAULT_LIMIT),
        offset: String(currentOffset),
      });
      const trimmedQuery = query.trim();

      if (trimmedQuery) {
        params.set("keyword", trimmedQuery);
      }

      const res = await fetch(`/api/snippets?${params.toString()}`);
      
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

  const runSearch = async (query: string) => {
    const trimmedQuery = query.trim();
    setActiveSearchQuery(trimmedQuery);
    setOffset(0);
    setHasMore(true);
    await fetchSnippets(false, trimmedQuery);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery);
  };

  const handleClearSearch = async () => {
    setSearchQuery("");

    if (activeSearchQuery) {
      await runSearch("");
    }

    searchInputRef.current?.focus();
  };

  const startCreateSnippet = useCallback(() => {
    setEditingId(null);
    setFormData({ ...INITIAL_FORM_DATA });
    setError(null);
    setShowForm(true);
  }, []);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const submitSnippetForm = useCallback(() => {
    const form = formRef.current;

    if (!form || saving) return;

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }

    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  }, [saving]);

  const shortcuts = useMemo(
    () => [
      {
        key: "s",
        enabled: showForm,
        onKeyDown: submitSnippetForm,
      },
      {
        key: "k",
        onKeyDown: focusSearch,
      },
      {
        key: "n",
        onKeyDown: startCreateSnippet,
      },
    ],
    [focusSearch, saving, showForm, startCreateSnippet, submitSnippetForm],
  );

  useKeyboardShortcuts(shortcuts);

  useEffect(() => {
    if (showForm) {
      titleInputRef.current?.focus();
    }
  }, [editingId, showForm]);

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
          headers: buildSnippetHeaders(true),
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
    try {
      const res = await fetch(`/api/snippets/${id}`, {
        method: "DELETE",
        headers: buildSnippetHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      
      // Reset pagination and fetch fresh data
      setOffset(0);
      setHasMore(true);
      await fetchSnippets();
    } catch (e) {
      console.error(e);
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
    setFormData({ ...INITIAL_FORM_DATA });
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
              onClick={startCreateSnippet}
              aria-keyshortcuts="Control+N"
              className="rounded-[50px] bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 gap-2"
            >
              <Plus className="w-4 h-4" /> Add Snippet
            </Button>
          )}
        </div>

        <form
          role="search"
          onSubmit={handleSearchSubmit}
          className="mb-8 flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Label htmlFor="snippet-search" className="sr-only">
              Search snippets
            </Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchInputRef}
              id="snippet-search"
              type="search"
              placeholder="Search snippets"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-keyshortcuts="Control+K"
              className="h-10 border-purple-500/30 bg-slate-800/60 pl-10 text-white placeholder:text-slate-400 focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="submit"
              variant="outline"
              className="border-purple-400/50 bg-transparent text-purple-200 hover:bg-purple-400/10"
            >
              <Search className="h-4 w-4" /> Search
            </Button>
            {activeSearchQuery && (
              <Button
                type="button"
                variant="outline"
                onClick={handleClearSearch}
                className="border-slate-600 bg-transparent text-slate-300 hover:bg-slate-800"
              >
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </form>

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
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
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
                  ref={titleInputRef}
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
                  aria-keyshortcuts="Control+S"
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
                onClick={startCreateSnippet}
                aria-keyshortcuts="Control+N"
                className="rounded-[50px] bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
              >
                Create Snippet
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {snippets.map((snippet) => (
                <Card
                  key={snippet.id}
                  className="bg-slate-800/50 border-purple-500/30 backdrop-blur-xl hover:border-purple-500/60 transition overflow-hidden group"
                >
                  <div className="p-6 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1 truncate">
                        {snippet.title}
                      </h3>
                      <p className="text-sm text-gray-400 line-clamp-2">
                        {snippet.description || "No description"}
                      </p>
                    </div>
                    <span className="inline-block bg-purple-600/50 text-purple-100 text-xs px-3 py-1 rounded-full">
                      {snippet.language}
                    </span>
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
                    <div className="flex gap-2 pt-4 border-t border-purple-500/20">
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
              ))}
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
