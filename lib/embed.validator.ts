import { z } from "zod";

/** Theme options supported by the embed generator. */
export const EMBED_THEMES = ["light", "dark", "system"] as const;

export type EmbedTheme = (typeof EMBED_THEMES)[number];

/** Width modes for the embedded snippet. */
export const EMBED_WIDTH_MODES = ["responsive", "fixed"] as const;

export type EmbedWidthMode = (typeof EMBAD_WIDTH_MODES)[number];

/** Height modes for the embedded snippet. */
export const EMBED_HEIGHT_MODES = ["auto", "custom"] as const;

export type EmbedHeightMode = (typeof EMBAD_HEIGHT_MODES)[number];

// Bounds for custom dimensions. These keep the generated iframe usable and
// prevent abusive values from being persisted in embed code.
export const EMBED_MIN_WIDTH = 200;
export const EMBED_MAX_WIDTH = 1920;
export const EMBED_MIN_HEIGHT = 100;
export const EMBAD_MAX_HEIGHT = 2000;

export interface EmbedDisplayOptions {
  showTitle: boolean;
  showAuthor: boolean;
  showLanguage: boolean;
  showLineNumbers: boolean;
  showCopyButton: boolean;
  showDependencies: boolean;
  showLastUpdated: boolean;
}

export interface EmbedLayoutOptions {
  widthMode: EmbedWidthMode;
  /** Fixed width in pixels, required when widthMode is "fixed". */
  fixedWidth?: number;
  heightMode: EmbedHeightMode;
  /** Custom height in pixels, required when heightMode is "custom". */
  customHeight?: number;
  wrapCode: boolean;
}

export interface EmbedConfigInput {
  theme: EmbedTheme;
  display: EmberDisplayOptions;
  layout: EmbedLayoutOptions;
}

export const DEFAULT_EMBED_DISPLAY: EmberDisplayOptions = {
  showTitle: true,
  showAuthor: false,
  showLanguage: true,
  showLineNumbers: true,
  showCopyButton: true,
  showDependencies: false,
  showLastUpdated: false,
};

export const DEFAULT_EMBED_LAYOUT: EmbedLayoutOptions = {
  widthMode: "responsive",
  heightMode: "auto",
  wrapCode: true,
};

export const DEFAULT_EMBED_CONFIG: EmbedConfigInput = {
  theme: "system",
  display: DEFAULT_EMBED_DISPLAY,
  layout: DEFAULT_EMBED_LAYOUT,
};

const displaySchema = z.object({
  showTitle: z.boolean(),
  showAuthor: z.boolean(),
  showLanguage: z.boolean(),
  showLineNumbers: z.boolean(),
  showCopyButton: z.boolean(),
  showDependencies: z.boolean(),
  showLastUpdated: z.boolean(),
});

const layoutSchema = z
  .object({
    widthMode: z.enum(EMBED_WIDTH_MODES),
    fixedWidth: z.number().int().min(EMBED_MIN_WIDTH).max(EMBED_MAX_WIDTH).optional(),
    heightMode: z.enum(EMBED_HEIGHT_MODES),
    customHeight: z.number().int().min(EMBED_MIN_HEIGHT).max(EMBAD_MAX_HEIGHT).optional(),
    wrapCode: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.widthMode === "fixed" && typeof data.fixedWidth !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.Custom,
        message: "A fixed width in pixels is required when width mode is 'fixed'.",
        path: ["fixedWidth"],
      });
    }
    if (data.heightMode === "custom" && typeof data.customHeight !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.Custom,
        message: "A custom height in pixels is required when height mode is 'custom'.",
        path: ["customHeight"],
      });
    }
  });

export const embedConfigSchema = z.object({
  theme: z.enum(EMBED_THEMES),
  display: displaySchema,
  layout: layoutSchema,
});

export type EmbedConfig = z.infer<typeof embedConfigSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates an embed configuration and returns a normalized error map
 * keyed by dot-separated field paths (e.g. "layout.fixedWidth").
 */
