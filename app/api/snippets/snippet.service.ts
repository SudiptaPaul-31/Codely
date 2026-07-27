import {
  SnippetRepository,
  PaginationOptions,
  PaginatedResult,
  SearchSnippetsOptions,
} from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema, importSnippetSchema } from "./snippet.validator";
import { appendActivityLog } from "@/lib/activity-logger";

export class SnippetService {
  constructor(private snippetRepository: SnippetRepository) {}

  async getAllSnippets(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<any>> {
    try {
      return await this.snippetRepository.findAll(options);
    } catch (error) {
      console.error("[Service] Error fetching snippets:", error);
      throw new Error("Failed to fetch snippets");
    }
  }

  async searchSnippets(
    options: SearchSnippetsOptions,
  ): Promise<PaginatedResult<any>> {
    try {
      return await this.snippetRepository.search(options);
    } catch (error) {
      console.error("[Service] Error searching snippets:", error);
      throw new Error("Failed to search snippets");
    }
  }

  async getSnippetById(id: string) {
    try {
      const snippet = await this.snippetRepository.findById(id);
      if (!snippet) {
        throw new Error("Snippet not found");
      }
      return snippet;
    } catch (error) {
      console.error("[Service] Error fetching snippet:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to fetch snippet");
    }
  }

  async createSnippet(data: unknown) {
    // 1. Validation (Throws ZodError if invalid)
    const validatedData = createSnippetSchema.parse(data);

    // 2. Database interaction via Repository
    try {
      return await this.snippetRepository.create(validatedData);
    } catch (error) {
      console.error("[Service] Error creating snippet:", error);
      throw new Error("Failed to create snippet");
    }
  }

  async updateSnippet(id: string, data: unknown) {
    const validatedData = updateSnippetSchema.parse(data);

    try {
      const updated = await this.snippetRepository.update(id, validatedData);
      if (!updated) {
        throw new Error("Snippet not found");
      }
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === "Snippet not found") {
        throw error;
      }
      console.error("[Service] Error updating snippet:", error);
      throw new Error("Failed to update snippet");
    }
  }

  /**
   * Soft delete a snippet (marks as deleted, preserves data)
   */
  async deleteSnippet(id: string, userWalletAddress: string | null = null) {
    try {
      const deleted = await this.snippetRepository.softDelete(id, userWalletAddress);
      if (!deleted) {
        throw new Error("Snippet not found");
      }

      await appendActivityLog("snippet.deleted", "snippet", {
        actorWallet: userWalletAddress,
        resourceId: id,
        metadata: {
          title: deleted.title,
          language: deleted.language,
          deletedAt: new Date().toISOString(),
        },
      });

      return deleted;
    } catch (error) {
      if (error instanceof Error && error.message === "Snippet not found") {
        throw error;
      }
      console.error("[Service] Error deleting snippet:", error);
      throw new Error("Failed to delete snippet");
    }
  }

  /**
   * Restore a soft-deleted snippet
   */
  async restoreSnippet(id: string, userWalletAddress: string | null = null) {
    try {
      const restored = await this.snippetRepository.restore(id);
      if (!restored) {
        throw new Error("Snippet not found");
      }

      await appendActivityLog("snippet.restored", "snippet", {
        actorWallet: userWalletAddress,
        resourceId: id,
        metadata: {
          title: restored.title,
          language: restored.language,
          restoredAt: new Date().toISOString(),
        },
      });

      return restored;
    } catch (error) {
      console.error("[Service] Error restoring snippet:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to restore snippet");
    }
  }

