"use client";

import { Sidebar } from "@/components/Sidebar";
import { RecentlyViewedSnippets } from "@/components/RecentlyViewedSnippets";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, Star, FileCode2 } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />

      <main className="flex-1 min-w-0 relative">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse" />
          <div className="absolute top-40 right-10 w-72 h-72 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-glow-pulse animation-delay-1000" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:pl-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              <p className="text-sm text-slate-400 mt-1">
                Your recently viewed snippets and quick links.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/snippets">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-400/40 text-purple-200 hover:bg-purple-400/10"
                >
                  <FileCode2 className="w-4 h-4 mr-2" />
                  Snippets
                </Button>
              </Link>
              <Link href="/favorites">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-400/40 text-purple-200 hover:bg-purple-400/10"
                >
                  <Star className="w-4 h-4 mr-2" />
                  Favorites
                </Button>
              </Link>
              <Link href="/collections">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-400/40 text-purple-200 hover:bg-purple-400/10"
                >
                  <Layers className="w-4 h-4 mr-2" />
                  Collections
                </Button>
              </Link>
            </div>
          </div>

          <RecentlyViewedSnippets />
        </div>
      </main>
    </div>
  );
}
