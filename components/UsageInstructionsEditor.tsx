"use client";

import React, { useId, useState } from "react";
import { Eye, Loader2, PencilLine, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_EXAMPLE_LENGTH,
  MAX_SECTION_LENGTH,
  PROSE_SECTIONS,
  isUsageInstructionsEmpty,
  normalizeUsageInstructions,
  parseStoredUsageInstructions,
  usageInstructionsInputSchema,
  usageValidationErrors,
  type ProseSectionKey,
  type UsageInstructions,
} from "@/lib/usage-instructions";
import { UsageInstructionsView } from "./UsageInstructionsView";

interface Draft {
  overview: string;
  prerequisites: string;
  setup: string;
  notes: string;
  inputLanguage: string;
  inputCode: string;
  outputLanguage: string;
  outputCode: string;
}

const toDraft = (u: UsageInstructions | null): Draft => ({
  overview: u?.overview ?? "",
  prerequisites: u?.prerequisites ?? "",
  setup: u?.setup ?? "",
  notes: u?.notes ?? "",
  inputLanguage: u?.inputExample?.language ?? "json",
  inputCode: u?.inputExample?.code ?? "",
  outputLanguage: u?.outputExample?.language ?? "json",
  outputCode: u?.outputExample?.code ?? "",
});

const toPayload = (d: Draft) => ({
  overview: d.overview,
  prerequisites: d.prerequisites,
  setup: d.setup,
  notes: d.notes,
  inputExample: { language: d.inputLanguage, code: d.inputCode },
  outputExample: { language: d.outputLanguage, code: d.outputCode },
});

const PLACEHOLDERS: Record<ProseSectionKey, string> = {
  overview: "Describe the purpose of this snippet…",
  prerequisites: "- jsonwebtoken\n- Node.js 20+",
  setup: "1. Install dependencies\n2. Configure environment\n3. Run the snippet",
  notes: "Limitations, known issues, performance or compatibility notes.",
};

export interface UsageInstructionsEditorProps {
  snippetId: string;
  initial: UsageInstructions | null;
  /** JWT from the wallet session; writes are refused without it. */
  token?: string | null;
  onSaved: (usage: UsageInstructions | null) => void;
  onCancel?: () => void;
}

