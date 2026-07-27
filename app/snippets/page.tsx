"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, GitCompareArrows, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SnippetComparison } from "@/components/SnippetComparison";
import type { ComparisonSnippet } from "@/lib/snippet-comparison";

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<ComparisonSnippet[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadSnippets() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/snippets?limit=100&offset=0");
      if (!response.ok) throw new Error("Could not load snippets");
      const result = await response.json();
      const data: ComparisonSnippet[] = Array.isArray(result) ? result : result.data;
      setSnippets(data || []);
      setLeftId((current) => current || data?.[0]?.id || "");
      setRightId((current) => current || data?.[1]?.id || data?.[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load snippets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSnippets(); }, []);
  const left = useMemo(() => snippets.find((snippet) => snippet.id === leftId), [snippets, leftId]);
  const right = useMemo(() => snippets.find((snippet) => snippet.id === rightId), [snippets, rightId]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-20 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1600px]">
          <header className="mb-8">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-lg bg-fuchsia-500/15 p-2 text-fuchsia-300"><GitCompareArrows className="h-5 w-5" /></div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare snippets</h1>
            </div>
            <p className="text-sm text-slate-400">Review code and metadata changes side by side.</p>
          </header>

          <div className="mb-8 grid gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 md:grid-cols-[1fr_auto_1fr]">
            <label className="text-sm text-slate-400">Original snippet
              <select aria-label="Original snippet" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none focus:border-fuchsia-400" value={leftId} onChange={(event) => setLeftId(event.target.value)}>
                {snippets.map((snippet) => <option key={snippet.id} value={snippet.id}>{snippet.title}</option>)}
              </select>
            </label>
            <button className="self-end justify-self-center rounded-lg border border-white/10 p-2.5 text-slate-400 transition hover:border-fuchsia-400/50 hover:text-fuchsia-300" aria-label="Swap snippets" onClick={() => { setLeftId(rightId); setRightId(leftId); }}>
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <label className="text-sm text-slate-400">Compared snippet
              <select aria-label="Compared snippet" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-slate-100 outline-none focus:border-fuchsia-400" value={rightId} onChange={(event) => setRightId(event.target.value)}>
                {snippets.map((snippet) => <option key={snippet.id} value={snippet.id}>{snippet.title}</option>)}
              </select>
            </label>
          </div>

          {loading && <p className="py-20 text-center text-slate-400">Loading snippets…</p>}
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">{error}<button className="ml-4 inline-flex items-center gap-1 underline" onClick={() => void loadSnippets()}><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>}
          {!loading && !error && snippets.length === 0 && <p className="rounded-xl border border-dashed border-white/15 py-20 text-center text-slate-400">Create at least two snippets to start comparing.</p>}
          {!loading && left && right && <SnippetComparison left={left} right={right} />}
        </div>
      </main>
    </div>
  );
}
