"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import CollectionBadge from "@/components/CollectionBadge";
import CollectionManager from "@/components/CollectionManager";
import { useWallet } from "@/components/WalletConnect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layers, ChevronRight, Search, Globe, Lock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

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

      <main className="flex-1 p-6 lg:p-8 overflow-auto">
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
                    className={`w-full text-left rounded-xl border p-4 transition-all hover:border-indigo-500/50 hover:bg-slate-800/60 ${
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
                    <p className="text-slate-400 text-sm">No collections found.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="space-y-5">
              {/* Create panel */}
              {tab === "mine" && (
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
                  <CollectionManager />
                </div>
              )}

              {/* Selected collection detail */}
              {selectedCollection && (
                <div className="rounded-xl border border-indigo-500/30 bg-slate-900 p-5 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100 mb-1">
                      {selectedCollection.title}
                    </h2>
                    {selectedCollection.description && (
                      <p className="text-sm text-slate-400">{selectedCollection.description}</p>
                    )}
                  </div>

                  {selectedCollection.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCollection.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* On-chain info */}
                  {selectedCollection.on_chain_tx_hash && (
                    <div className="rounded-lg bg-indigo-950/40 border border-indigo-800/40 p-3 text-xs space-y-1">
                      <p className="font-semibold text-indigo-300">Stellar Testnet Anchor</p>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${selectedCollection.on_chain_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-mono break-all"
                      >
                        {selectedCollection.on_chain_tx_hash.slice(0, 20)}…
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {selectedCollection.on_chain_anchor && (
                        <p className="text-slate-500 font-mono break-all">
                          Hash: {selectedCollection.on_chain_anchor.slice(0, 24)}…
                        </p>
                      )}
                    </div>
                  )}

                  {/* Snippets in collection */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-2">Snippets</h3>
                    {loadingSnippets && (
                      <p className="text-xs text-slate-500">Loading snippets…</p>
                    )}
                    {!loadingSnippets && collectionSnippets.length === 0 && (
                      <p className="text-xs text-slate-500 italic">No snippets in this collection yet.</p>
                    )}
                    <div className="space-y-2">
                      {collectionSnippets.map((snippet) => (
                        <div
                          key={snippet.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-800 border border-slate-700"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">
                              {snippet.title}
                            </p>
                            <p className="text-xs text-slate-500">{snippet.language}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Link href={`/snippets#${snippet.id}`}>
                              <Button size="sm" variant="ghost" className="h-6 text-xs text-slate-400 hover:text-indigo-400 px-2">
                                View
                              </Button>
                            </Link>
                            {walletAddress === selectedCollection.owner_wallet_address && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-slate-500 hover:text-red-400 px-2"
                                onClick={() => handleRemoveSnippet(snippet.id)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
