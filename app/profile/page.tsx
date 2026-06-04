"use client";

import React, { useState } from "react";
import {
  Wallet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  ArrowUpRight,
  Activity,
} from "lucide-react";

// Mock data matching the acceptance criteria definitions
const MOCK_PROFILE = {
  walletAddress: "GBXQ...4V5N3ST3LL4RW4LL3T7777777775PK2",
  fullWallet: "GBXQ234V5N3ST3LL4RW4LL3T7777777775PK2E6XN",
  stats: {
    totalSnippets: 42,
    completionScore: 94, // Percentage
    activeDisputes: 0,
    reputationPoints: 1250,
  },
  recentActivities: [
    {
      id: "act-1",
      type: "create",
      title: "Optimized Horizon Stream Liquidity Pool",
      timestamp: "2 hours ago",
      language: "TypeScript",
    },
    {
      id: "act-2",
      type: "verify",
      title: "Validated Soroban Smart Contract Auth Signature",
      timestamp: "1 day ago",
      language: "Rust",
    },
    {
      id: "act-3",
      type: "dispute_resolved",
      title: "Dispute #104 closed in favor of author",
      timestamp: "3 days ago",
      language: "Go",
    },
  ],
};

export default function ProfilePage() {
  const [copied, setCopied] = useState(false);

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(MOCK_PROFILE.fullWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy wallet address", err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Radial Glow Effects for Landing Page Consistency */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:py-12 lg:px-8 relative z-10">
        {/* ========================================================= */}
        {/* SECTION 1: USER PROFILE HEADER & PROMINENT WALLET BAR      */}
        {/* ========================================================= */}
        <header className="mb-10 p-6 md:p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            {/* Avatar block with matching gradient ring animations */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-500 animate-pulse" />
              <div className="relative w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                <FileCode className="h-10 w-10 text-indigo-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                Live Contributor Profile
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Account Dashboard
              </h1>

              {/* Prominent copyable Wallet verification display layout */}
              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-zinc-400 font-mono text-sm">
                  <Wallet className="h-4 w-4 text-purple-400 shrink-0" />
                  <span className="truncate max-w-[240px] sm:max-w-none">
                    {MOCK_PROFILE.walletAddress}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all duration-200"
                  title="Copy full public key address"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* SECTION 2: RESPONSIBLE ACCOUNT STATISTICS GRID             */}
        {/* ========================================================= */}
        <section className="mb-10" aria-label="Account statistics summary">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
            <span>Performance Metadata</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Stat Card: Total Snippets */}
            <div className="group p-6 rounded-2xl border border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/60 hover:bg-zinc-900/40 transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <FileCode className="h-5 w-5" />
                </div>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                  Lifetime items
                </span>
              </div>
              <p className="text-3xl font-bold text-white tracking-tight">
                {MOCK_PROFILE.stats.totalSnippets}
              </p>
              <h3 className="text-sm font-medium text-zinc-400 mt-1">
                Total Snippets
              </h3>
            </div>

            {/* Stat Card: Completion Score */}
            <div className="group p-6 rounded-2xl border border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/60 hover:bg-zinc-900/40 transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                  Quality index
                </span>
              </div>
              <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent tracking-tight">
                {MOCK_PROFILE.stats.completionScore}%
              </p>
              <h3 className="text-sm font-medium text-zinc-400 mt-1">
                Completion Score
              </h3>
            </div>

            {/* Stat Card: Active Disputes */}
            {/* Stat Card: Active Disputes */}
            <div className="group p-6 rounded-2xl border border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/60 hover:bg-zinc-900/40 transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`p-2.5 rounded-xl ${
                    MOCK_PROFILE.stats.activeDisputes > 0
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                  Idleness
                </span>
              </div>
              <p className="text-3xl font-bold text-white tracking-tight">
                {MOCK_PROFILE.stats.activeDisputes}
              </p>
              <h3 className="text-sm font-medium text-zinc-400 mt-1">
                Active Disputes
              </h3>
            </div>

            {/* Stat Card: Reputation Points */}
            <div className="group p-6 rounded-2xl border border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/60 hover:bg-zinc-900/40 transition-all duration-300 transform hover:-translate-y-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                  <Activity className="h-5 w-5" />
                </div>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">
                  Trust level
                </span>
              </div>
              <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight">
                {MOCK_PROFILE.stats.reputationPoints}
              </p>
              <h3 className="text-sm font-medium text-zinc-400 mt-1">
                Reputation Score
              </h3>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: RECENT ACTIVITY TIMELINE LIST LAYER             */}
        {/* ========================================================= */}
        <section aria-label="Recent user activity history">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              <span>Recent Activity Feed</span>
            </h2>
            <span className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg">
              Updated live
            </span>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 divide-y divide-zinc-800/60 overflow-hidden">
            {MOCK_PROFILE.recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="p-4 sm:p-5 flex items-start gap-4 hover:bg-zinc-900/40 transition-colors duration-200 group"
              >
                <div className="mt-1 shrink-0 w-2 h-2 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 group-hover:scale-125 transition-transform duration-200" />

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                      {activity.title}
                    </p>
                    <span className="text-xs text-zinc-500 whitespace-nowrap shrink-0">
                      {activity.timestamp}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/40 text-zinc-400 font-mono">
                      {activity.language}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors pl-2">
                  <ArrowUpRight className="h-4 w-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
