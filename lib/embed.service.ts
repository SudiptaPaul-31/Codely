import { EmbedConfig, sanitizeEmbedConfig, validateEmbedConfig } from "./embed.validator";

export interface SnippetForEmbeed {
  id: string;
  title?: string | null;
  language?: string | null;
  visibility?: string | null;
  ownerAddress?: string | null;
  updatedAt?: Date | string | null;
  dependencies?: string[] | null;
}

export interface EmbedGenerationResult {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  embedCode?: string;
  embedUrl?: string;
}

const PUBLIC_VISIBILITY = "public";

/**
 * Determine whether a snippet is eligible for embedding.
 * Only publicly accessible snippets may be embedded.
 */
export function isEmbeddable(snippet: SnippetForEmbeed | null | undefined): boolean {
  if (!snippet) return false;
  return (snippet.visibility || "").toLowerCase() === PUBLIC_VISIBILITY;
}

/**
 * Build the canonical embed URL for a snippet.
 */
export function buildEmbedUrl(
  snippetId: string,
  config: EmbedConfig,
  baseUrl: string,
): string {
  const safeBase = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("theme", config.theme);
  params.set("title", String(config.showTitle));
  params.set("author", String(config.showAuthor));
  params.set("language", String(config.showLanguage));
  params.set("lineNumbers", String(config.showLineNumbers));
  params.set("copyButton", String(config.showCopyButton));
  params.set("dependencies", String(config.showDependencies));
  params.set("lastUpdated", String(config.showLastUpdated));
  params.set("wrap", String(config.wrapCode));
  return `${safeBase}/embed/snippets/${encodeURIComponent(snippetId)}?${params.toString()}`;
}

/**
 * Escape a value for safe inclusion in an HTML attribute.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate the iframe embed code for a snippet.
 * Returns a structured result with validation and access errors.
 */
export function generateEmbedCode(
  snippet: SnippetForEmbed | null | undefined,
  rawConfig: unknown,
  baseUrl: string,
): EmbedGenerationResult {
  if (!snippet) {
    return { success: false, error: "Snippet not found." };
  }

  if (!isEmbeddable(snippet)) {
    return {
      success: false,
      error: "Embed code can only be generated for public snippets.",
    };
  }

  const validation = validateEmbedConfig(rawConfig);
  if (!validation.valid || !validation.config) {
    return {
      success: false,
      error: "Invalid embed configuration.",
      errors: validation.errors,
    };
  }

  const config = sanitizeEmbedConfig(validation.config);
  const embedUrl = buildEmbedUrl(snippet.id, config, baseUrl);

  const width =
    config.widthMode === "fixed" && config.fixedWidth
      ? String(config.fixedWidth)
      : "100%";
  const height =
    config.heightMode === "custom" && config.customHeight
      ? String(config.customHeight)
      : "500";

  const title = snippet.title
    ? `Embedded Snippet: ${snippet.title}`
    : "Embedded Code Snippet";

  const embedCode = `<iframe
  src="${escapeHtmlAttribute(embedUrl)}"
  width="${escapeHtmlAttribute(width)}"
  height="${escapeHtmlAttribute(height)}"
  frameborder="0"
  loading="lazy"
  title="${escapeHtmlAttribute(title)}"
  style="border:1px solid rgba(127,127,127,0.2);border-radius:8px;max-width:100%;"
  allow="clipboard-write"
></iframe>`;

  return { success: true, embedCode: embedCode, embedUrl: embedUrl };
}

/**
 * Resolve the public base URL for embeds from environment variables.
 */
export function resolveBaseUrl(fallback?: string): string {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    fallback ||
    "";
  return candidate.replace(/\/+$/, "");
}
