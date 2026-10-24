"tuse client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import CollectionBadge from "@/components/CollectionBadge";
import CollectionManager from "@/components/CollectionManager";
import { useWallet } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layers, ChevronRight, Search, Globe, Lock, ExternalLink, Files, GitFork, Eye } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { recordRecentSnippet } from "@/lib/recent-snippets-storage";
import { DerivationBadge } from "@/components/DerivationBadge";
import { SnippetDetailModal } from "@/components/SnippetDetailModal";
import { ForkSnippetModal, SnippetToFork } from "@/components/ForkSnippetModal";
import { EmbedSnippetModal } from "@/components/EmbedSnippetModal";

interface Collection {
  id: string;
  title: string;
  description: string;
  tags: string[];
  owner_wallet_address: string;
  is_public: boolean;
  on_chain_tx_hash: string | null;
  on_chain_anchor: string | null;
  snippet_count: number;
  created_at: string;
}

interface Snippet {
  id: string;
  title: string;
  language: string;
  description: string;
  tags: string[];
  forked_from_id?: string | null;
  is_fork?: boolean;
  license_type?: string;
  license_transaction_hash?: string;
  is_public?: boolean;
}

export default function CollectionsPage() {
  const wallet = useWallet();
  const walletAddress = wallet?.publicKey;

  const [myCollections, setMyCollections] = useState<Collection[]>([]);
  const [publicCollections, setPublicCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionSnippets, setCollectionSnippets] = useState<Snippet[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [loadingSnippets, setLoadingSnippets] = useState(false);
  const [tab, setTab] = useState<"mine" | "public">("mine");
  const [search, setSearch] = useState("");

  // Modals
  const [detailSnippetId, setDetailSnippetId] = useState<string | null>(null);
  const [forkingSnippet, setForkingSnippet] = useState<SnippetToFork | null>(null);
  const [embedSnippet, setEmbedSnippet] = useState<Snippet | null>(null);

  const fetchMine = useCallback(async () => {
    if (!walletAddress) return;
    setLoadingMine(true);
    try {
      const res = await fetch(`/api/collections?wallet=${encodeURIComponent(walletAddress)}`, {
        headers: { "x-wallet-address": walletAddress },
      });
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setMyCollections(data);
    } catch {
      toast.error("Could not load your collections.");
    } finally {
      setLoadingMine(false);
    }
  }, [walletAddress]);

  const fetchPublic = useCallback(async () => {
    setLoadingPublic(true);
    try {
      const res = await fetch("/api/collections?public=true");
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setPublicCollections(data);
    } catch {
      toast.error("Could not load public collections.");
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    fetchMine();
    fetchPublic();
  }, [fetchMine, fetchPublic]);

  const openCollection = async (col: Collection) => {
    setSelectedCollection(col);
    setLoadingSnippets(true);
    try {
      const headers: Record<string, string> = {};
      if (walletAddress) headers["x-wallet-address"] = walletAddress;
      const res = await fetch(`/api/collections/${col.id}/snippets`, { headers });
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setCollectionSnippets(data);
    } catch {
      toast.error("Could not load snippets for this collection.");
    } finally {
      setLoadingSnippets(false);
    }
  };

  const handleDuplicateSnippet = async (snippet: Snippet) => {
    if (!walletAddress) {
      toast.error("Please connect your wallet to duplicate snippets.");
      return;
    }

    try {
      const res = await fetch(`/api/snippets/${snippet.id}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({ ownerWalletAddress: walletAddress }),
      });

      if (!res.ok) throw new Error();
      toast.success(`Duplicated "${snippet.title}" to your collection!`);
      if (selectedCollection) {
        openCollection(selectedCollection);
      }
    } catch {
      toast.error("Could not duplicate snippet.");
    }
  };

  const handleRemoveSnippet = async (snippetId: string) => {
    if (!walletAddress || !selectedCollection) return;
    try {
      const res = await fetch(`/api/collections/${selectedCollection.id}/snippets`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({ snippetId }),
      });
      if (!res.ok && res.status !== 204) throw new Error();
      setCollectionSnippets((prev) => prev.filter((s) => s.id !== snippetId));
      toast.success("Snippet removed from collection.");
      await fetchMine();
    } catch {
      toast.error("Could not remove snippet.");
    }
  };

  const displayed = (tab === "mine" ? myCollections : publicCollections).filter(
    (c) =>
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />

      <main id="main-content" className="flex-1 p-6 lg:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Collections</h1>
                <p className="text-sm text-slate-400">
                  Blockchain-backed snippet organisers linked to your Stellar wallet
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: collection list */}
            <div className="lg:col-span-2 space-y-5">
              {/* Tabs */}
              <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
                <button
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === "mine"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => setTab("mine")}
                >
                  My Collections
                </button>
                <button
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === "public"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => setTab("public")}
                >
                  Public
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  className="pl-9 bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  placeholder="Search collections…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* List */}
              {(tab === "mine" ? loadingMine : loadingPublic) && (
                <p className="text-sm text-slate-500">Loading…</p>
              )}

              {!loadingMine && tab === "mine" && !walletAddress && (
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
                  <Layers className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    Connect your Stellar wallet to view and manage your collections.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {displayed.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => openCollection(col)}
                    className={`w-full text-left rounded-xl border p-4 transition-all hover:border-indigo-500/55 hover:bg-slate-800/60 ${
                      selectedCollection?.id === col.id
                        ? "border-indigo-500 bg-slate-800/80"
                        : "border-slate-700 bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-slate-100">{col.title}</span>
                          {col.is_public ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <Globe className="w-3 h-3" />
                              Public
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Lock className="w-3 h-3" />
                              Private
                            </span>
                          )}
                        </div>
                        {col.description && (
                          <p className="text-sm text-slate-400 line-clamp-1 mb-2">
                            {col.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{col.snippet_count} snippet{col.snippet_count !== 1 ? "s" : ""}</span>
                          <span>·</span>
                          <span>{new Date(col.created_at).toLocaleDateString()}</span>
                          {col.on_chain_tx_hash && (
                            <>
                              <span>·</span>
                              <span className="text-indigo-400 font-medium">On-chain anchored</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                    </div>

                    <div className="mt-3">
                      <CollectionBadge
                        ownerWallet={col.owner_wallet_address}
                        onChainTxHash={col.on_chain_tx_hash}
                        collectionTitle={col.title}
                      />
                    </div>
                  </button>
                ))}

                {!loadingMine && displayed.length === 0 && (tab !== "mine" || walletAddress) && (
                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
                    <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No collections found.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: selected collection snippets */}
            <div>
              {selectedCollection ? (
                <Card className="bg-slate-900 border-slate-700 p-4">
                  <h2 className="text-lg font-semibold text-slate-100 mb-3">
                    {selectedCollection.title}
                  </h2>
                  {loadingSnippets ? (
                    <p className="text-sm text-slate-500">Loading snippets…</p>
                  ) : collectionSnippets.length === 0 ? (
                    <p className="text-sm text-slate-500">No snippets in this collection.</p>
                  ) : (
                    <ul className="space-y-2">
                      {collectionSnippets.map((snippet) => (
                        <li
                          key={snippet.id}
                          className="rounded-lg border border-slate-700 p-3 bg-slate-950/50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-100 truncate">
                                {snippet.title}
                              </p>
                              <p className="text-xs text-slate-500">{snippet.language}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailSnippetId(snippet.id)}
                                aria-label={`View ${snippet.title}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setForkingSnippet(snippet as SnippetToFork)}
                                aria-label={`Fork ${snippet.title}`}
                              >
                                <GitFork className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEmbedSnippet(snippet)}
                                aria-label={`Embed ${snippet.title}`}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : (
                <Card className="bg-slate-900 border-slate-700 p-6 text-center">
                  <Files className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Select a collection to view its snippets.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      {detailSnippetId && (
        <SnippetDetailModal
          snippetId={detailSnippetId}
          open={Boolean(detailSnippetId)}
          onOpenChange={(open) => {
            if (!open) setDetailSnippetId(null);
          }}
        />
      )}

      {forkingSnippet && (
        <ForkSnippetModal
          snippet={forkingSnippet}
          open={Boolean(forkingSnippet)}
          onOpenChange={(open) => {
            if (!open) setForkingSnippet(null);
          }}
        />
      )}

      {embedSnippet && (
        <EmbedSnippetModal
          snippet={embedSNippet}
          open={Boolean(embedSnippet)}
          onOpenChange={(open) => {
            if (!open) setEmbedSnippet(null);
          }}
        />
      )}
    </div>
  );
}
