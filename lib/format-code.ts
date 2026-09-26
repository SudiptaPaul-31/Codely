import { PLAIN_TEXT_LANGUAGE } from "./languages";

/**
 * Language-aware snippet formatting.
 *
 * - JavaScript / TypeScript / HTML / CSS / JSON / Markdown → Prettier (AST
 *   based, so behavior is preserved by construction).
 * - Python → a conservative, Black-inspired whitespace formatter that only
 *   touches code outside string literals (the app has no Python runtime).
 * - Other common languages → a conservative whitespace cleanup (line endings,
 *   trailing whitespace outside multi-line literals, blank-line runs).
 * - Plain text / unknown languages → never formatted.
 *
 * Formatting is asynchronous so the Prettier bundle is loaded lazily and the
 * editor stays responsive; `MAX_FORMAT_LENGTH` keeps huge snippets from
 * blocking the main thread.
 */

export type FormatterId = "prettier" | "python" | "whitespace" | "none";

export interface FormatResult {
  ok: boolean;
  /** Formatted code, or the original code when `ok === false`. */
  code: string;
  changed: boolean;
  formatter: FormatterId;
  language: string;
  error?: string;
}

export const MAX_FORMAT_LENGTH = 100_000;

const PRETTIER_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "html",
  "css",
  "json",
  "markdown",
]);

const WHITESPACE_LANGUAGES = new Set([
  "java",
  "csharp",
  "cpp",
  "go",
  "rust",
  "php",
  "ruby",
  "sql",
  "bash",
]);

const PRETTIER_PARSERS: Record<string, string> = {
  javascript: "babel",
  typescript: "typescript",
  html: "html",
  css: "css",
  json: "json",
  markdown: "markdown",
};

export const FORMATTER_LABELS: Record<FormatterId, string> = {
  prettier: "Prettier",
  python: "Python formatter",
  whitespace: "whitespace cleanup",
  none: "no formatter",
};

export function getFormatterId(language: string): FormatterId {
  const lang = (language || "").toLowerCase().trim();
  if (!lang || lang === PLAIN_TEXT_LANGUAGE || lang === "text" || lang === "plain") {
    return "none";
  }
  if (PRETTIER_LANGUAGES.has(lang)) return "prettier";
  if (lang === "python") return "python";
  if (WHITESPACE_LANGUAGES.has(lang)) return "whitespace";
  return "none";
}

export function isFormattingAvailable(language: string): boolean {
  return getFormatterId(language) !== "none";
}

/* -------------------------------------------------------------------------- */
/* Prettier                                                                    */
/* -------------------------------------------------------------------------- */

let prettierCache: Promise<{ prettier: any; plugins: any[] }> | null = null;

async function loadPrettier(): Promise<{ prettier: any; plugins: any[] }> {
  if (!prettierCache) {
    prettierCache = (async () => {
      const [standalone, babel, estree, typescript, html, postcss, markdown] =
        await Promise.all([
          import("prettier/standalone"),
          import("prettier/plugins/babel"),
          import("prettier/plugins/estree"),
          import("prettier/plugins/typescript"),
          import("prettier/plugins/html"),
          import("prettier/plugins/postcss"),
          import("prettier/plugins/markdown"),
        ]);
      const unwrap = (mod: any) => mod?.default ?? mod;
      return {
        prettier: unwrap(standalone),
        plugins: [
          unwrap(babel),
          unwrap(estree),
          unwrap(typescript),
          unwrap(html),
          unwrap(postcss),
          unwrap(markdown),
        ],
      };
    })();
    prettierCache.catch(() => {
      prettierCache = null;
    });
  }
  return prettierCache;
}

async function formatWithPrettier(code: string, language: string): Promise<string> {
  const { prettier, plugins } = await loadPrettier();
  const parser = PRETTIER_PARSERS[language];
  return prettier.format(code, { parser, plugins });
}

/* -------------------------------------------------------------------------- */
/* Python (conservative, Black-inspired)                                       */
/* -------------------------------------------------------------------------- */

type TripleQuoteState = "'" | '"' | null;

