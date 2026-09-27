"use client";

import React from "react";
import { GitFork } from "lucide-react";
import { cn } from "@/lib/utils";

interface DerivationBadgeProps {
  forkedFromId?: string | null;
  originTitle?: string | null;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function DerivationBadge({
  forkedFromId,
  originTitle,
  onClick,
  className,
  size = "sm",
}: DerivationBadgeProps) {
  if (!forkedFromId) return null;

  const displayLabel = originTitle
    ? `Derived from ${originTitle}`
    : `Derived from #${forkedFromId.slice(0, 8)}`;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={`Derived from original snippet: ${forkedFromId}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors border",
        "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-500/50",
        size === "sm" ? "text-[11px] px-2.5 py-0.5" : "text-xs px-3 py-1",
        onClick ? "cursor-pointer" : "cursor-default",
        className
      )}
    >
      <GitFork className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      <span className="truncate max-w-[200px]">{displayLabel}</span>
    </div>
  );
}

export default DerivationBadge;
