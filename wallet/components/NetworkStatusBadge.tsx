"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWallet } from "@/wallet/context/WalletContext";
import { isNetworkSupported, networkLabel, networkShortLabel } from "@/wallet/lib/networkDetection";

/**
 * NetworkStatusBadge — displays the current Stellar network status
 * with warnings for unsupported/unknown networks.
 *
 * Visual states:
 * - Connected to the expected network: green badge with check
 * - Connected to wrong network (e.g. mainnet on a testnet app): amber warning
 * - Connected to unknown network: red warning
 * - Not connected: grey "no network" indicator
 */
export function NetworkStatusBadge() {
  const { connected, network } = useWallet();

  // ── Not connected ────────────────────────────────────────────
  if (!connected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono cursor-default bg-slate-800/50 border border-slate-700/50 text-slate-500">
              <WifiOff className="w-3 h-3" />
              <span>--</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Wallet not connected</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ── Unsupported / unknown network ────────────────────────────
  if (!isNetworkSupported(network)) {
    const isUnknown = network === "unknown";
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono cursor-default transition-colors ${
                isUnknown
                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                  : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{networkShortLabel(network)}</span>
              <span className="hidden sm:inline ml-0.5 text-[10px] opacity-75">
                {isUnknown ? "unsupported" : "mismatch"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="space-y-1 text-xs">
              <p className="font-semibold">
                {isUnknown
                  ? "Unknown or unsupported network"
                  : `Connected to ${networkLabel(network)}`}
              </p>
              <p className="text-slate-400">
                {isUnknown
                  ? "Your wallet is connected to a network that cannot be identified. Some features may not work."
                  : `Your wallet is on ${networkLabel(network)}, but this app expects Testnet. Please switch networks in your wallet settings.`}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ── Supported network (matching expected) ────────────────────
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono cursor-default bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 transition-colors">
            <CheckCircle2 className="w-3 h-3" />
            <span>{networkShortLabel(network)}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">
              Connected to {networkLabel(network)}
            </p>
            <p className="text-slate-400">
              Your wallet is on the correct network. All features are available.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact inline network indicator — just the dot + label, for use
 * inside wallet detail modals or other tight spaces.
 */
export function NetworkIndicator() {
  const { connected, network } = useWallet();

  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <WifiOff className="w-3 h-3" />
        Not connected
      </span>
    );
  }

  const supported = isNetworkSupported(network);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        supported
          ? "text-emerald-400"
          : network === "unknown"
            ? "text-red-400"
            : "text-amber-400"
      }`}
    >
      {supported ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      {networkLabel(network)}
    </span>
  );
}
