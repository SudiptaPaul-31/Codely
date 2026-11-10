"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import {
  AlertCircle,
  Boxes,
  Loader2,
  Package,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";

export const UI_SUPPORTED_ECOSYSTEMS = [
  "npm",
  "pip",
  "Maven",
  "NuGet",
  "Cargo",
  "Other",
] as const;

export type UiDependencyEcosystem = (typeof UI_SUPPORTED_ECOSYSTEMS)[number];

export interface DependencyItemMetadata {
  id: string;
  name: string;
  version: string;
  ecosystem: UiDependencyEcosystem;
  description?: string;
}

export interface SnippetDependencyCollection {
  snippetId: string;
  dependencies: DependencyItemMetadata[];
  compatibilityNotes?: string;
  author?: string;
  updatedAt?: string;
}

const STORAGE_PREFIX = "codely:snippet-dependencies:v1:";

const PACKAGE_NAME_PATTERN =
  /^(@[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+|[a-zA-Z0-9][a-zA-Z0-9._:\s/-]*)$/;

const STRICT_PACKAGE_IDENTIFIER =
  /^(@[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+|[a-zA-Z0-9][a-zA-Z0-9._:/-]*|[A-Za-z0-9][A-Za-z0-9 ._-]{0,60})$/;

const VERSION_PATTERN =
  /^(latest|\*|v?\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?|(\^|~|>=|<=|>|<|=)\s*v?\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?|\d+\.x|\d+\.\d+\.x)$/;

export function sanitizeMetadataText(raw: unknown, maxLength = 300): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function validateUiDependencyEntry(entry: {
  name: string;
  version: string;
  ecosystem?: string;
  description?: string;
}): {
  valid: boolean;
  errors: { name?: string; version?: string; ecosystem?: string };
} {
  const errors: { name?: string; version?: string; ecosystem?: string } = {};
  const trimmedName = (entry.name || "").trim();
  const trimmedVersion = (entry.version || "").trim();

  if (!trimmedName) {
    errors.name = "Library or package name is required.";
  } else if (
    trimmedName.length > 120 ||
    /[<>;"'`\\]/.test(trimmedName) ||
    trimmedName.includes("..") ||
    (!PACKAGE_NAME_PATTERN.test(trimmedName) &&
      !STRICT_PACKAGE_IDENTIFIER.test(trimmedName))
  ) {
    errors.name =
      "Enter a valid package or library name (letters, numbers, @scope/pkg, '.', '-', '_').";
  }

  if (!trimmedVersion) {
    errors.version = "Version number is required.";
  } else if (
    trimmedVersion.length > 64 ||
    /[<>;"'`\\]/.test(trimmedVersion) ||
    !VERSION_PATTERN.test(trimmedVersion)
  ) {
    errors.version =
      "Enter a valid version number (e.g. 18.3.1, v15.0.0, or ^4.0.0).";
  }

  if (
    entry.ecosystem &&
    !UI_SUPPORTED_ECOSYSTEMS.includes(entry.ecosystem as UiDependencyEcosystem)
  ) {
    errors.ecosystem = "Select a supported package ecosystem.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatDisplayVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("v") ||
    trimmed.startsWith("^") ||
    trimmed.startsWith("~") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("<") ||
    trimmed === "latest" ||
    trimmed === "*"
  ) {
    return trimmed;
  }
  return `v${trimmed}`;
}

export function loadPersistedDependencies(
  snippetId: string,
): SnippetDependencyCollection | null {
  if (typeof window === "undefined" || !snippetId) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${snippetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnippetDependencyCollection;
    if (!parsed || !Array.isArray(parsed.dependencies)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedDependencies(
  collection: SnippetDependencyCollection,
): void {
  if (typeof window === "undefined" || !collection.snippetId) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${collection.snippetId}`,
      JSON.stringify(collection),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export interface SnippetDependencyEditorProps {
  snippetId: string;
  initialDependencies?: DependencyItemMetadata[];
  initialCompatibilityNotes?: string;
  canEdit?: boolean;
  onSave?: (
    collection: SnippetDependencyCollection,
  ) => Promise<void> | void;
  onCancel?: () => void;
}

export function SnippetDependencyEditor({
  snippetId,
  initialDependencies = [],
  initialCompatibilityNotes = "",
  canEdit = true,
  onSave,
  onCancel,
}: SnippetDependencyEditorProps) {
  const [dependencies, setDependencies] = useState<DependencyItemMetadata[]>(
    () => initialDependencies.map((d) => ({ ...d })),
  );
  const [nameInput, setNameInput] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [ecosystemInput, setEcosystemInput] =
    useState<UiDependencyEcosystem>("npm");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [compatibilityNotes, setCompatibilityNotes] = useState(
    initialCompatibilityNotes,
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    version?: string;
    ecosystem?: string;
    form?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const formTitleId = useId();
  const nameInputId = useId();
  const versionInputId = useId();
  const ecosystemInputId = useId();
  const descInputId = useId();
  const compatInputId = useId();

  const handleAddOrUpdateEntry = () => {
    if (!canEdit) {
      setFieldErrors({
        form: "You do not have permission to modify dependencies for this snippet.",
      });
      return;
    }

    const validation = validateUiDependencyEntry({
      name: nameInput,
      version: versionInput,
      ecosystem: ecosystemInput,
      description: descriptionInput,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    const cleanName = sanitizeMetadataText(nameInput, 120);
    const cleanVersion = sanitizeMetadataText(versionInput, 64);
    const cleanDescription = sanitizeMetadataText(descriptionInput, 240);

    // Check duplicate by name + ecosystem (excluding editingId)
    const duplicate = dependencies.find(
      (d) =>
        d.id !== editingId &&
        d.name.toLowerCase() === cleanName.toLowerCase() &&
        d.ecosystem.toLowerCase() === ecosystemInput.toLowerCase(),
    );
    if (duplicate) {
      setFieldErrors({
        name: `Dependency "${cleanName}" (${ecosystemInput}) is already listed.`,
      });
      return;
    }

    if (editingId) {
      setDependencies((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name: cleanName,
                version: cleanVersion,
                ecosystem: ecosystemInput,
                description: cleanDescription || undefined,
              }
            : item,
        ),
      );
      setEditingId(null);
    } else {
      const nextEntry: DependencyItemMetadata = {
        id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        version: cleanVersion,
        ecosystem: ecosystemInput,
        description: cleanDescription || undefined,
      };
      setDependencies((prev) => [...prev, nextEntry]);
    }

    setNameInput("");
    setVersionInput("");
    setDescriptionInput("");
    setEcosystemInput("npm");
    setFieldErrors({});
  };

  const handleStartEdit = (dep: DependencyItemMetadata) => {
    if (!canEdit) return;
    setEditingId(dep.id);
    setNameInput(dep.name);
    setVersionInput(dep.version);
    setEcosystemInput(dep.ecosystem);
    setDescriptionInput(dep.description ?? "");
    setFieldErrors({});
  };

  const handleRemoveEntry = (id: string) => {
    if (!canEdit) return;
    setDependencies((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setNameInput("");
      setVersionInput("");
      setDescriptionInput("");
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setFieldErrors({
        form: "You do not have permission to save dependency changes.",
      });
      return;
    }

    // If user typed partial or unadded input in the draft fields, validate it first
    if (nameInput.trim() || versionInput.trim()) {
      const draftValidation = validateUiDependencyEntry({
        name: nameInput,
        version: versionInput,
        ecosystem: ecosystemInput,
      });
      if (!draftValidation.valid) {
        setFieldErrors(draftValidation.errors);
        return;
      }
    }

    setIsSaving(true);
    setFieldErrors({});

    try {
      const payload: SnippetDependencyCollection = {
        snippetId,
        dependencies,
        compatibilityNotes:
          sanitizeMetadataText(compatibilityNotes, 300) || undefined,
        updatedAt: new Date().toISOString().split("T")[0],
      };

      savePersistedDependencies(payload);
      await onSave?.(payload);
    } catch (err) {
      setFieldErrors({
        form:
          err instanceof Error
            ? err.message
            : "Failed to save dependency metadata.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div
        role="alert"
        data-testid="dependency-editor-unauthorized"
        className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-sm text-amber-200"
      >
        Only the snippet owner can edit dependency metadata.
      </div>
    );
  }

  return (
    <form
      aria-labelledby={formTitleId}
      onSubmit={handleSaveAll}
      data-testid="snippet-dependency-editor"
      className="space-y-4 rounded-xl border border-cyan-500/30 bg-slate-900/80 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h4
          id={formTitleId}
          className="flex items-center gap-2 text-sm font-semibold text-white"
        >
          <Boxes className="h-4 w-4 text-cyan-300" aria-hidden />
          Dependencies Editor
        </h4>
        <span className="text-xs text-slate-400">
          {dependencies.length}{" "}
          {dependencies.length === 1 ? "dependency" : "dependencies"} queued
        </span>
      </div>

      {(fieldErrors.form ||
        fieldErrors.name ||
        fieldErrors.version ||
        fieldErrors.ecosystem) && (
        <div
          role="alert"
          data-testid="dependency-validation-error"
          className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
          <div>
            {fieldErrors.form && <p>{fieldErrors.form}</p>}
            {fieldErrors.name && <p>{fieldErrors.name}</p>}
            {fieldErrors.version && <p>{fieldErrors.version}</p>}
            {fieldErrors.ecosystem && <p>{fieldErrors.ecosystem}</p>}
          </div>
        </div>
      )}

      {/* Entry input fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor={nameInputId}
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Library / Package Name
          </label>
          <input
            id={nameInputId}
            type="text"
            value={nameInput}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. react"
            className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={versionInputId}
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Version Number
          </label>
          <input
            id={versionInputId}
            type="text"
            value={versionInput}
            aria-invalid={Boolean(fieldErrors.version)}
            onChange={(e) => setVersionInput(e.target.value)}
            placeholder="e.g. 18.3.1"
            className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={ecosystemInputId}
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Package Ecosystem
          </label>
          <select
            id={ecosystemInputId}
            value={ecosystemInput}
            onChange={(e) =>
              setEcosystemInput(e.target.value as UiDependencyEcosystem)
            }
            className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
          >
            {UI_SUPPORTED_ECOSYSTEMS.map((eco) => (
              <option key={eco} value={eco}>
                {eco}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={descInputId}
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Description (Optional)
          </label>
          <input
            id={descInputId}
            type="text"
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            placeholder="UI state library"
            className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAddOrUpdateEntry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-900/60"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {editingId ? "Update Dependency" : "Add Dependency"}
        </button>
      </div>

      {/* Current dependency entries list */}
      {dependencies.length > 0 && (
        <ul
          aria-label="Added dependencies"
          className="divide-y divide-white/10 rounded-lg border border-white/10 bg-slate-950/60"
        >
          {dependencies.map((dep) => (
            <li
              key={dep.id}
              data-testid={`editor-dependency-item-${dep.name}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{dep.name}</span>
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-xs text-cyan-300">
                  {formatDisplayVersion(dep.version)}
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  {dep.ecosystem}
                </span>
                {dep.description && (
                  <span className="text-xs text-slate-400">
                    — {dep.description}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Edit ${dep.name}`}
                  onClick={() => handleStartEdit(dep)}
                  className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-300"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${dep.name}`}
                  onClick={() => handleRemoveEntry(dep.id)}
                  className="rounded p-1 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Optional snippet compatibility notes */}
      <div>
        <label
          htmlFor={compatInputId}
          className="mb-1 block text-xs font-medium text-slate-300"
        >
          Compatibility Notes (Optional)
        </label>
        <input
          id={compatInputId}
          type="text"
          value={compatibilityNotes}
          onChange={(e) => setCompatibilityNotes(e.target.value)}
          placeholder="Requires Node.js >= 20 and TypeScript 5+"
          className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      {/* Save / Cancel actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-white/15 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save Dependencies"}
        </button>
      </div>
    </form>
  );
}

export interface SnippetDependencyPanelProps {
  snippetId: string;
  dependencies?: DependencyItemMetadata[];
  author?: string;
  updatedAt?: string;
  compatibilityNotes?: string;
  canEdit?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDependenciesChange?: (collection: SnippetDependencyCollection) => void;
}

export function SnippetDependencyPanel({
  snippetId,
  dependencies: propDependencies,
  author,
  updatedAt: propUpdatedAt,
  compatibilityNotes: propCompatibilityNotes,
  canEdit = false,
  isLoading = false,
  error = null,
  onRetry,
  onDependenciesChange,
}: SnippetDependencyPanelProps) {
  const headingId = useId();
  const [isEditing, setIsEditing] = useState(false);

  const [collection, setCollection] = useState<SnippetDependencyCollection>(() => {
    const persisted = loadPersistedDependencies(snippetId);
    if (persisted && (!propDependencies || propDependencies.length === 0)) {
      return persisted;
    }
    return {
      snippetId,
      dependencies: propDependencies ?? [],
      compatibilityNotes: propCompatibilityNotes,
      author,
      updatedAt: propUpdatedAt,
    };
  });

  useEffect(() => {
    if (propDependencies !== undefined) {
      const persisted = loadPersistedDependencies(snippetId);
      if (persisted && propDependencies.length === 0) {
        setCollection(persisted);
      } else {
        setCollection({
          snippetId,
          dependencies: propDependencies,
          compatibilityNotes: propCompatibilityNotes,
          author,
          updatedAt: propUpdatedAt,
        });
      }
    }
  }, [snippetId, propDependencies, propCompatibilityNotes, author, propUpdatedAt]);

  const primaryEcosystem = useMemo(() => {
    if (collection.dependencies.length === 0) return "None";
    const counts = new Map<string, number>();
    for (const dep of collection.dependencies) {
      counts.set(dep.ecosystem, (counts.get(dep.ecosystem) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [collection.dependencies]);

  if (isLoading) {
    return (
      <section
        aria-label="Loading dependencies"
        role="status"
        data-testid="dependency-loading-state"
        className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-slate-900/60 p-5 text-sm text-slate-300"
      >
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" aria-hidden />
        <span>Loading dependency metadata…</span>
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        data-testid="dependency-error-state"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-5 text-sm text-rose-200"
      >
        <span>{error}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-rose-400/40 bg-rose-900/40 px-3 py-1 text-xs font-medium text-rose-100 hover:bg-rose-800/50"
          >
            Retry
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      data-testid="snippet-dependency-panel"
      className="space-y-4 rounded-xl border border-cyan-500/25 bg-slate-900/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-cyan-300" aria-hidden />
          <h3 id={headingId} className="text-base font-semibold text-white">
            Dependencies
          </h3>
          <span
            data-testid="dependency-count-badge"
            className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-medium text-cyan-300"
          >
            {collection.dependencies.length}
          </span>
        </div>

        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-900/50"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            {collection.dependencies.length === 0
              ? "Add Dependencies"
              : "Edit Dependencies"}
          </button>
        )}
      </div>

      {isEditing ? (
        <SnippetDependencyEditor
          snippetId={snippetId}
          initialDependencies={collection.dependencies}
          initialCompatibilityNotes={collection.compatibilityNotes}
          canEdit={canEdit}
          onCancel={() => setIsEditing(false)}
          onSave={(updated) => {
            const merged: SnippetDependencyCollection = {
              ...updated,
              author: author ?? collection.author,
            };
            setCollection(merged);
            setIsEditing(false);
            onDependenciesChange?.(merged);
          }}
        />
      ) : collection.dependencies.length === 0 ? (
        <div
          data-testid="dependency-empty-state"
          className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center"
        >
          <p className="text-sm text-slate-300">
            No external dependencies specified for this snippet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            This code snippet runs without additional third-party packages.
          </p>
        </div>
      ) : (
        <>
          <ul
            aria-label="Snippet dependencies list"
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          >
            {collection.dependencies.map((dep) => {
              const safeName = sanitizeMetadataText(dep.name, 120);
              const safeVersion = formatDisplayVersion(
                sanitizeMetadataText(dep.version, 64),
              );
              const safeDesc = dep.description
                ? sanitizeMetadataText(dep.description, 240)
                : "";

              return (
                <li
                  key={dep.id}
                  data-testid={`dependency-card-${safeName}`}
                  className="flex flex-col justify-between rounded-lg border border-white/10 bg-slate-950/70 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{safeName}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-xs font-medium text-cyan-300">
                        {safeVersion}
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {dep.ecosystem}
                      </span>
                    </div>
                  </div>
                  {safeDesc && (
                    <p className="mt-1.5 text-xs text-slate-400">{safeDesc}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Summary Metadata Footer */}
          <div
            data-testid="dependency-summary-metadata"
            className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-slate-950/50 px-3.5 py-2.5 text-xs text-slate-400"
          >
            <span>
              Package Ecosystem:{" "}
              <strong className="font-medium text-slate-200">
                {primaryEcosystem}
              </strong>
            </span>
            <span>
              Total Dependencies:{" "}
              <strong className="font-medium text-slate-200">
                {collection.dependencies.length}
              </strong>
            </span>
            {collection.updatedAt && (
              <span>
                Last Updated:{" "}
                <strong className="font-medium text-slate-200">
                  {collection.updatedAt}
                </strong>
              </span>
            )}
            {collection.author && (
              <span>
                Author:{" "}
                <strong className="font-medium text-slate-200">
                  {sanitizeMetadataText(collection.author, 80)}
                </strong>
              </span>
            )}
            {collection.compatibilityNotes && (
              <span>
                Compatibility:{" "}
                <strong className="font-medium text-slate-200">
                  {sanitizeMetadataText(collection.compatibilityNotes, 300)}
                </strong>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default SnippetDependencyPanel;
