"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import {
  CheckSquare,
  Download,
  FileCode2,
  Folder,
  FolderInput,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

export interface BulkManagedSnippet {
  id: string;
  title: string;
  language: string;
  description?: string;
  folderId?: string | null;
  folderName?: string | null;
  ownerWallet?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  updatedAt?: string;
}

export interface BulkManagedFolder {
  id: string;
  name: string;
  canWrite?: boolean;
}

export interface BulkItemOutcome {
  snippetId: string;
  status: "success" | "failed";
  code?: string;
  reason?: string;
  message?: string;
}

export interface BulkOperationResponse {
  results: BulkItemOutcome[];
  exportedSnippets?: unknown[];
  exportedContent?: string;
}

export interface BulkSnippetManagerProps {
  snippets: BulkManagedSnippet[];
  folders?: BulkManagedFolder[];
  currentUserWallet?: string | null;
  isLoading?: boolean;
  exportFormat?: "json" | "markdown";
  onBulkMove?: (
    snippetIds: string[],
    destinationFolderId: string | null,
  ) => Promise<BulkOperationResponse>;
  onBulkExport?: (
    snippetIds: string[],
    format: "json" | "markdown",
  ) => Promise<BulkOperationResponse>;
  onBulkDelete?: (snippetIds: string[]) => Promise<BulkOperationResponse>;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function BulkSnippetManager({
  snippets: initialSnippets,
  folders = [],
  currentUserWallet,
  isLoading = false,
  exportFormat: initialExportFormat = "json",
  onBulkMove,
  onBulkExport,
  onBulkDelete,
  onSelectionChange,
}: BulkSnippetManagerProps) {
  const [snippets, setSnippets] = useState<BulkManagedSnippet[]>(initialSnippets);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFolderFilter, setActiveFolderFilter] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<"json" | "markdown">(
    initialExportFormat,
  );

  // Modal states
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [destinationFolderId, setDestinationFolderId] = useState<string>("");

  // Operation feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deleteDialogTitleId = useId();
  const moveDialogTitleId = useId();
  const folderSelectId = useId();

  useEffect(() => {
    setSnippets(initialSnippets);
  }, [initialSnippets]);

  const folderMap = useMemo(() => {
    const map = new Map<string, BulkManagedFolder>();
    for (const f of folders) {
      map.set(f.id, f);
    }
    return map;
  }, [folders]);

  const visibleSnippets = useMemo(() => {
    if (activeFolderFilter === "all") return snippets;
    if (activeFolderFilter === "unfiled") {
      return snippets.filter((s) => !s.folderId);
    }
    return snippets.filter((s) => s.folderId === activeFolderFilter);
  }, [snippets, activeFolderFilter]);

  const selectedSnippets = useMemo(
    () => snippets.filter((s) => selectedIds.has(s.id)),
    [snippets, selectedIds],
  );

  const selectedCount = selectedIds.size;

  const canModifySnippet = (snippet: BulkManagedSnippet): boolean => {
    if (typeof snippet.canEdit === "boolean") return snippet.canEdit;
    if (currentUserWallet && snippet.ownerWallet) {
      return snippet.ownerWallet === currentUserWallet;
    }
    return true;
  };

  const canRemoveSnippet = (snippet: BulkManagedSnippet): boolean => {
    if (typeof snippet.canDelete === "boolean") return snippet.canDelete;
    if (currentUserWallet && snippet.ownerWallet) {
      return snippet.ownerWallet === currentUserWallet;
    }
    return true;
  };

  const hasAuthorizedMoveSelection = useMemo(
    () => selectedSnippets.some((s) => canModifySnippet(s)),
    [selectedSnippets, currentUserWallet],
  );

  const hasAuthorizedDeleteSelection = useMemo(
    () => selectedSnippets.some((s) => canRemoveSnippet(s)),
    [selectedSnippets, currentUserWallet],
  );