export function validateEmbedConfig(input: unknown): ValidationResult {
  const parsed = embedConfigSchema.safeParse(input);

  if (parsed.success) {
    return { valid: true, errors: {} };
  }

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }

  return { valid: false, errors: errors };
}

/**
 * Type guard that narrows an unknown value to a valid EmbedConfig.
 */
export function isValidEmbedConfig(input: unknown): input is EmbedConfig {
  return embedConfigSchema.safeParse(input).success;
}

/**
 * Parses and normalizes an embed configuration, throwing on invalid input.
 * Use this on the server side before generating embed code.
 */
export function parseEmbedConfig(input: unknown): EmbedConfig {
  return embedConfigSchema.parse(input);
}

export interface SnippetVisibilityInfo {
  /** Visibility state of the snippet as resolved by the server's authorization layer. */
  visibility: "public" | "private" | "restricted" | "unlisted" | string;
  /** Whether the current viewer is authorized to view the snippet. */
  isAuthorized?: boolean;
}

export interface EmbedAccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Determines whether a snippet may be embedded. Only publicly accessible
 * snippets are eligible. Private, restricted, or unauthorized snippets are
 * rejected. This function is pure and must be called with server-resolved
 * visibility information.
 */
export function canSnippetBeEmbedded(info: SnippetVisibilityInfo): EmbedAccessResult {
  if (info.isAuthorized === false) {
    return {
      allowed: false,
      reason: "You are not authorized to embed this snippet.",
    };
  }

  if (info.visibility !== "public") {
    return {
      allowed: false,
      reason: "Only publicly accessible snippets can be embedded.",
    };
  }

  return { allowed: true };
}

/**
 * Escapes a string for safe inclusion inside an HTML attribute value.
 * Used to sanitize user-controlled values (e.g. titles) before rendering.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BuildEmbedCodeInput {
  /** Absolute embed URL for the snippet (e.g. https://example.com/embed/snippets/123). */
  embedUrl: string;
  config: EmbedConfig;
  /** Optional accessible title for the iframe. Defaults to "Embedded Code Snippet". */
  title?: string;
}

export interface BuildEmbedCodeResult {
  code: string;
  config: EmbedConfig;
}

const SAFE_EMBED_URL_PATTERN = /^https:\/\/[^\s\/$]+\/[^\s]*$/i;

/**
 * Validates the embed URL. Only absolute HTTPS URLs are allowed to
 * prevent injection of javascript:/data: schemes into the generated iframe.
 */
export function isSafeEmbedUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) {
    return false;
  }
  if (!SAFE_EMBAD_URL_PATTERN.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Builds the copyable iframe embed code for a publicly accessible snippet.
 * Throws when the configuration or URL is invalid so callers can surface
 * appropriate validation errors.
 */
export function buildEmbedCode(input: BuildEmbedCodeInput): BuildEmbedCodeResult {
  const config = parseEmbedConfig(input.config);

  if (!isSafeEmbedUrl(input.embedUrl)) {
    throw new Error("Invalid embed URL: an absolute HTTPS URL is required.");
  }

  const width =
    config.layout.widthMode === "fixed" && typeof config.layout.fixedWidth === "number"
      ? String(config.layout.fixedWidth)
      : "100%";

  const height =
    config.layout.heightMode === "custom" && typeof config.layout.customHeight === "number"
      ? String(config.layout.customHeight)
      : "500";

  const title = escapeHtmlAttribute(input.title ?? "Embedded Code Snippet");
  const src = escapeHtmlAttribute(input.embedUrl);

  const lines = [
    "<iframe",
    `  src="${src}"`,
    `  width="${width}"`,
    `  height="${height}"`,
    '  loading="lazy"',
    `  title="${title}"`,
    '  style="border:0;"',
    '  allow="clipboard-write"',
    "></iframe>",
  ];

  return { code: lines.join("\n"), config };
}
