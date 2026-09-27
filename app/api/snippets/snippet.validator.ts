import { z } from "zod";
import { StrKey } from "stellar-sdk";
import { LANGUAGES } from "@/lib/languages";

// ---------------------------------------------------------------------------
// Centralized validation layer for all snippet operations (create, update,
// import, share). Every snippet-related endpoint should reuse the schemas and
// helpers below so validation rules never diverge between routes.
// ---------------------------------------------------------------------------

/** Reuse the project's existing supported-language list. */
export const SUPPORTED_LANGUAGES = LANGUAGES as readonly string[];

/** The only visibility values the application accepts. */
export const VISIBILITY_VALUES = ["private", "public", "shared"] as const;
export type Visibility = (typeof VISIBILITY_VALUES)[number];

/** Upper bound on how large a single imported payload may be. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ITEMS = 100;

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

export const titleSchema = z
  .string({ required_error: "Title is required" })
  .trim()
  .min(3, "Title must be at least 3 characters")
  .max(100, "Title must be under 100 characters");

export const descriptionSchema = z
  .string({ required_error: "Description is required" })
  .trim()
  .min(1, "Description is required")
  .max(500, "Description must be under 500 characters");

export const codeSchema = z
  .string({ required_error: "Code is required" })
  .min(1, "Code is required")
  .max(10000, "Code is too large (maximum 10000 characters)")
  .refine((value) => value.trim().length > 0, {
    message: "Code must not be empty or whitespace-only",
  });

export const languageSchema = z.enum(SUPPORTED_LANGUAGES as [string, ...string[]], {
  errorMap: () => ({
    message: `Language must be one of the supported languages: ${SUPPORTED_LANGUAGES.join(", ")}`,
  }),
});

export const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Tags cannot be empty")
      .max(30, "Each tag must be under 30 characters"),
  )
  .max(20, "A snippet can have at most 20 tags");

/**
 * Stellar wallet address — format AND checksum are validated by the Stellar
 * SDK itself (StrKey). No custom cryptography is implemented here.
 */
export const walletAddressSchema = z
  .string({ required_error: "Owner wallet address is required" })
  .refine(
    (value) => StrKey.isValidEd25519PublicKey(value),
    "Invalid wallet address: must be a valid Stellar public key (format or checksum is incorrect)",
  );

export const visibilitySchema = z.enum(VISIBILITY_VALUES, {
  errorMap: () => ({
    message: "Visibility must be one of: private, public, shared",
  }),
});

export const licenseTypeSchema = z
  .string()
  .max(50, "License type must be under 50 characters")
  .optional();

// ---------------------------------------------------------------------------
// Operation schemas
// ---------------------------------------------------------------------------

export const createSnippetSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  code: codeSchema,
  language: languageSchema,
  tags: tagsSchema.min(1, "At least one tag is required"),
  ownerWalletAddress: walletAddressSchema,
  licenseType: licenseTypeSchema,
  visibility: visibilitySchema.default("private"),
  forkedFromId: z.string().uuid("Invalid origin snippet UUID").nullable().optional(),
  isFork: z.boolean().optional(),
  ownershipProof: z.object({
    snippetId: z.string().uuid(),
    hash: z.string().length(64),
    ownerWallet: z.string().min(1),
    signature: z.string().min(1),
    createdAt: z.string().datetime(),
  }).optional(),
});

export const updateSnippetSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  code: codeSchema.optional(),
  language: languageSchema.optional(),
  tags: tagsSchema.min(1, "At least one tag is required").optional(),
  licenseType: licenseTypeSchema,
  visibility: visibilitySchema.optional(),
  forkedFromId: z.string().uuid("Invalid origin snippet UUID").nullable().optional(),
  isFork: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided to update a snippet",
});

export const importSnippetSchema = createSnippetSchema.omit({
  ownerWalletAddress: true,
}).strict();

export const shareSnippetSchema = z.object({
  isReadOnly: z.boolean().optional(),
  expiresAt: z.string().optional().refine(
    (value) => value === undefined || !Number.isNaN(Date.parse(value)),
    "expiresAt must be a valid date string",
  ),
});

export const forkSnippetSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional(),
  code: z.string().min(1, "Code is required").optional(),
  language: z.string().min(1, "Language is required").optional(),
  tags: z.array(z.string()).optional(),
  licenseType: z.string().optional(),
  ownerWalletAddress: z.string().optional(),
});

export const duplicateSnippetSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  ownerWalletAddress: z.string().optional(),
});

export const forkDuplicateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
});

export type CreateSnippetDTO = z.infer<typeof createSnippetSchema>;
export type UpdateSnippetDTO = z.infer<typeof updateSnippetSchema>;
export type ImportSnippetDTO = z.infer<typeof importSnippetSchema>;
export type ShareSnippetDTO = z.infer<typeof shareSnippetSchema>;
export type ForkSnippetDTO = z.infer<typeof forkSnippetSchema>;
export type DuplicateSnippetDTO = z.infer<typeof duplicateSnippetSchema>;

export type ForkDuplicateDTO = z.infer<typeof forkDuplicateSchema>;

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export interface ValidationErrorBody {
  error: "Validation failed";
  message: string;
  details: ValidationErrorDetail[];
}

export function validationErrorBody(
  error: z.ZodError,
  fieldPrefix = "",
): ValidationErrorBody {
  const details = error.issues.map((issue) => ({
    field: fieldPrefix
      ? `${fieldPrefix}.${issue.path.join(".") || "body"}`
      : issue.path.join(".") || "body",
    message: issue.message,
  }));

  return {
    error: "Validation failed",
    message: details[0]?.message ?? "Request validation failed",
    details,
  };
}

export function validationFailureBody(
  message: string,
  field = "body",
): ValidationErrorBody {
  return {
    error: "Validation failed",
    message,
    details: [{ field, message }],
  };
}