  const updateSelection = (next: Set<string>) => {
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next));
  };

  const toggleSnippetSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    updateSelection(next);
  };

  const allVisibleSelected =
    visibleSnippets.length > 0 &&
    visibleSnippets.every((s) => selectedIds.has(s.id));

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      for (const s of visibleSnippets) {
        next.delete(s.id);
      }
    } else {
      for (const s of visibleSnippets) {
        next.add(s.id);
      }
    }
    updateSelection(next);
  };

  const clearSelection = () => {
    updateSelection(new Set());
    setIsDeleteDialogOpen(false);
    setIsMoveDialogOpen(false);
  };

  const executeDefaultBulkRequest = async (
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<BulkOperationResponse> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (currentUserWallet) {
      headers["x-wallet-address"] = currentUserWallet;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Bulk operation failed.");
    }
    return data as BulkOperationResponse;
  };

  const handleBulkExport = async () => {
    if (selectedCount === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const ids = Array.from(selectedIds);
    try {
      const response = onBulkExport
        ? await onBulkExport(ids, exportFormat)
        : await executeDefaultBulkRequest("/api/snippets/bulk/export", {
            snippetIds: ids,
            format: exportFormat,
          });

      const failedItems = response.results.filter((r) => r.status === "failed");
      const succeededItems = response.results.filter(
        (r) => r.status === "success",
      );

      if (failedItems.length > 0) {
        const failedSet = new Set(failedItems.map((f) => f.snippetId));
        updateSelection(failedSet);
        const reasons = failedItems
          .map((f) => `${f.snippetId}: ${f.reason || f.message || "Failed"}`)
          .join("; ");
        setErrorMessage(
          `Exported ${succeededItems.length} of ${ids.length} snippets. Failed (${failedItems.length}): ${reasons}`,
        );
      } else {
        setStatusMessage(
          `Successfully exported ${succeededItems.length} ${
            succeededItems.length === 1 ? "snippet" : "snippets"
          }.`,
        );
        updateSelection(new Set());
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to export selected snippets.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openMoveDialog = () => {
    if (selectedCount === 0 || !hasAuthorizedMoveSelection) return;
    setErrorMessage(null);
    setStatusMessage(null);
    const firstWritable = folders.find((f) => f.canWrite !== false);
    setDestinationFolderId(firstWritable ? firstWritable.id : "__unfiled__");
    setIsMoveDialogOpen(true);
  };

  const handleConfirmMove = async () => {
    if (selectedCount === 0 || isSubmitting) return;

    if (!destinationFolderId) {
      setErrorMessage("Please select a valid destination folder.");
      return;
    }

    const targetFolderId =
      destinationFolderId === "__unfiled__" ? null : destinationFolderId;

    if (targetFolderId !== null) {
      const folder = folderMap.get(targetFolderId);
      if (!folder || folder.canWrite === false) {
        setErrorMessage(
          "You do not have permission to move snippets to the selected destination folder.",
        );
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const ids = Array.from(selectedIds);
    try {
      const response = onBulkMove
        ? await onBulkMove(ids, targetFolderId)
        : await executeDefaultBulkRequest("/api/snippets/bulk/move", {
            snippetIds: ids,
            folderId: targetFolderId,
          });

      const succeededIds = new Set(
        response.results
          .filter((r) => r.status === "success")
          .map((r) => r.snippetId),
      );
      const failedItems = response.results.filter((r) => r.status === "failed");

      if (succeededIds.size > 0) {
        const destFolderName = targetFolderId
          ? folderMap.get(targetFolderId)?.name ?? null
          : null;
        setSnippets((prev) =>
          prev.map((s) =>
            succeededIds.has(s.id)
              ? {
                  ...s,
                  folderId: targetFolderId,
                  folderName: destFolderName,
                }
              : s,
          ),
        );
      }

      setIsMoveDialogOpen(false);

      if (failedItems.length > 0) {
        const failedSet = new Set(failedItems.map((f) => f.snippetId));
        updateSelection(failedSet);
        const reasons = failedItems
          .map((f) => `${f.snippetId}: ${f.reason || f.message || "Failed"}`)
          .join("; ");
        setErrorMessage(
          `Moved ${succeededIds.size} of ${ids.length} snippets. Failed (${failedItems.length}): ${reasons}`,
        );
      } else {
        setStatusMessage(
          `Successfully moved ${succeededIds.size} ${
            succeededIds.size === 1 ? "snippet" : "snippets"
          }.`,
        );
        updateSelection(new Set());
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to move selected snippets.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = () => {
    if (selectedCount === 0 || !hasAuthorizedDeleteSelection) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedCount === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const ids = Array.from(selectedIds);
    try {
      const response = onBulkDelete
        ? await onBulkDelete(ids)
        : await executeDefaultBulkRequest("/api/snippets/bulk/delete", {
            snippetIds: ids,
          });

      const succeededIds = new Set(
        response.results
          .filter((r) => r.status === "success")
          .map((r) => r.snippetId),
      );
      const failedItems = response.results.filter((r) => r.status === "failed");

      if (succeededIds.size > 0) {
        setSnippets((prev) => prev.filter((s) => !succeededIds.has(s.id)));
      }

      setIsDeleteDialogOpen(false);

      if (failedItems.length > 0) {
        const failedSet = new Set(failedItems.map((f) => f.snippetId));
        updateSelection(failedSet);
        const reasons = failedItems
          .map((f) => `${f.snippetId}: ${f.reason || f.message || "Failed"}`)
          .join("; ");
        setErrorMessage(
          `Deleted ${succeededIds.size} of ${ids.length} snippets. Failed (${failedItems.length}): ${reasons}`,
        );
      } else {
        setStatusMessage(
          `Successfully deleted ${succeededIds.size} ${
            succeededIds.size === 1 ? "snippet" : "snippets"
          }.`,
        );
        updateSelection(new Set());
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to delete selected snippets.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading snippets"
        data-testid="bulk-loading-state"
        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-8 text-sm text-slate-300"
      >
        <Loader2 className="h-4 w-4 animate-spin text-fuchsia-400" aria-hidden />
        <span>Loading snippets…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="bulk-snippet-manager">
      {/* Screen-reader live selection counter & status */}
      <div className="sr-only" aria-live="polite" data-testid="sr-selection-announcement">
        {selectedCount === 0
          ? "No snippets selected"
          : `${selectedCount} ${selectedCount === 1 ? "snippet" : "snippets"} selected`}
      </div>

      {/* Feedback notifications */}
      {statusMessage && (
        <div
          role="status"
          data-testid="bulk-status-banner"
          className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200"
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setStatusMessage(null)}
            className="text-emerald-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          data-testid="bulk-error-banner"
          className="flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-200"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setErrorMessage(null)}
            className="text-rose-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top controls: Select All + Folder View Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-200">
            <input
              type="checkbox"
              aria-label="Select all snippets"
              checked={allVisibleSelected}
              disabled={visibleSnippets.length === 0}
              onChange={toggleSelectAllVisible}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-fuchsia-600 focus:ring-2 focus:ring-fuchsia-500"
            />
            <span>Select All</span>
          </label>

          <span
            data-testid="selected-item-counter"
            className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300"
          >
            {selectedCount} selected
          </span>
        </div>

        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by folder">
            <button
              type="button"
              onClick={() => setActiveFolderFilter("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                activeFolderFilter === "all"
                  ? "bg-fuchsia-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              All Snippets
            </button>
            <button
              type="button"
              onClick={() => setActiveFolderFilter("unfiled")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                activeFolderFilter === "unfiled"
                  ? "bg-fuchsia-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Unfiled
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderFilter(folder.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  activeFolderFilter === folder.id
                    ? "bg-fuchsia-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      {selectedCount > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk snippet actions"
          data-testid="bulk-action-toolbar"
          className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fuchsia-500/40 bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckSquare className="h-4 w-4 text-fuchsia-400" aria-hidden />
            <span data-testid="toolbar-selected-count">
              {selectedCount} {selectedCount === 1 ? "snippet" : "snippets"} selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openMoveDialog}
              disabled={isSubmitting || !hasAuthorizedMoveSelection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderInput className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              Move to Folder
            </button>

            <div className="inline-flex items-center gap-1">
              <select
                aria-label="Export format"
                value={exportFormat}
                onChange={(e) =>
                  setExportFormat(e.target.value as "json" | "markdown")
                }
                disabled={isSubmitting}
                className="rounded-lg border border-white/15 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="json">JSON</option>
                <option value="markdown">Markdown</option>
              </select>
              <button
                type="button"
                onClick={handleBulkExport}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/60 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export
              </button>
            </div>

            <button
              type="button"
              onClick={openDeleteDialog}
              disabled={isSubmitting || !hasAuthorizedDeleteSelection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Snippet List */}
      {visibleSnippets.length === 0 ? (
        <div
          data-testid="bulk-empty-state"
          className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-10 text-center"
        >
          <p className="text-sm font-medium text-slate-300">No snippets available.</p>
          <p className="mt-1 text-xs text-slate-500">
            Create or import code snippets to manage them in bulk.
          </p>
        </div>
      ) : (
        <ul
          role="list"
          aria-label="Manageable code snippets"
          className="grid grid-cols-1 gap-2.5 md:grid-cols-2"
        >
          {visibleSnippets.map((snippet) => {
            const isSelected = selectedIds.has(snippet.id);
            const resolvedFolderName =
              snippet.folderName ??
              (snippet.folderId ? folderMap.get(snippet.folderId)?.name : null);

            return (
              <li
                key={snippet.id}
                data-testid={`snippet-row-${snippet.id}`}
                data-selected={isSelected ? "true" : "false"}
                className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
                  isSelected
                    ? "border-fuchsia-500 bg-fuchsia-950/20 ring-1 ring-fuchsia-500/40"
                    : "border-white/10 bg-slate-900/80 hover:border-white/20"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${snippet.title}`}
                  checked={isSelected}
                  onChange={() => toggleSnippetSelection(snippet.id)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-800 text-fuchsia-600 focus:ring-2 focus:ring-fuchsia-500"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileCode2
                        className="h-4 w-4 shrink-0 text-cyan-300"
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold text-white">
                        {snippet.title}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-300">
                        Selected
                      </span>
                    )}
                  </div>

                  {snippet.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                      {snippet.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      {snippet.language}
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Folder className="h-3 w-3 text-amber-300" aria-hidden />
                      {resolvedFolderName || "Unfiled"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Move to Folder Modal */}
      {isMoveDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={moveDialogTitleId}
          data-testid="bulk-move-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-slate-900 p-6 shadow-xl">
            <h2
              id={moveDialogTitleId}
              className="text-lg font-semibold text-white"
            >
              Move {selectedCount} {selectedCount === 1 ? "Snippet" : "Snippets"}
            </h2>

            <div className="mt-4 space-y-2">
              <label
                htmlFor={folderSelectId}
                className="block text-sm font-medium text-slate-300"
              >
                Select destination folder:
              </label>
              <select
                id={folderSelectId}
                aria-label="Select destination folder"
                value={destinationFolderId}
                onChange={(e) => setDestinationFolderId(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-sm text-white focus:border-fuchsia-400 focus:outline-none"
              >
                <option value="__unfiled__">Unfiled</option>
                {folders.map((folder) => (
                  <option
                    key={folder.id}
                    value={folder.id}
                    disabled={folder.canWrite === false}
                  >
                    {folder.name}
                    {folder.canWrite === false ? " (Read-only)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsMoveDialogOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-white/15 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                disabled={isSubmitting}
                className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
              >
                {isSubmitting ? "Moving…" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={deleteDialogTitleId}
          data-testid="bulk-delete-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl">
            <h2
              id={deleteDialogTitleId}
              className="text-lg font-semibold text-white"
            >
              Delete {selectedCount} {selectedCount === 1 ? "Snippet" : "Snippets"}?
            </h2>

            <p className="mt-2 text-sm text-slate-300">
              This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-white/15 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isSubmitting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BulkSnippetManager;
