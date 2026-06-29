"use client";

import React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Star } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import Loader from "@/components/ui/loader";
import { VersionHistoryPanel } from "@/components/VersionHistory";
import { PermissionsManager } from "@/components/PermissionsManager";
import VerificationBadge from "@/components/verification-badge";
import VerifyOwnershipButton from "@/components/verify-ownership-button";
import { useWallet } from "@/components/WalletConnect";

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

export default function FavoritesPage() {
  const wallet = useWallet();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [favoriteStatuses, setFavoriteStatuses] = useState<Record<string, boolean>>({});
  const [verificationStatuses, setVerificationStatuses] = useState<Record<string, VerificationStatus>>({});

  const fetchFavorites = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const currentOffset = loadMore ? offset : 0;
      const res = await fetch(`/api/favorites?limit=${DEFAULT_LIMIT}&offset=${currentOffset}`);

      if (!res.ok) throw new Error("Failed to fetch favorites");

      const data: PaginatedResponse = await res.json();

      if (loadMore) {
        setSnippets((prev) => [...prev, ...data.data]);
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
        })
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
        if (!result.favorited) {
          // If unfavorited, remove from list
          setSnippets((prev) => prev.filter((s) => s.id !== snippetId));
          setTotal((prev) => prev - 1);
        }
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchFavorites(true);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />

      <main className="flex-1 min-w-0 relative">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse" />
          <div className="absolute top-40 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse animation-delay-1000" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:pl-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Favorite Snippets</h1>
          </div>

          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader />
            </div>
          ) : snippets.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="mb-4 text-slate-400 font-medium">
                No favorite snippets yet. Mark some snippets as favorites!
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {snippets.map((snippet) => {
                  const verificationStatus = verificationStatuses[snippet.id] || { verified: false };
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
                            onRestore={() => fetchFavorites()}
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
                                fetchFavorites();
                              }}
                              className="flex-1"
                            />
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

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
                  Showing all {total} favorite snippets
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
