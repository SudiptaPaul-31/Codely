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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<SnippetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const recordedHashRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const saveRef = useRef<HTMLButtonElement | null>(null);
  const createRef = useRef<HTMLButtonElement | null>(null);
  const [shortcutHint, setShortcutHint] = useState("");

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

  // Keyboard shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+K search, Ctrl/Cmd+N create
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        if (saveRef.current && !saveRef.current.disabled) {
          saveRef.current.click();
          setShortcutHint("Saved");
        } else {
          setShortcutHint("Nothing to save");
        }
      } else if (key === "k") {
        event.preventDefault();
        const input = searchRef.current ?? document.querySelector<HTMLInputElement>(
          'input[type="search"], [data-shortcut="search"]',
        );
        if (input) {
          input.focus();
          input.select?.();
        }
      } else if (key === "n") {
        // Don't hijack browser new-window when typing in a field.
        if (isEditableTarget(event.target) && !createRef.current) return;
        event.preventDefault();
        if (createRef.current && !createRef.current.disabled) {
          createRef.current.click();
        } else {
          setShortcutHint("Create not available");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!shortcutHint) return;
    const t = window.setTimeout(() => setShortcutHint(""), 2000);
    return () => window.clearTimeout(t);
  }, [shortcutHint]);

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
      <main id="main-content" className="min-w-0 flex-1 px-4 py-20 md:px-8 md:py-8">
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
            <p className="mt-2 text-xs text-slate-500">
              Shortcuts: <kbd>Ctrl</kbd>+<kbd>S</kbd> save,{" "}
              <kbd>Ctrl</kbd>+<kbd>K</kbd> search,{" "}
              <kbd>Ctrl</kbd>+<kbd>N</kbd> new snippet
            </p>
            <div role="status" aria-live="polite" className="sr-only">
              {shortcutHint}
            </div>
            {shortcutHint && (
              <p className="mt-1 text-xs text-fuchsia-300" aria-hidden="true">
                {shortcutHint}
              </p>
            )}
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
