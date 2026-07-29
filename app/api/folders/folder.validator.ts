import { z } from "zod";

export const createFolderSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().default(""),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().optional(),
});

export type CreateFolderDTO = z.infer<typeof createFolderSchema>;
export type UpdateFolderDTO = z.infer<typeof updateFolderSchema>;