export function UsageInstructionsEditor({
  snippetId,
  initial,
  token,
  onSaved,
  onCancel,
}: UsageInstructionsEditorProps) {
  const baseId = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "deleting">("idle");
  const [requestError, setRequestError] = useState<string | null>(null);

  const busy = status !== "idle";
  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  const previewValue = normalizeUsageInstructions(toPayload(draft));

  const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

  const failureMessage = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && data?.fields) setErrors(data.fields);
    if (res.status === 401) return "Your wallet session has expired. Reconnect your wallet and try again.";
    if (res.status === 403) return "You don't have permission to edit this snippet's usage instructions.";
    if (res.status === 404) return "This snippet no longer exists.";
    return data?.message || data?.error || "Something went wrong. Please try again.";
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRequestError(null);
    const parsed = usageInstructionsInputSchema.safeParse(toPayload(draft));
    if (!parsed.success) {
      setErrors(usageValidationErrors(parsed.error));
      setTab("write");
      return;
    }
    setErrors({});
    if (!token) {
      setRequestError("Connect and sign in with your wallet to save usage instructions.");
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch(`/api/snippets/${snippetId}/usage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(toPayload(draft)),
      });
      if (!res.ok) {
        setRequestError(await failureMessage(res));
        return;
      }
      const data = await res.json();
      onSaved(parseStoredUsageInstructions(data.usage_instructions));
    } catch {
      setRequestError("Network error. Check your connection and try again.");
    } finally {
      setStatus("idle");
    }
  };

  const remove = async () => {
    if (!initial) return;
    if (typeof window !== "undefined" && !window.confirm("Delete all usage instructions for this snippet?")) return;
    setRequestError(null);
    if (!token) {
      setRequestError("Connect and sign in with your wallet to delete usage instructions.");
      return;
    }
    setStatus("deleting");
    try {
      const res = await fetch(`/api/snippets/${snippetId}/usage`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        setRequestError(await failureMessage(res));
        return;
      }
      onSaved(null);
    } catch {
      setRequestError("Network error. Check your connection and try again.");
    } finally {
      setStatus("idle");
    }
  };

  const fieldId = (name: string) => `${baseId}-${name}`;
  const errorId = (name: string) => `${baseId}-${name}-error`;
  const describedBy = (name: string, hintId?: string) =>
    [hintId, errors[name] ? errorId(name) : null].filter(Boolean).join(" ") || undefined;

  const textareaClass =
    "w-full min-h-[96px] rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 aria-[invalid=true]:border-rose-500";

  const example = (kind: "input" | "output") => {
    const label = kind === "input" ? "Input example" : "Output example";
    const errorKey = kind === "input" ? "inputExample" : "outputExample";
    const langField = kind === "input" ? "inputLanguage" : "outputLanguage";
    const codeField = kind === "input" ? "inputCode" : "outputCode";
    return (
      <fieldset className="space-y-2 rounded-lg border border-slate-800 p-3">
        <legend className="px-1 text-sm font-medium text-white">{label}</legend>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <label htmlFor={fieldId(langField)} className="text-xs text-slate-400 sm:w-20">
            Language
          </label>
          <input
            id={fieldId(langField)}
            value={draft[langField]}
            onChange={set(langField)}
            maxLength={20}
            disabled={busy}
            placeholder="json"
            className="w-full rounded-md border border-slate-700 bg-slate-950/80 px-2 py-1 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 sm:w-40"
          />
        </div>
        <label htmlFor={fieldId(codeField)} className="sr-only">
          {label} code
        </label>
        <textarea
          id={fieldId(codeField)}
          value={draft[codeField]}
          onChange={set(codeField)}
          maxLength={MAX_EXAMPLE_LENGTH}
          disabled={busy}
          spellCheck={false}
          placeholder={kind === "input" ? '{\n  "name": "John Doe"\n}' : '{\n  "success": true\n}'}
          aria-invalid={!!errors[errorKey]}
          aria-describedby={describedBy(errorKey)}
          className={textareaClass}
        />
        {errors[errorKey] && (
          <p id={errorId(errorKey)} className="text-xs text-rose-400">
            {errors[errorKey]}
          </p>
        )}
      </fieldset>
    );
  };

  return (
    <form onSubmit={save} className="space-y-4" aria-label="Edit usage instructions" noValidate>
      <div role="tablist" aria-label="Editor mode" className="flex gap-1">
        {(["write", "preview"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            id={`${baseId}-tab-${mode}`}
            aria-selected={tab === mode}
            aria-controls={`${baseId}-panel-${mode}`}
            onClick={() => setTab(mode)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              tab === mode ? "bg-purple-600/40 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {mode === "write" ? <PencilLine className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {mode === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      {tab === "write" ? (
        <div id={`${baseId}-panel-write`} role="tabpanel" aria-labelledby={`${baseId}-tab-write`} className="space-y-4">
          <p className="text-xs text-slate-400">
            Markdown supported: <code className="font-mono"># headings</code>, <code className="font-mono">- lists</code>,{" "}
            <code className="font-mono">1. steps</code>, <code className="font-mono">```code```</code>,{" "}
            <code className="font-mono">**bold**</code>, <code className="font-mono">[links](https://…)</code>.
          </p>
          {PROSE_SECTIONS.map(({ key, label, hint }) => (
            <div key={key} className="space-y-1.5">
              <label htmlFor={fieldId(key)} className="block text-sm font-medium text-white">
                {label}
              </label>
              <p id={`${fieldId(key)}-hint`} className="text-xs text-slate-400">
                {hint}
              </p>
              <textarea
                id={fieldId(key)}
                value={draft[key]}
                onChange={set(key)}
                maxLength={MAX_SECTION_LENGTH}
                disabled={busy}
                placeholder={PLACEHOLDERS[key]}
                aria-invalid={!!errors[key]}
                aria-describedby={describedBy(key, `${fieldId(key)}-hint`)}
                className={textareaClass}
              />
              {errors[key] && (
                <p id={errorId(key)} className="text-xs text-rose-400">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            {example("input")}
            {example("output")}
          </div>
        </div>
      ) : (
        <div id={`${baseId}-panel-preview`} role="tabpanel" aria-labelledby={`${baseId}-tab-preview`}>
          {isUsageInstructionsEmpty(previewValue) ? (
            <p className="text-sm text-slate-400">Nothing to preview yet.</p>
          ) : (
            <UsageInstructionsView usage={previewValue} headingLevel={4} />
          )}
        </div>
      )}

      {errors.form && (
        <p role="alert" className="text-sm text-rose-400">
          {errors.form}
        </p>
      )}
      {requestError && (
        <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {requestError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {initial && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={busy}
              className="w-full border-rose-500/40 text-rose-300 hover:bg-rose-500/10 sm:w-auto"
            >
              {status === "deleting" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />}
              {status === "deleting" ? "Deleting…" : "Delete instructions"}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} className="w-full text-slate-300 sm:w-auto">
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={busy} aria-busy={status === "saving"} className="w-full bg-purple-600 text-white hover:bg-purple-500 sm:w-auto">
            {status === "saving" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-4 w-4" aria-hidden />}
            {status === "saving" ? "Saving…" : "Save instructions"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default UsageInstructionsEditor;