  /**
   * Get trash (deleted snippets) for a user
   */
  async getUserTrash(
    userWalletAddress: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<any>> {
    try {
      return await this.snippetRepository.findDeletedByUser(
        userWalletAddress,
        options,
      );
    } catch (error) {
      console.error("[Service] Error fetching trash:", error);
      throw new Error("Failed to fetch trash");
    }
  }

  /**
   * Get all deleted snippets (admin only)
   */
  async getAllDeletedSnippets(
    options?: PaginationOptions,
  ): Promise<PaginatedResult<any>> {
    try {
      return await this.snippetRepository.findAllDeleted(options);
    } catch (error) {
      console.error("[Service] Error fetching deleted snippets:", error);
      throw new Error("Failed to fetch deleted snippets");
    }
  }

  /**
   * Permanently delete a snippet (hard delete - admin only)
   */
  async permanentlyDeleteSnippet(id: string) {
    try {
      const deleted = await this.snippetRepository.permanentlyDelete(id);
      if (!deleted) {
        throw new Error("Snippet not found");
      }

      await appendActivityLog("snippet.deleted", "snippet", {
        actorWallet: null,
        resourceId: id,
        metadata: {
          title: deleted.title,
          language: deleted.language,
          permanentlyDeleted: true,
          deletedAt: new Date().toISOString(),
        },
      });

      return deleted;
    } catch (error) {
      console.error("[Service] Error permanently deleting snippet:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to permanently delete snippet");
    }
  }

  /**
   * Import multiple snippets from JSON/ZIP structures, perform Zod validation,
   * detect duplicate records (by ID globally, or by content key locally), and batch create.
   */
  async importSnippets(
    snippetsData: unknown[],
    userWalletAddress: string,
  ): Promise<{
    imported: any[];
    duplicates: any[];
    errors: Array<{ index: number; title?: string; error: string }>;
  }> {
    const crypto = await import("crypto");

    const validatedSnippets: any[] = [];
    const errors: Array<{ index: number; title?: string; error: string }> = [];

    // 1. Validate each snippet structure
    for (let i = 0; i < snippetsData.length; i++) {
      try {
        const item = snippetsData[i];
        const validated = importSnippetSchema.parse(item);
        validatedSnippets.push({
          index: i,
          data: validated,
        });
      } catch (err: any) {
        errors.push({
          index: i,
          title: (snippetsData[i] as any)?.title,
          error: err instanceof Error ? err.message : "Validation failed",
        });
      }
    }

    if (validatedSnippets.length === 0) {
      return { imported: [], duplicates: [], errors };
    }

    // 2. Query existing IDs and content hashes to deduplicate in-memory
    const importedIds = validatedSnippets
      .map((x) => x.data.id)
      .filter((id): id is string => !!id);

    const existingIds = await this.snippetRepository.checkExistingIds(importedIds);
    const existingIdsSet = new Set(existingIds);

    const existingSnippetHashes = await this.snippetRepository.getUserSnippetHashes(userWalletAddress);
    const existingContentMap = new Set(
      existingSnippetHashes.map(
        (s) => `${s.title.toLowerCase()}|${s.language.toLowerCase()}|${s.code_hash}`
      )
    );

    const snippetsToInsert: any[] = [];
    const duplicates: any[] = [];

    for (const item of validatedSnippets) {
      const { data } = item;

      // Duplicate by ID check
      if (data.id && existingIdsSet.has(data.id)) {
        duplicates.push({
          title: data.title,
          reason: `Snippet with ID ${data.id} already exists.`,
        });
        continue;
      }

      // Duplicate by content (title, language, code MD5 hash) check
      const codeHash = crypto.createHash("md5").update(data.code).digest("hex");
      const contentKey = `${data.title.toLowerCase()}|${data.language.toLowerCase()}|${codeHash}`;

      if (existingContentMap.has(contentKey)) {
        duplicates.push({
          title: data.title,
          reason: "A snippet with the same title, code, and language already exists for this user.",
        });
        continue;
      }

      // Safe fallback values
      const finalId = data.id || crypto.randomUUID();
      snippetsToInsert.push({
        id: finalId,
        title: data.title,
        description: data.metadata?.description || "Imported snippet",
        code: data.code,
        language: data.language,
        tags: data.metadata?.tags || ["imported"],
        ownerWalletAddress: userWalletAddress,
      });
    }

    // 3. Batch insert snippets and log activity
    let importedResults: any[] = [];
    if (snippetsToInsert.length > 0) {
      try {
        importedResults = await this.snippetRepository.createMany(snippetsToInsert);

        for (const snippet of importedResults) {
          try {
            await appendActivityLog("snippet.created", "snippet", {
              actorWallet: userWalletAddress,
              resourceId: snippet.id,
              metadata: { title: snippet.title, language: snippet.language, tags: snippet.tags },
              ipAddress: "import",
              userAgent: "api",
            });
          } catch (err) {
            console.error("Failed to log activity for imported snippet:", err);
          }
        }
      } catch (error) {
        console.error("Error bulk inserting imported snippets:", error);
        throw new Error("Failed to insert imported snippets");
      }
    }

    return {
      imported: importedResults,
      duplicates,
      errors,
    };
  }
}

