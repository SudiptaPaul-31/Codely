import { z } from "zod";

/**
 * Usage instructions: author-written documentation attached to a snippet.
 *
 * Stored as one JSONB value in `snippets.usage_instructions` (see
 * scripts/migrations/005_add_snippet_usage_instructions.sql). Prose sections
 * are Markdown *text*: it is never stored or rendered as HTML, so it cannot
 * carry script. Rendering goes through `lib/safe-markdown.tsx`, which builds
 * React elements and only produces links with http(s)/mailto URLs.
 *
 * Input and output examples are separate code blocks with their own language,
 * so they always render apart from each other and from the prose. They are
 * displayed as text and never executed.
 */

/** Longest Markdown section an author may write. */
export const MAX_SECTION_LENGTH = 5000;
/** Longest input or output example. */
export const MAX_EXAMPLE_LENGTH = 5000;

/** Prose sections, in display order. */
export const PROSE_SECTIONS = [
  { key: "overview", label: "Overview", hint: "What the snippet does, intended use cases, supported environments." },
  { key: "prerequisites", label: "Prerequisites", hint: "Required libraries, dependencies, runtime and environment configuration." },
  { key: "setup", label: "Setup Instructions", hint: "Installation steps, configuration steps and the usage workflow." },
  { key: "notes", label: "Notes", hint: "Limitations, known issues, performance and compatibility." },
] as const;

export type ProseSectionKey = (typeof PROSE_SECTIONS)[number]["key"];

/** A language label for an example block, e.g. `json`, `bash`, `c++`. */
const exampleLanguageSchema = z
  .string()
  .trim()
  .max(20, "Example language must be under 20 characters")
  .regex(/^[A-Za-z0-9+#._-]*$/, "Example language may only contain letters, digits and + # . _ -")
  .transform((value) => value.toLowerCase());

/** NUL and other non-printing control characters, except tab, LF and CR. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) return true;
  }
  return false;
}

const sectionSchema = z
  .string()
  .max(MAX_SECTION_LENGTH, `Each section must be under ${MAX_SECTION_LENGTH} characters`)
  .refine((value) => !hasControlChars(value), "Remove unsupported control characters")
  .transform((value) => value.replace(/\r\n?/g, "\n").replace(/\s+$/, ""));

const exampleSchema = z
  .object({
    language: exampleLanguageSchema.default(""),
    code: z
      .string()
      .max(MAX_EXAMPLE_LENGTH, `Examples must be under ${MAX_EXAMPLE_LENGTH} characters`)
      .refine((value) => !hasControlChars(value), "Remove unsupported control characters")
      .transform((value) => value.replace(/\r\n?/g, "\n").replace(/\s+$/, "")),
  })
  .strict();

/** What an author submits. Every section is optional; at least one is required. */
export const usageInstructionsInputSchema = z
  .object({
    overview: sectionSchema.optional(),
    prerequisites: sectionSchema.optional(),
    setup: sectionSchema.optional(),
    notes: sectionSchema.optional(),
    inputExample: exampleSchema.optional(),
    outputExample: exampleSchema.optional(),
  })
  .strict()
  .transform(normalizeUsageInstructions)
  .refine((value) => !isUsageInstructionsEmpty(value), {
    message: "Add at least one section. To remove all usage instructions, delete them instead.",
  });

export type UsageInstructionsInput = z.input<typeof usageInstructionsInputSchema>;

export interface UsageExample {
  language: string;
  code: string;
}

/** What is stored and returned. Empty sections are omitted. */
export interface UsageInstructions {
  overview?: string;
  prerequisites?: string;
  setup?: string;
  notes?: string;
  inputExample?: UsageExample;
  outputExample?: UsageExample;
  updatedAt?: string;
  updatedBy?: string;
}

/** Drop blank sections and examples so storage and rendering agree on "empty". */
export function normalizeUsageInstructions(value: Partial<UsageInstructions>): UsageInstructions {
  const out: UsageInstructions = {};
  for (const { key } of PROSE_SECTIONS) {
    const text = value[key];
    if (typeof text === "string" && text.trim()) out[key] = text;
  }
  for (const key of ["inputExample", "outputExample"] as const) {
    const example = value[key];
    if (example && typeof example.code === "string" && example.code.trim()) {
      out[key] = { language: example.language || "", code: example.code };
    }
  }
  return out;
}

export function isUsageInstructionsEmpty(value: UsageInstructions | null | undefined): boolean {
  if (!value) return true;
  return (
    PROSE_SECTIONS.every(({ key }) => !value[key]?.trim()) &&
    !value.inputExample?.code?.trim() &&
    !value.outputExample?.code?.trim()
  );
}

/**
 * Read a stored value defensively: a malformed or legacy row renders as "no
 * instructions" rather than crashing the details panel.
 */
export function parseStoredUsageInstructions(raw: unknown): UsageInstructions | null {
  if (raw == null) return null;
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const asExample = (v: unknown): UsageExample | undefined =>
    v && typeof v === "object" && typeof (v as UsageExample).code === "string"
      ? { language: String((v as UsageExample).language ?? ""), code: (v as UsageExample).code }
      : undefined;
  const normalized = normalizeUsageInstructions({
    overview: typeof record.overview === "string" ? record.overview : undefined,
    prerequisites: typeof record.prerequisites === "string" ? record.prerequisites : undefined,
    setup: typeof record.setup === "string" ? record.setup : undefined,
    notes: typeof record.notes === "string" ? record.notes : undefined,
    inputExample: asExample(record.inputExample),
    outputExample: asExample(record.outputExample),
  });
  if (isUsageInstructionsEmpty(normalized)) return null;
  if (typeof record.updatedAt === "string") normalized.updatedAt = record.updatedAt;
  if (typeof record.updatedBy === "string") normalized.updatedBy = record.updatedBy;
  return normalized;
}

/** Field-level validation messages, keyed by section, for the editor. */
export function usageValidationErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
