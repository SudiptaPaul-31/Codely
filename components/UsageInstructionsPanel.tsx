"use client";

import React, { useEffect, useId, useState } from "react";
import { BookOpen, Loader2, PencilLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isUsageInstructionsEmpty,
  parseStoredUsageInstructions,
  type UsageInstructions,
} from "@/lib/usage-instructions";
import { UsageInstructionsEditor } from "./UsageInstructionsEditor";
import { UsageInstructionsView } from "./UsageInstructionsView";

export { UsageInstructionsView };

export interface UsageInstructionsPanelProps {
  snippetId: string;
  /** The snippet's `usage_instructions` as returned by GET /api/snippets/[id]. */
  usage: unknown;
  /** The viewer is known to own the snippet; skips the permission round trip. */
  isOwner?: boolean;
  token?: string | null;
  /** Called after a successful save or delete, so the parent can update its copy. */
  onChange?: (usage: UsageInstructions | null) => void;
}

/**
 * The dedicated "Usage Instructions" panel on the snippet details view.
 *
 * Owners, and collaborators the server says may edit, get an Edit / Add
 * button. Everyone else sees the instructions read-only, or an empty state.
 */
export function UsageInstructionsPanel({ snippetId, usage, isOwner = false, token, onChange }: UsageInstructionsPanelProps) {
  const titleId = useId();
  const [current, setCurrent] = useState<UsageInstructions | null>(() => parseStoredUsageInstructions(usage));
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(isOwner);
  const [checking, setChecking] = useState(false);

  // A different snippet, or a reload of this one, replaces local state.
  useEffect(() => {
    setCurrent(parseStoredUsageInstructions(usage));
    setEditing(false);
  }, [snippetId, usage]);

  // Collaborators with edit access are not visible to the client; ask the
  // server, which applies the same rule it enforces on save.
  useEffect(() => {
    let cancelled = false;
    if (isOwner) {
      setCanEdit(true);
      return;
    }
    if (!token) {
      setCanEdit(false);
      return;
    }
    setChecking(true);
    fetch(`/api/snippets/${snippetId}/usage`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : { canEdit: false }))
      .then((data) => !cancelled && setCanEdit(!!data?.canEdit))
      .catch(() => !cancelled && setCanEdit(false))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [snippetId, isOwner, token]);

  const handleSaved = (next: UsageInstructions | null) => {
    setCurrent(next);
    setEditing(false);
    onChange?.(next);
  };

  const empty = isUsageInstructionsEmpty(current);

  return (
    <section
      aria-labelledby={titleId}
      data-testid="usage-instructions-panel"
      className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="flex items-center gap-2 text-base font-semibold text-white">
          <BookOpen className="h-4 w-4 text-cyan-300" aria-hidden />
          Usage Instructions
        </h3>
        {checking && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Checking edit access" />}
        {canEdit && !editing && !checking && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
          >
            {empty ? <Plus className="mr-1.5 h-4 w-4" aria-hidden /> : <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />}
            {empty ? "Add instructions" : "Edit instructions"}
          </Button>
        )}
      </div>

      {editing ? (
        <UsageInstructionsEditor
          snippetId={snippetId}
          initial={current}
          token={token}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      ) : empty ? (
        <div data-testid="usage-empty-state" className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center">
          <p className="text-sm text-slate-300">No usage instructions yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            {canEdit
              ? "Explain what this snippet does, how to set it up, and show example input and output."
              : "The author hasn't documented how to use this snippet."}
          </p>
        </div>
      ) : (
        <UsageInstructionsView usage={current!} headingLevel={4} />
      )}
    </section>
  );
}

/**
 * The usage-instructions editor for the snippet edit form. It loads and saves
 * independently of the snippet form, so its save never collides with the
 * form's autosave or conflict detection.
 */
export function UsageInstructionsFormSection({ snippetId, token }: { snippetId: string; token?: string | null }) {
  const titleId = useId();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [usage, setUsage] = useState<UsageInstructions | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/snippets/${snippetId}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUsage(parseStoredUsageInstructions(data?.usage_instructions));
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [snippetId, token, attempt]);

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-xl border border-cyan-500/20 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="flex items-center gap-2 text-base font-semibold text-white">
          <BookOpen className="h-4 w-4 text-cyan-300" aria-hidden />
          Usage Instructions
        </h3>
        {savedAt && (
          <span role="status" className="text-xs text-emerald-300">
            Saved {savedAt.toLocaleTimeString()}
          </span>
        )}
      </div>
      {state === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading usage instructions…
        </p>
      )}
      {state === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-rose-300">
          Couldn't load usage instructions.
          <Button size="sm" variant="outline" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        </div>
      )}
      {state === "ready" && (
        <UsageInstructionsEditor
          key={usage?.updatedAt ?? "new"}
          snippetId={snippetId}
          initial={usage}
          token={token}
          onSaved={(next) => {
            setUsage(next);
            setSavedAt(new Date());
          }}
        />
      )}
    </section>
  );
}

export default UsageInstructionsPanel;
