import { z } from "zod";

export const createCollectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
});

export const updateCollectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(255).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

export type CreateCollectionDTO = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionDTO = z.infer<typeof updateCollectionSchema>;
