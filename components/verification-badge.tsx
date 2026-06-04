"use client";

import React from "react";
import { Shield } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VerificationBadgeProps {
  verified: boolean;
  walletAddress?: string;
  verifiedAt?: string;
  className?: string;
}

export default function VerificationBadge({
  verified,
  walletAddress,
  verifiedAt,
  className,
}: VerificationBadgeProps) {
  if (!verified) {
    return null;
  }

  const formatDate = (isoTimestamp: string) => {
    try {
      const date = new Date(isoTimestamp);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoTimestamp;
    }
  };

  const tooltipContent = (
    <div className="space-y-1">
      {walletAddress && (
        <div className="text-xs">
          <span className="font-semibold">Wallet:</span>
          <br />
          <span className="font-mono break-all">
            {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
          </span>
        </div>
      )}
      {verifiedAt && (
        <div className="text-xs">
          <span className="font-semibold">Verified:</span>
          <br />
          <span>{formatDate(verifiedAt)}</span>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/30",
              className
            )}
          >
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
              Verified
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
