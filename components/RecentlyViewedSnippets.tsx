"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock, FileCode2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  clearRecentSnippets,
  getRecentSnippets,
  type RecentSnippetEntry,
} from "@/lib/recent-snippets-storage";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-purple-500/20 bg-slate-900/30">
      <Clock className="h-8 w-8 text-slate-500 mb-3" />
      <p className="text-sm font-medium text-slate-200 mb-1">
        No recently viewed snippets
      </p>
      <p className="text-xs text-slate-500 max-w-xs mb-4">
        Open a snippet from Snippets or Collections and it will show up here for
        quick access.
      </p>
      <Link href="/snippets">
        <Button
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Browse snippets
        </Button>
      </Link>
    </div>
  );
}

export function RecentlyViewedSnippets() {
  const [items, setItems] = useState<RecentSnippetEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setItems(getRecentSnippets());
    setHydrated(true);
  }, []);

  useEffect(() => {
    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "codely_recent_snippets") {
        refresh();
      }
    };
    const onLocalChange = () => refresh();

    window.addEventListener("storage", onStorage);
    window.addEventListener("codely:recent-snippets-changed", onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "codely:recent-snippets-changed",
        onLocalChange,
      );
    };
  }, [refresh]);

  const handleClear = () => {
    if (items.length === 0) return;
    if (!confirm("Clear your recently viewed snippets history?")) return;
    clearRecentSnippets();
    setItems([]);
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-48 rounded bg-slate-800/80 animate-pulse" />
          <div className="h-8 w-28 rounded bg-slate-800/80 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-purple-500/10 bg-slate-800/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="recently-viewed-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="recently-viewed-heading"
            className="text-xl font-semibold text-white flex items-center gap-2"
          >
            <FileCode2 className="w-5 h-5 text-purple-400" />
            Recently Viewed
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Jump back into snippets you opened recently.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={items.length === 0}
          className="border-purple-400/40 text-purple-200 hover:bg-purple-400/10 self-start sm:self-auto"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear history
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((snippet) => (
            <Link
              key={snippet.id}
              href={`/snippets#${snippet.id}`}
              className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded-xl"
            >
              <Card className="h-full bg-slate-800/50 border-purple-500/30 backdrop-blur-xl hover:border-purple-500/60 transition overflow-hidden py-0">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-white truncate group-hover:text-purple-200 transition-colors">
                      {snippet.title}
                    </h3>
                    <span className="shrink-0 inline-block bg-purple-600/50 text-purple-100 text-xs px-2.5 py-1 rounded-full">
                      {snippet.language}
                    </span>
                  </div>
                  {snippet.description ? (
                    <p className="text-sm text-slate-400 line-clamp-2">
                      {snippet.description}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 italic">No description</p>
                  )}
                  <p className="text-xs text-slate-500 pt-2 border-t border-purple-500/20">
                    Viewed{" "}
                    {formatDistanceToNow(new Date(snippet.viewedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
