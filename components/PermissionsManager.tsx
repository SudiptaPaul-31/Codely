"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Trash2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/components/WalletConnect";
import { toast } from "sonner";

interface Permission {
  id: string;
  snippet_id: string;
  grantee_wallet_address: string;
  permission_type: "view" | "edit";
  granted_by_wallet_address: string;
  on_chain_tx_hash: string | null;
  granted_at: string;
  is_active: boolean;
}

interface ActivityLog {
  id: string;
  actor_wallet_address: string;
  target_wallet_address: string;
  action: "grant" | "revoke";
  permission_type: "view" | "edit";
  on_chain_tx_hash: string | null;
  created_at: string;
}

interface Props {
  snippetId: string;
  snippetTitle: string;
  ownerWalletAddress: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function PermissionsManager({ snippetId, snippetTitle, ownerWalletAddress }: Props) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Grant form state
  const [granteeAddress, setGranteeAddress] = useState("");
  const [permissionType, setPermissionType] = useState<"view" | "edit">("view");
  const [granting, setGranting] = useState(false);

  const isOwner = wallet?.publicKey === ownerWalletAddress;

  const fetchPermissions = useCallback(async () => {
    if (!wallet?.publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/snippets/${snippetId}/permissions?includeLog=true`, {
        headers: {
          "x-wallet-address": wallet.publicKey,
          ...(wallet.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to load permissions");
      const data = await res.json();
      setPermissions(data.permissions ?? []);
      setActivityLog(data.activityLog ?? []);
    } catch {
      toast.error("Could not load permissions");
    } finally {
      setLoading(false);
    }
  }, [snippetId, wallet?.publicKey, wallet?.token]);

  useEffect(() => {
    if (open) fetchPermissions();
  }, [open, fetchPermissions]);

  const handleGrant = async () => {
    if (!granteeAddress.trim() || granteeAddress.trim().length !== 56) {
      toast.error("Enter a valid 56-character Stellar wallet address");
      return;
    }
    setGranting(true);
    try {
      const res = await fetch(`/api/snippets/${snippetId}/permissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": wallet.publicKey,
          ...(wallet.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
        },
        body: JSON.stringify({
          granteeWalletAddress: granteeAddress.trim(),
          permissionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to grant permission");
      toast.success(`${permissionType} access granted`);
      setGranteeAddress("");
      await fetchPermissions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (granteeWallet: string, type: "view" | "edit") => {
    try {
      const res = await fetch(`/api/snippets/${snippetId}/permissions`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": wallet.publicKey,
          ...(wallet.token ? { Authorization: `Bearer ${wallet.token}` } : {}),
        },
        body: JSON.stringify({
          granteeWalletAddress: granteeWallet,
          permissionType: type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke permission");
      toast.success(`${type} access revoked`);
      await fetchPermissions();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!wallet?.connected) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="border-purple-400/50 text-purple-300 hover:bg-purple-400/10"
        title="Manage permissions"
      >
        <Shield className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-purple-500/30 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5 text-purple-400" />
              Permissions — {snippetTitle}
            </DialogTitle>
          </DialogHeader>

          {/* Grant form — owner only */}
          {isOwner && (
            <div className="space-y-3 border border-purple-500/20 rounded-lg p-4 bg-slate-800/40">
              <p className="text-sm font-medium text-slate-300">Grant access</p>
              <div className="space-y-2">
                <Label className="text-slate-400 text-xs">Wallet address</Label>
                <Input
                  placeholder="G... (56 characters)"
                  value={granteeAddress}
                  onChange={(e) => setGranteeAddress(e.target.value)}
                  className="bg-slate-700/50 border-purple-500/30 text-white placeholder:text-slate-500 text-sm font-mono"
                />
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-slate-400 text-xs">Permission</Label>
                  <Select
                    value={permissionType}
                    onValueChange={(v) => setPermissionType(v as "view" | "edit")}
                  >
                    <SelectTrigger className="bg-slate-700/50 border-purple-500/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleGrant}
                  disabled={granting || !granteeAddress}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-1"
                >
                  <Plus className="w-4 h-4" />
                  {granting ? "Granting..." : "Grant"}
                </Button>
              </div>
            </div>
          )}

          {/* Active permissions list */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">
              Active permissions {permissions.length > 0 && `(${permissions.length})`}
            </p>

            {loading ? (
              <p className="text-slate-500 text-sm py-4 text-center">Loading...</p>
            ) : permissions.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">
                No permissions granted yet
              </p>
            ) : (
              <div className="space-y-2">
                {permissions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-slate-800/50 border border-purple-500/20 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-white truncate">
                        {shortAddr(p.grantee_wallet_address)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.permission_type === "edit"
                              ? "bg-blue-600/30 text-blue-300"
                              : "bg-green-600/30 text-green-300"
                          }`}
                        >
                          {p.permission_type}
                        </span>
                        {p.on_chain_tx_hash && (
                          <span
                            className="text-xs text-slate-500 font-mono truncate max-w-24"
                            title={`On-chain hash: ${p.on_chain_tx_hash}`}
                          >
                            ⛓ {p.on_chain_tx_hash.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <Button
                        onClick={() => handleRevoke(p.grantee_wallet_address, p.permission_type)}
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                        title="Revoke permission"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity log toggle */}
          <div>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Activity log
              {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showLog && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {activityLog.length === 0 ? (
                  <p className="text-slate-500 text-xs py-2 text-center">No activity yet</p>
                ) : (
                  activityLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="text-xs text-slate-400 bg-slate-800/30 rounded px-3 py-1.5 flex items-center justify-between gap-2"
                    >
                      <span>
                        <span
                          className={
                            entry.action === "grant" ? "text-green-400" : "text-red-400"
                          }
                        >
                          {entry.action}
                        </span>{" "}
                        <span className="font-medium text-slate-300">
                          {entry.permission_type}
                        </span>{" "}
                        → {shortAddr(entry.target_wallet_address)}
                      </span>
                      <span className="text-slate-600 shrink-0">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
