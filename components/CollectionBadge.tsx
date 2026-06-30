"use client";

import React from "react";
import { Layers, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CollectionBadgeProps {
  ownerWallet: string;
  onChainTxHash?: string | null;
  collectionTitle?: string;
  className?: string;
}

export default function CollectionBadge({
  ownerWallet,
  onChainTxHash,
  collectionTitle,
  className,
}: CollectionBadgeProps) {
  const shortWallet = `${ownerWallet.slice(0, 6)}...${ownerWallet.slice(-4)}`;
  const stellarExpertUrl = onChainTxHash
    ? `https://stellar.expert/explorer/testnet/tx/${onChainTxHash}`
    : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-100 cursor-default",
              className,
            )}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-600">
              {collectionTitle ? `Collection: ${collectionTitle}` : "Owned Collection"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <div>
              <span className="font-semibold text-slate-300">Owner:</span>{" "}
              <span className="font-mono text-slate-100">{shortWallet}</span>
            </div>
            {onChainTxHash && (
              <div>
                <span className="font-semibold text-slate-300">Anchored on Stellar Testnet</span>
                <br />
                <a
                  href={stellarExpertUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-300 hover:text-indigo-200 mt-0.5"
                >
                  <span className="font-mono">{onChainTxHash.slice(0, 12)}…</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {!onChainTxHash && (
              <span className="text-slate-400">On-chain anchor pending</span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
