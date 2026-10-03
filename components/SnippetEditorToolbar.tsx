"use client";

import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatConfidence, type DetectionResult } from "@/lib/language-detection";
import { getLanguageLabel } from "@/lib/languages";
import type { FormatStatus } from "@/hooks/useSnippetFormatting";

export interface SnippetEditorToolbarProps {
  language: string;
  suggestion: DetectionResult | null;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
  autoFormat: boolean;
  onAutoFormatChange: (enabled: boolean) => void;
  onFormat: () => void;
  formatting: boolean;
  formatStatus: FormatStatus | null;
}

const STATUS_COLORS: Record<FormatStatus["type"], string> = {
  success: "text-emerald-400",
  info: "text-sky-300",
  error: "text-red-400",
};

export default function SnippetEditorToolbar({
  language,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  autoFormat,
  onAutoFormatChange,
  onFormat,
  formatting,
  formatStatus,
}: SnippetEditorToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-purple-500/20 bg-slate-800/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Language
          </span>
          <span
            data-testid="language-indicator"
            className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-200"
          >
            {getLanguageLabel(language)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <label
            htmlFor="auto-format-toggle"
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-300"
          >
            Auto-format
            <Switch
              id="auto-format-toggle"
              checked={autoFormat}
              onCheckedChange={onAutoFormatChange}
              aria-label="Toggle auto-format"
              data-testid="auto-format-toggle"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onFormat}
            disabled={formatting}
            data-testid="format-code-button"
            className="border-purple-400/50 text-white hover:bg-purple-500/20"
          >
            <Wand2 className="mr-1.5 h-4 w-4" />
            Format Code
          </Button>
        </div>
      </div>

      {suggestion && (
        <div
          role="status"
          data-testid="language-suggestion"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          <span>
            Detected <strong>{getLanguageLabel(suggestion.language)}</strong>{" "}
            <span className="text-amber-300/80">
              ({formatConfidence(suggestion.confidence)})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onAcceptSuggestion}
              data-testid="accept-suggestion"
              className="h-7 bg-amber-500 px-2 text-xs font-medium text-white hover:bg-amber-600"
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismissSuggestion}
              data-testid="dismiss-suggestion"
              className="h-7 px-2 text-xs text-amber-200 hover:bg-amber-500/20"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {formatStatus && (
        <p
          role="status"
          data-testid="format-status"
          className={cn("text-xs", STATUS_COLORS[formatStatus.type])}
        >
          {formatStatus.message}
        </p>
      )}
    </div>
  );
}
