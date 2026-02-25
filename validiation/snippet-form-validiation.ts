import { z } from "zod";

export const snippetSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be under 100 characters"),

  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Description must be under 500 characters"),

  code: z.string().min(1, "Code is required").max(10000, "Code is too large"),

  language: z.string().min(1, "Language is required"),

  tags: z.string().optional(),
});

export type SnippetFormValues = z.infer<typeof snippetSchema>;
