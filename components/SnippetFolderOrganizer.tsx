"use client";

import { useEffect, useState } from "react";
import { FileCode2, Folder, FolderPlus, GripVertical, Pencil, Trash2 } from "lucide-react";
import {
  addFolder,
  createOrganization,
  deleteFolder,
  FOLDER_STORAGE_KEY,
  FolderOrganization,
  moveSnippet,
  normalizeOrganization,
  renameFolder,
  reorderFolder,
} from "@/lib/snippet-folders";
import { recordRecentSnippet } from "@/lib/recent-snippets-storage";

interface SnippetSummary { id: string; title: string; language: string; description?: string; }
type DragItem = { type: "snippet"; id: string } | { type: "folder"; id: string };

export function SnippetFolderOrganizer({ snippets }: { snippets: SnippetSummary[] }) {
  const [organization, setOrganization] = useState<FolderOrganization>(() => createOrganization(snippets.map((item) => item.id)));
  const [folderName, setFolderName] = useState("");
  const [dragged, setDragged] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [ready, setReady] = useState(false);
  const lookup = new Map(snippets.map((snippet) => [snippet.id, snippet]));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FOLDER_STORAGE_KEY);
      setOrganization(normalizeOrganization(saved ? JSON.parse(saved) : null, snippets.map((item) => item.id)));
    } catch {
      setOrganization(createOrganization(snippets.map((item) => item.id)));
    }
    setReady(true);
  }, [snippets]);

  useEffect(() => {
    if (ready) localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(organization));
  }, [organization, ready]);

  function createFolder() {
    if (!folderName.trim()) return;
    setOrganization((state) => addFolder(state, folderName, crypto.randomUUID()));
    setFolderName("");
  }

  function dropSnippet(destinationId: string | null, index?: number) {
    if (dragged?.type === "snippet") setOrganization((state) => moveSnippet(state, dragged.id, destinationId, index));
    setDragged(null); setDropTarget("");
  }

  const snippetCard = (id: string, destinationId: string | null, index: number) => {
    const snippet = lookup.get(id);
    if (!snippet) return null;
    return (
      <article
        key={id}
        id={`snippet-${id}`}
        draggable
        onClick={() =>
          recordRecentSnippet({
            id: snippet.id,
            title: snippet.title,
            language: snippet.language,
            description: snippet.description,
          })
        }
        onDragStart={() => setDragged({ type: "snippet", id })}
        onDragEnd={() => { setDragged(null); setDropTarget(""); }}
        onDragOver={(event) => { event.preventDefault(); setDropTarget(`snippet:${destinationId ?? "unfiled"}:${index}`); }}
        onDrop={(event) => { event.preventDefault(); dropSnippet(destinationId, index); }}
        className={`group flex cursor-grab items-center gap-3 rounded-lg border bg-slate-900 p-3 transition active:cursor-grabbing ${
          dropTarget === `snippet:${destinationId ?? "unfiled"}:${index}` ? "border-fuchsia-400 translate-y-1" : "border-white/10 hover:border-fuchsia-400/40"
        }`}
      >
        <GripVertical className="h-4 w-4 text-slate-600 group-hover:text-fuchsia-300" />
        <FileCode2 className="h-4 w-4 text-blue-300" />
        <div className="min-w-0"><h3 className="truncate text-sm font-medium text-slate-100">{snippet.title}</h3><p className="text-xs text-slate-500">{snippet.language}</p></div>
      </article>
    );
  };

  const zone = (destinationId: string | null, ids: string[]) => (
    <div
      onDragOver={(event) => { event.preventDefault(); setDropTarget(`zone:${destinationId ?? "unfiled"}`); }}
      onDrop={(event) => { event.preventDefault(); dropSnippet(destinationId); }}
      className={`min-h-20 space-y-2 rounded-lg border border-dashed p-2 transition ${
        dropTarget === `zone:${destinationId ?? "unfiled"}` ? "border-fuchsia-400 bg-fuchsia-500/10" : "border-white/10"
      }`}
    >
      {ids.length ? ids.map((id, index) => snippetCard(id, destinationId, index)) : <p className="py-5 text-center text-xs text-slate-600">Drop snippets here</p>}
    </div>
  );

  return (
    <div>
      <form className="mb-8 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); createFolder(); }}>
        <label className="sr-only" htmlFor="folder-name">Folder name</label>
        <input id="folder-name" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="New folder name" maxLength={60} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-4 py-2.5 outline-none focus:border-fuchsia-400" />
        <button className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2.5 font-medium transition hover:bg-fuchsia-500" type="submit"><FolderPlus className="h-4 w-4" />Create</button>
      </form>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Unfiled snippets <span className="ml-1 text-slate-600">{organization.unfiledSnippetIds.length}</span></h2>
        {zone(null, organization.unfiledSnippetIds)}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {organization.folderOrder.map((id, index) => {
          const folder = organization.folders[id];
          return (
            <section
              key={id}
              draggable
              onDragStart={(event) => { if ((event.target as HTMLElement).closest("article")) { event.preventDefault(); return; } setDragged({ type: "folder", id }); }}
              onDragOver={(event) => { if (dragged?.type === "folder") { event.preventDefault(); setDropTarget(`folder:${index}`); } }}
              onDrop={(event) => { if (dragged?.type === "folder") { event.preventDefault(); setOrganization((state) => reorderFolder(state, dragged.id, index)); setDragged(null); setDropTarget(""); } }}
              className={`rounded-xl border bg-white/[.03] p-4 transition ${dropTarget === `folder:${index}` ? "border-fuchsia-400 ring-2 ring-fuchsia-400/20" : "border-white/10"}`}
            >
              <header className="mb-3 flex items-center gap-2">
                <GripVertical className="h-4 w-4 cursor-grab text-slate-600" />
                <Folder className="h-4 w-4 text-amber-300" />
                <h2 className="min-w-0 flex-1 truncate font-semibold">{folder.name}</h2>
                <span className="text-xs text-slate-500">{folder.snippetIds.length}</span>
                <button aria-label={`Rename ${folder.name}`} className="p-1.5 text-slate-500 hover:text-fuchsia-300" onClick={() => { const name = window.prompt("Rename folder", folder.name); if (name) setOrganization((state) => renameFolder(state, id, name)); }}><Pencil className="h-3.5 w-3.5" /></button>
                <button aria-label={`Delete ${folder.name}`} className="p-1.5 text-slate-500 hover:text-rose-300" onClick={() => { if (window.confirm(`Delete “${folder.name}”? Its snippets will become unfiled.`)) setOrganization((state) => deleteFolder(state, id)); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </header>
              {zone(id, folder.snippetIds)}
            </section>
          );
        })}
      </div>
      {organization.folderOrder.length === 0 && <p className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-slate-500">Create a folder, then drag snippets into it.</p>}
    </div>
  );
}
