"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Layers, Plus, Trash2, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import CollectionBadge from "./CollectionBadge";
import { useWallet } from "./WalletConnect";

interface Collection {
  id: string;
  title: string;
  description: string;
  tags: string[];
  owner_wallet_address: string;
  is_public: boolean;
  on_chain_tx_hash: string | null;
  snippet_count: number;
  created_at: string;
}

interface CollectionManagerProps {
  snippetId?: string;
  onCollectionSelect?: (collectionId: string) => void;
}

export default function CollectionManager({ snippetId, onCollectionSelect }: CollectionManagerProps) {
  const wallet = useWallet();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    tags: "",
    isPublic: false,
  });

  const walletAddress = wallet?.publicKey;

  const fetchCollections = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/collections?wallet=${encodeURIComponent(walletAddress)}`, {
        headers: {
          "x-wallet-address": walletAddress,
        },
      });
      if (!res.ok) throw new Error("Failed to load collections");
      const { data } = await res.json();
      setCollections(data);
    } catch {
      toast.error("Could not load your collections.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      toast.error("Please connect your wallet first.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          isPublic: form.isPublic,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to create collection");
      }

      toast.success("Collection created and anchored on Stellar.");
      setCreateOpen(false);
      setForm({ title: "", description: "", tags: "", isPublic: false });
      await fetchCollections();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create collection.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!walletAddress) return;
    if (!confirm("Delete this collection? The on-chain anchor will remain immutable.")) return;

    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "DELETE",
        headers: { "x-wallet-address": walletAddress },
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
      toast.success("Collection deleted.");
      setCollections((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("Could not delete collection.");
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    if (!snippetId || !walletAddress) return;

    try {
      const res = await fetch(`/api/collections/${collectionId}/snippets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({ snippetId }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to add snippet");
      }

      toast.success("Snippet added to collection.");
      onCollectionSelect?.(collectionId);
      await fetchCollections();
    } catch (err: any) {
      toast.error(err?.message || "Could not add snippet to collection.");
    }
  };

  if (!wallet?.connected) {
    return (
      <div className="text-sm text-slate-500 italic">
        Connect your wallet to manage collections.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" />
          My Collections
        </h3>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" />
              New Collection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Collection</DialogTitle>
              <DialogDescription>
                Collection metadata will be anchored to your Stellar wallet on Testnet for
                verifiable, immutable ownership.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="col-title">Title *</Label>
                <Input
                  id="col-title"
                  placeholder="My TypeScript Utils"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="col-desc">Description</Label>
                <Textarea
                  id="col-desc"
                  placeholder="A collection of reusable TypeScript snippets..."
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="col-tags">Tags (comma-separated)</Label>
                <Input
                  id="col-tags"
                  placeholder="typescript, utils, frontend"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="col-public"
                  checked={form.isPublic}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
                />
                <Label htmlFor="col-public" className="cursor-pointer">
                  Make collection public
                </Label>
              </div>

              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-700">
                Ownership is linked to{" "}
                <span className="font-mono font-semibold">
                  {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-4)}
                </span>{" "}
                and anchored on Stellar Testnet.
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !form.title}>
                  {creating ? "Creating..." : "Create Collection"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading && (
        <p className="text-xs text-slate-400">Loading collections…</p>
      )}

      {!loading && collections.length === 0 && (
        <p className="text-xs text-slate-400 italic">
          No collections yet. Create one to organise your snippets.
        </p>
      )}

      <div className="space-y-2">
        {collections.map((col) => (
          <div
            key={col.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:border-indigo-100 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 truncate">
                  {col.title}
                </span>
                <CollectionBadge
                  ownerWallet={col.owner_wallet_address}
                  onChainTxHash={col.on_chain_tx_hash}
                  collectionTitle={col.title}
                />
              </div>
              {col.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{col.description}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                {col.snippet_count} snippet{col.snippet_count !== 1 ? "s" : ""}
                {col.is_public && " · Public"}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {snippetId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                  onClick={() => handleAddToCollection(col.id)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(col.id)}
                title="Delete collection"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
