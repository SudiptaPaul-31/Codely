"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  FileCode,
  FileEdit,
  FilePlus2,
  FileX2,
  FileSymlink,
  Wallet,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from "lucide-react";
import type { ActivityLog } from "@/types/type";

const ACTION_ICONS: Record<string, LucideIcon> = {
  "snippet.created": FilePlus2,
  "snippet.updated": FileEdit,
  "snippet.deleted": FileX2,
  "snippet.soft_deleted": FileX2,
  "snippet.restored": FileSymlink,
  "wallet.connected": Wallet,
  "wallet.disconnected": Wallet,
  "signature.verified": ShieldCheck,
  "signature.failed": ShieldX,
};

const ACTION_STYLES: Record<
  string,
  { bg: string; dot: string }
> = {
  "snippet.created": {
    bg: "bg-emerald-500/10 text-emerald-400",
    dot: "bg-emerald-400",
  },
  "snippet.updated": {
    bg: "bg-blue-500/10 text-blue-400",
    dot: "bg-blue-400",
  },
  "snippet.deleted": {
    bg: "bg-red-500/10 text-red-400",
    dot: "bg-red-400",
  },
  "snippet.soft_deleted": {
    bg: "bg-red-500/10 text-red-400",
    dot: "bg-red-400",
  },
  "snippet.restored": {
    bg: "bg-amber-500/10 text-amber-400",
    dot: "bg-amber-400",
  },
  "wallet.connected": {
    bg: "bg-purple-500/10 text-purple-400",
    dot: "bg-purple-400",
  },
  "wallet.disconnected": {
    bg: "bg-zinc-500/10 text-zinc-400",
    dot: "bg-zinc-400",
  },
  "signature.verified": {
    bg: "bg-emerald-500/10 text-emerald-400",
    dot: "bg-emerald-400",
  },
  "signature.failed": {
    bg: "bg-red-500/10 text-red-400",
    dot: "bg-red-400",
  },
};

const DEFAULT_STYLE = {
  bg: "bg-zinc-500/10 text-zinc-400",
  dot: "bg-zinc-400",
};

export function getActivityDescription(activity: ActivityLog): string {
  const meta = activity.metadata ?? {};
  const snippetTitle = (meta?.title as string) || undefined;

  if (meta?.ownershipChanged || meta?.newOwner) {
    const from = meta?.previousOwner
      ? `${String(meta.previousOwner).slice(0, 6)}...`
      : undefined;
    const to = meta?.newOwner
      ? `${String(meta.newOwner).slice(0, 6)}...`
      : undefined;
    if (from && to) {
      return `Transferred snippet ownership from ${from} to ${to}`;
    }
    return `Transferred ownership of snippet${snippetTitle ? ` "${snippetTitle}"` : ""}`;
  }

  switch (activity.action) {
    case "snippet.created":
      return `Created snippet${snippetTitle ? ` "${snippetTitle}"` : ""}`;
    case "snippet.updated":
      return `Updated snippet${snippetTitle ? ` "${snippetTitle}"` : ""}`;
    case "snippet.deleted":
    case "snippet.soft_deleted":
      return `Deleted snippet${snippetTitle ? ` "${snippetTitle}"` : ""}`;
    case "snippet.restored":
      return `Restored snippet${snippetTitle ? ` "${snippetTitle}"` : ""}`;
    case "wallet.connected":
      return "Wallet connected";
    case "wallet.disconnected":
      return "Wallet disconnected";
    case "signature.verified":
      return "Signature verified";
    case "signature.failed":
      return "Signature verification failed";
    default:
      return `Performed ${activity.action.replace(/^[^.]+\./, "").replace(/_/g, " ")}`;
  }
}

export function getActivityIcon(action: string): LucideIcon {
  return ACTION_ICONS[action] ?? FileCode;
}

export function getActivityStyle(action: string) {
  return ACTION_STYLES[action] ?? DEFAULT_STYLE;
}

export function formatWalletAddress(wallet: string | null): string {
  if (!wallet) return "Unknown user";
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export interface ActivityItemProps {
  activity: ActivityLog;
  isLast?: boolean;
}

export function ActivityItem({ activity, isLast = false }: ActivityItemProps) {
  const Icon = getActivityIcon(activity.action);
  const style = getActivityStyle(activity.action);
  const description = getActivityDescription(activity);
  const relativeTime = formatDistanceToNow(new Date(activity.created_at), {
    addSuffix: true,
  });
  const fullDate = new Date(activity.created_at).toLocaleString();

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast && (
        <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border" />
      )}

      <div
        className={cn(
          "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border",
          style.bg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <p className="text-sm font-medium text-foreground break-words">
          {description}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {activity.actor_wallet && (
            <span className="font-mono">
              {formatWalletAddress(activity.actor_wallet)}
            </span>
          )}
          <time dateTime={activity.created_at} title={fullDate}>
            {relativeTime}
          </time>
        </div>
        {activity.resource_id && (
          <span className="font-mono text-[11px] text-muted-foreground/50">
            {activity.resource_id.slice(0, 8)}...
          </span>
        )}
      </div>
    </div>
  );
}
