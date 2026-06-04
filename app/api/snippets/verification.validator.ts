import { z } from "zod";

// UUID regex pattern
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stellar address format: starts with 'G' and is 56 characters
const stellarAddressRegex = /^G[A-Z2-7]{55}$/;

// Base64 regex pattern
const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

// ISO timestamp regex pattern
const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

export const verifySnippetSchema = z.object({
  snippetId: z
    .string()
    .min(1, "Snippet ID is required")
    .refine(
      (val) => uuidRegex.test(val),
      "Snippet ID must be a valid UUID format"
    ),
  walletAddress: z
    .string()
    .min(1, "Wallet address is required")
    .refine(
      (val) => stellarAddressRegex.test(val),
      "Wallet address must be a valid Stellar format (starts with G and 56 characters)"
    ),
  signature: z
    .string()
    .min(1, "Signature is required")
    .refine(
      (val) => base64Regex.test(val) && val.length % 4 === 0,
      "Signature must be base64 encoded"
    ),
  message: z
    .string()
    .min(1, "Message is required")
    .refine(
      (val) => {
        const pattern = /^Verify ownership of snippet [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/i;
        return pattern.test(val);
      },
      'Message must match format "Verify ownership of snippet [UUID] at [ISO timestamp]"'
    ),
});

export const verificationAuditSchema = z.object({
  snippetId: z
    .string()
    .refine(
      (val) => uuidRegex.test(val),
      "Snippet ID must be a valid UUID format"
    )
    .optional(),
  walletAddress: z
    .string()
    .refine(
      (val) => stellarAddressRegex.test(val),
      "Wallet address must be a valid Stellar format"
    )
    .optional(),
  action: z
    .enum(["verify_attempt", "verify_success", "verify_failed", "revoke"], {
      errorMap: () => ({
        message: "Action must be one of: verify_attempt, verify_success, verify_failed, revoke",
      }),
    })
    .optional(),
  limit: z
    .number()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(20)
    .optional(),
  offset: z
    .number()
    .min(0, "Offset cannot be negative")
    .default(0)
    .optional(),
});

export type VerifySnippetDTO = z.infer<typeof verifySnippetSchema>;
export type VerificationAuditDTO = z.infer<typeof verificationAuditSchema>;
