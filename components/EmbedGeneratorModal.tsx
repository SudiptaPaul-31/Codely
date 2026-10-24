"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EMBED_CONFIG,
  EmbedConfig,
  EmbedTheme,
  validateEmbedConfig,
} from "@/lib/embed.validator";
import { generateEmbedCode, resolveBaseUrl } from "@/lib/embed.service";

export interface EmbedGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  snippetId: string;
  snippetTitle?: string | null;
  snippetLanguage?: string | null;
  snippetCode?: string;
  snippetAuthor?: string | null;
  snippetDependencies?: string[] | null;
  snippetUpdatedAt?: string | null;
  visibility?: string | null;
  baseUrl?: string;
  onCopied?: () => void;
}

type Notification = { type: "success" | "error"; message: string } | null;

function toggleClass(active: boolean): string {
  return active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
}

export default function EmbedGeneratorModal({
  open,
  onClose,
  snippetId,
  snippetTitle,
  snippetLanguage,
  snippetCode = "",
  snippetAuthor,
  snippetDependencies,
  snippetUpdatedAt,
  visibility,
  baseUrl,
  onCopied,
}: EmbedGeneratorModalProps) {
  const [config, setConfig] = useState<EmbedConfig>(DEFAULT_EMBED_CONFIG);
  const [notification, setNotification] = useState<Notification>(null);
  const [generating, setGenerating] = useState(false);
  const [copying, setCopying] = useState(false);

  const isPublic = (visibility || "").toLowerCase() === "public";
  const resolvedBaseUrl = useMemo(() => resolveBaseUrl(baseUrl), [baseUrl]);

  const validation = useMemo(() => validateEmbedConfig(config), [config]);

  const generation = useMemo(() => {
    if (!isPublic) return null;
    return generateEmbedCode(
      {
        id: snippetId,
        title: snippetTitle,
        language: snippetLanguage,
        visibility,
        ownerAddress: snippetAuthor,
        updatedAt: snippetUpdatedAt,
        dependencies: snippetDependencies,
      },
      config,
      resolvedBaseUrl,
    );
  }, [config, isPublic, resolvedBaseUrl, snippetId, snippetTitle, snippetLanguage, snippetAuthor, snippetUpdatedAt, snippetDependencies, visibility]);

  useEffect(() => {
    if (!open) {
      setNotification(null);
    }
  }, [open]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const updateConfig = useCallback(<V extends keyof EmbedConfig>(key: V, value: EmbedConfig[V]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCopy = useCallback(async () => {
    if (!generation?.success || !generation.embedCode) {
      setNotification({ type: "error", message: "Embed code is not available to copy." });
      return;
    }
    setCopying(true);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(generation.embedCode);
      } else {
        throw new Error("Clipboard API is not available.");
      }
      setNotification({ type: "success", message: "Embed code copied to clipboard." });
      onCopied?.();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to copy embed code.",
      });
    } finally {
      setCopying(false);
    }
  }, [generation, onCopied]);

  const handleRegenerate = useCallback(() => {
    setGenerating(true);
    try {
      if (!isPublic) {
        setNotification({ type: "error", message: "Private snippets cannot be embedded." });
        return;
      }
      if (!validation.valid) {
        setNotification({ type: "error", message: "Please fix the configuration errors before generating." });
        return;
      }
      if (generation?.success) {
        setNotification({ type: "success", message: "Embed code generated." });
      } else {
        setNotification({ type: "error", message: generation?.error || "Failed to generate embed code." });
      }
    } finally {
      setGenerating(false);
    }
  }, [generation, isPublic, validation.valid]);

  if (!open) return null;

  const previewLines = snippetCode.split("\n");
  const isDark = config.theme === "dark";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelled="embed-generator-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-w-3xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 id="embed-generator-title" className="text-lg font-semibold">
            Embed Snippet
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close embed generator"
            className="rounded full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!isPublic ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
              role="alert"
            >
              <strong>Embedding unavailable.</strong> This snippet is not public.
              Only public snippets can be embedded.
            </div>
          ) : (
            <div className="space-6">
              <section aria-labelled="display-settings">
                <h3 className="mb-2 text-sm font-semibold">Display Settings</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Theme</span>
                    <select
                      value={config.theme}
                      onChange={(e) => updateConfig("theme", e.target.value as EmbedTheme)}
                      className="rounded border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["showTitle", "Show Title"],
                      ["showAuthor", "Show Author"],
                      ["showLanguage", "Show Language"],
                      ["showLineNumbers", "Show Line Numbers"],
                      ["showCopyButton", "Show Copy Button"],
                      ["showDependencies", "Show Dependencies"],
                      ["showLastUpdated", "Show Last Updated"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(config[key as keyof EmbedConfig])}
                        onChange={(e) => updateConfig(key as keyof EmbedConfig, e.target.checked as any)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </section>

              <section aria-labelled="layout-settings">
                <h3 className="mb-2 text-sm font-semibold">Layout Settings</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Width</span>
                    <select
                      value={config.widthMode}
                      onChange={(e) =>
                        updateConfig("widthMode", e.target.value as EmbedConfig["widthMode"])
                      }
                      className="rounded border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="responsive">Responsive</option>
                      <option value="fixed">Fixed</option>
                    </select>
                    {config.widthMode === "fixed" && (
                      <input
                        type="number"
                        min={200}
                        max={1920}
                        value={config.fixedWidth ?? 600}
                        onChange={(e) => updateConfig("widthMode", "fixed") || updateConfig("fixedWidth", Number(e.target.value))}
                        className="rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800"
                        aria-label="Fixed width in pixels"
                      />
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Height</span>
                    <select
                      value={config.heightMode}
                      onChange={(e) =>
                        updateConfig("heightMode", e.target.value as EmbedConfig["heightMode"])
                      }
                      className="rounded border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="auto">Auto</option>
                      <option value="custom">Custom</option>
                    </select>
                    {config.heightMode === "custom" && (
                      <input
                        type="number"
                        min={100}
                        max={2000}
                        value={config.customHeight ?? 500}
                        onChange={(e) => updateConfig("customHeight", Number(e.target.value))}
                        className="rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800"
                        aria-label="Custom height in pixels"
                      />
                    )}
                  </label>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.wrapCode}
                    onChange={(e) => updateConfig("wrapCode", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Enable code wrapping
                </label>
              </section>

              <section aria-labelled="live-preview">
                <h3 className="mb-2 text-sm font-semibold">Live Preview</h3>
                <div
                  className={`rounded-lg border p-3 ${
                    isDark ? "border-gray-700 bg-gray-900 text-gray-100" : "border-gray-200 bg-gray-50 text-gray-900"
                  }`}
                  aria-live="polite"
                >
                  {config.showTitle && (
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span>{snippetTitle || "Untitled Snippet"}</span>
                      {config.showLanguage && snippetLanguage && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {snippetLanguage}
                        </span>
                      )}
                    </div>
                  )}
                  {config.showAuthor && snippetAuthor && (
                    <div className="mb-2 text-xs opacity-70">
                      By <span className="font-mono">{snippetAuthor.slice(0, 6)}&hellip;{snippetAuthor.slice(-6)}</span>
                    </div>
                  )}
                  <pre
                    className={`overflow-x-auto rounded bg-black/5 p-2 text-xs ${
                      config.wrapCode ? "whitespace-pre-wrap" : "whitespace-pre"
                    }`}
                  >
                    {previewLines.map((line, idx) => (
                      <div key={idx} className="flex gap-2">
                        {config.showLineNumbers && (
                          <span className="inline-block w-6 select-none text-right opacity-40">
                            {idx + 1}
                          </span>
                        )}
                        <span>{line || " "}</span>
                      </div>
                    ))}
                  </pre>
                  {config.showDependencies && snippetDependencies && snippetDependencies.length > 0 && (
                    <div className="mt-2 text-xs opacity-70">
                      Dependencies: {snippetDependencies.join(", ")}
                    </div>
                  )}
                  {config.showLastUpdated && snippetUpdatedAt && (
                    <div className="mt-2 text-xs opacity-60">
                      Last updated: {new Date(snippetUpdatedAt).toLocaleDateString()}
                    </div>
                  )}
                  {config.showCopyButton && (
                    <button
                      type="button"
                      className="mt-2 rounded bg-blue-600 px-2 py-1 text-xs text-white"
                      onClick={() => setNotification({ type: "success", message: "Preview copy action triggered." })}
                      aria-label="Preview copy button"
                    >
                      Copy
                    </button>
                  )}
                </div>
              </section>

              <section aria-labelled="generated-embed-code">
                <h3 className="mb-2 text-sm font-semibold">Generated Embed Code</h3>
                {!validation.valid && (
                  <div className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300" role="alert">
                    {Object.values(validation.errors).join(" ")}
                  </div>
                )}
                <textarea
                  readOnly
                  value={generation.usuccess ? generation.embedCode : ""}
                  className="h-32 w-full resize-none rounded-lg border border-gray-300 bg-gray-50 p-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-800"
                  aria-label="Generated embed code"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={generating}
                    className="rounded bg-gray-200 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {generating ? "Generating…" : "Regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!copying || !generation?.success}
                    className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {copying ? "Copying…" : "Copy Embed Code"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>

        {notification && (
          <div
            className={`border-t p-3 text-sm ${
              notification.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            }`}
            role="status"
            aria-live="polite"
          >
            {notification.message}
          </div>
        )}
      </div>
    </div>
  );
}
