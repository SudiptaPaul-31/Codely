"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSnippetSelection } from "@/hooks/use-snippet-selection";
import {
  bulkDeleteSnippets,
  bulkExportSnippets,
  bulkMoveSnippets,
  listMyFolders,
} from "@/app/actions/bulk-snippets";

export type BulkSnippet = {
  id: string;
  title: string;
  language: string;
  createdAt: string | Date;
  folderName?: string | null;
};

type Dialog = "delete" | "move" | null;
type Toast = { kind: "success" | "error"; text: string } | null;

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkSnippetManager({ snippets }: { snippets: BulkSnippet[] }) {
  const router = useRouter();
  const sel = useSnippetSelection();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderId, setFolderId] = useState("");
  const [exportFormat, setExportFormat] = useState<"json" | "md">("json");
  const headerRef = useRef<HTMLInputElement>(null);

  const allIds = snippets.map((s) => s.id);
  const allSelected = snippets.length > 0 && sel.count === snippets.length;

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = sel.count > 0 && !allSelected;
  }, [sel.count, allSelected]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function openMove() {
    setDialog("move");
    setFolderId("");
    setFolders(await listMyFolders());
  }

  async function confirmDelete() {
    setBusy(true);
    const res = await bulkDeleteSnippets(sel.ids);
    setBusy(false);
    setDialog(null);
    setToast({ kind: res.ok ? "success" : "error", text: res.message });
    sel.keepOnly(res.failedIds);
    router.refresh();
  }

  async function confirmMove() {
    if (!folderId) {
      setToast({ kind: "error", text: "Please choose a destination folder." });
      return;
    }
    setBusy(true);
    const res = await bulkMoveSnippets(sel.ids, folderId);
    setBusy(false);
    setToast({ kind: res.ok ? "success" : "error", text: res.message });
    if (res.successIds.length > 0) {
      setDialog(null);
      sel.keepOnly(res.failedIds);
      router.refresh();
    }
  }

  async function doExport() {
    setBusy(true);
    const res = await bulkExportSnippets(sel.ids);
    setBusy(false);
    if (!res.ok) {
      setToast({ kind: "error", text: res.message });
      return;
    }
    if (exportFormat === "json") {
      download("snippets-export.json", JSON.stringify(res.snippets, null, 2), "application/json");
    } else {
      const md = res.snippets
        .map(
          (s: any) =>
            `## ${s.title}\n\n- Language: ${s.language}\n- Folder: ${s.folder ?? "None"}\n- Created: ${s.createdAt}\n\n\`\`\`${s.language}\n${s.code}\n\`\`\`\n`
        )
        .join("\n");
      download("snippets-export.md", md, "text/markdown");
    }
    setToast({ kind: "success", text: res.message });
  }

  if (snippets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-gray-500">
        No snippets yet. Create your first snippet to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md px-4 py-2 text-sm ${
            toast.kind === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {toast.text}
        </div>
      )}

      {sel.count > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk snippet actions"
          className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 shadow dark:bg-gray-900"
        >
          <span aria-live="polite" className="mr-auto text-sm font-medium">
            {sel.count} selected
          </span>
          <button onClick={openMove} disabled={busy} className="rounded border px-3 py-1.5 text-sm">
            Move to Folder
          </button>
          <select
            aria-label="Export format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "json" | "md")}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="json">JSON</option>
            <option value="md">Markdown</option>
          </select>
          <button onClick={doExport} disabled={busy} className="rounded border px-3 py-1.5 text-sm">
            {busy ? "Working..." : "Export"}
          </button>
          <button
            onClick={() => setDialog("delete")}
            disabled={busy}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white"
          >
            Delete
          </button>
          <button onClick={sel.clear} className="rounded border px-3 py-1.5 text-sm">
            Clear Selection
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-1 text-sm">
        <input
          ref={headerRef}
          id="select-all"
          type="checkbox"
          checked={allSelected}
          onChange={() => (allSelected ? sel.clear() : sel.selectAll(allIds))}
        />
        <label htmlFor="select-all">Select all ({snippets.length})</label>
      </div>

      <ul className="space-y-2">
        {snippets.map((s) => {
          const checked = sel.isSelected(s.id);
          return (
            <li
              key={s.id}
              data-selected={checked}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                checked ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""
              }`}
            >
              <input
                id={`snip-${s.id}`}
                type="checkbox"
                checked={checked}
                onChange={() => sel.toggle(s.id)}
                aria-label={`Select snippet ${s.title}`}
              />
              <label htmlFor={`snip-${s.id}`} className="flex-1 cursor-pointer">
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-gray-500">
                  {s.language} · {new Date(s.createdAt).toLocaleDateString()}
                  {s.folderName ? ` · 📁 ${s.folderName}` : ""}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-dialog-title"
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
          >
            {dialog === "delete" ? (
              <>
                <h2 id="bulk-dialog-title" className="text-lg font-semibold">
                  Delete {sel.count} Snippet{sel.count === 1 ? "" : "s"}?
                </h2>
                <p className="mt-2 text-sm text-gray-600">This action cannot be undone.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button autoFocus onClick={() => setDialog(null)} disabled={busy} className="rounded border px-3 py-1.5 text-sm">
                    Cancel
                  </button>
                  <button onClick={confirmDelete} disabled={busy} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white">
                    {busy ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="bulk-dialog-title" className="text-lg font-semibold">
                  Move {sel.count} Snippet{sel.count === 1 ? "" : "s"}
                </h2>
                <label htmlFor="dest-folder" className="mt-3 block text-sm">
                  Select destination folder:
                </label>
                <select
                  id="dest-folder"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-2 text-sm"
                >
                  <option value="">Choose a folder...</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {folders.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">You have no folders yet.</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button autoFocus onClick={() => setDialog(null)} disabled={busy} className="rounded border px-3 py-1.5 text-sm">
                    Cancel
                  </button>
                  <button onClick={confirmMove} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
                    {busy ? "Moving..." : "Move"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}