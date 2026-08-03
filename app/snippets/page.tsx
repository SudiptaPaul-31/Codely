"use client";

import { useEffect, useRef, useState } from "react";
import { FolderKanban, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SnippetFolderOrganizer } from "@/components/SnippetFolderOrganizer";
import { recordRecentSnippet } from "@/lib/recent-snippets-storage";

interface SnippetSummary {
  id: string;
  title: string;
  language: string;
  description?: string;
}

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<SnippetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const recordedHashRef = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/snippets?limit=100&offset=0");
      if (!response.ok) throw new Error("Could not load snippets");
      const result = await response.json();
      setSnippets(Array.isArray(result) ? result : result.data || []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load snippets",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Record / highlight snippets opened via /snippets#id (dashboard & collections)
  useEffect(() => {
    if (loading) return;

    const recordFromHash = async () => {
      const id = window.location.hash.replace(/^#/, "");
      if (!id || recordedHashRef.current === id) return;

      const local = snippets.find((snippet) => snippet.id === id);
      if (local) {
        recordedHashRef.current = id;
        recordRecentSnippet({
          id: local.id,
          title: local.title,
          language: local.language,
          description: local.description,
        });
        requestAnimationFrame(() => {
          document.getElementById(`snippet-${id}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
        return;
      }

      try {
        const res = await fetch(`/api/snippets/${id}`);
        if (!res.ok) return;
        const snippet = (await res.json()) as SnippetSummary;
        if (!snippet?.id) return;
        recordedHashRef.current = id;
        recordRecentSnippet({
          id: snippet.id,
          title: snippet.title,
          language: snippet.language,
          description: snippet.description,
        });
      } catch (e) {
        console.error("Failed to record snippet from hash:", e);
      }
    };

    void recordFromHash();
    const onHashChange = () => {
      recordedHashRef.current = null;
      void recordFromHash();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [loading, snippets]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-20 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-fuchsia-500/15 p-2 text-fuchsia-300">
                <FolderKanban className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Organize snippets
              </h1>
            </div>
            <p className="text-sm text-slate-400">
              Create folders and drag snippets to arrange your workspace. Changes
              are saved on this device.
            </p>
          </header>
          {loading && (
            <p className="py-20 text-center text-slate-400">Loading snippets…</p>
          )}
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
              {error}
              <button
                className="ml-4 inline-flex items-center gap-1 underline"
                onClick={() => void load()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}
          {!loading && !error && <SnippetFolderOrganizer snippets={snippets} />}
        </div>
      </main>
    </div>
  );
}