function findTripleClose(text: string, quote: string): number {
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote && text[i + 1] === quote && text[i + 2] === quote) {
      return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Advance the triple-quote scanner over a single line of Python.
 * Returns the state (inside `'''`, inside `"""`, or outside) at line end.
 */
function advancePythonState(line: string, state: TripleQuoteState): TripleQuoteState {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (state) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === state && line[i + 1] === state && line[i + 2] === state) {
        i += 3;
        state = null;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "#") break; // comment: rest of line is not code
    if (ch === "'" || ch === '"') {
      if (line[i + 1] === ch && line[i + 2] === ch) {
        const close = findTripleClose(line.slice(i + 3), ch);
        if (close === -1) {
          state = ch;
          break;
        }
        i += 3 + close + 3;
        continue;
      }
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === ch) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return state;
}

/**
 * Format Python code conservatively. Only performs transformations that
 * cannot change program behavior:
 *
 * - normalizes CRLF/CR line endings,
 * - expands leading tabs to 4 spaces outside string literals,
 * - strips trailing whitespace outside string literals,
 * - collapses runs of 3+ blank lines to 2 outside string literals,
 * - ensures exactly one trailing newline.
 *
 * Content inside triple-quoted strings is left byte-for-byte intact.
 */
export function formatPython(code: string): string {
  const normalized = code.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let inTriple: TripleQuoteState = null;
  let blankRun = 0;

  for (const rawLine of lines) {
    const stateAtStart = inTriple;
    let line = rawLine;
    if (!stateAtStart) {
      // Leading indentation is code on this line: safe to expand tabs.
      line = line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));
    }
    inTriple = advancePythonState(line, stateAtStart);
    // Trailing whitespace is only safe to strip when the line both starts
    // and ends outside a string (it may belong to a literal otherwise).
    if (!stateAtStart && !inTriple) {
      line = line.replace(/[ \t]+$/, "");
    }

    const isBlank = line.trim() === "";
    if (isBlank && !stateAtStart) {
      blankRun += 1;
      if (blankRun <= 2) out.push("");
    } else {
      blankRun = 0;
      out.push(line);
    }
  }

  const text = out.join("\n").replace(/\n+$/, "");
  return text + "\n";
}

/* -------------------------------------------------------------------------- */
/* Conservative whitespace cleanup (other languages)                           */
/* -------------------------------------------------------------------------- */

/**
 * Snippets containing multi-line literals (heredocs, raw strings) only get
 * line-ending normalization — collapsing or trimming inside those literals
 * would change behavior.
 */
function hasMultilineLiteral(code: string): boolean {
  return (
    code.includes("`") ||
    // bash/php/ruby heredoc introducers, e.g. `cat << EOF` or `<<< EOT`
    /<<<?[-~]?\s*['"]?[A-Za-z_]\w*['"]?\s*$/m.test(code) ||
    /[rR]"#*\(/.test(code)
  );
}

export function normalizeWhitespace(code: string): string {
  const normalized = code.replace(/\r\n?/g, "\n");
  if (hasMultilineLiteral(normalized)) return normalized;

  const lines = normalized.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankRun += 1;
      if (blankRun <= 2) out.push("");
    } else {
      blankRun = 0;
      out.push(line);
    }
  }
  const text = out.join("\n").replace(/\n+$/, "");
  return text ? text + "\n" : "";
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function formatCode(code: string, language: string): Promise<FormatResult> {
  const lang = (language || "").toLowerCase().trim();
  const formatter = getFormatterId(lang);
  const base = { formatter, language: lang || PLAIN_TEXT_LANGUAGE };

  if (typeof code !== "string" || code.length === 0) {
    return { ok: true, code: code ?? "", changed: false, ...base };
  }
  if (formatter === "none") {
    return { ok: true, code, changed: false, ...base };
  }
  if (code.length > MAX_FORMAT_LENGTH) {
    return {
      ok: false,
      code,
      changed: false,
      ...base,
      error: `Snippet is too large to format automatically (limit ${MAX_FORMAT_LENGTH.toLocaleString()} characters).`,
    };
  }

  try {
    let formatted: string;
    switch (formatter) {
      case "prettier":
        formatted = await formatWithPrettier(code, lang);
        break;
      case "python":
        formatted = formatPython(code);
        break;
      case "whitespace":
        formatted = normalizeWhitespace(code);
        break;
      default:
        return { ok: true, code, changed: false, ...base };
    }
    return { ok: true, code: formatted, changed: formatted !== code, ...base };
  } catch (error) {
    return {
      ok: false,
      code,
      changed: false,
      ...base,
      error: error instanceof Error ? error.message.split("\n")[0] : "Formatting failed.",
    };
  }
}
