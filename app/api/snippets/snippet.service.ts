import {
  SnippetRepository,
  PaginationOptions,
  PaginatedResult,
  SearchSnippetsOptions,
} from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema } from "./snippet.validator";
import { ActivityLogger } from "@/lib/activity-logger";

export class SnippetService {
  constructor(private snippetRepository: SnippetRepository) {}

  async getAllSnippets(options?: PaginationOptions): Promise<PaginatedResult<any>> {
    try {
      return await this.snippetRepository.findAll(options);
    } catch (error) {
      console.error("[Service] Error fetching snippets:", error);
      throw new Error("Failed to fetch snippets");
    }
  }

  async searchSnippets(options: SearchSnippetsOptions): Promise<PaginatedResult<any>> {
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

      await ActivityLogger.log(
        id,
        "DELETE",
        userWalletAddress,
        {
          title: deleted.title,
          language: deleted.language,
          deletedAt: new Date().toISOString(),
        },
      );

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
        const existing = await this.snippetRepository["sql"]`
          SELECT is_deleted FROM snippets WHERE id = ${id}
        `;
        if (!existing[0]) {
          throw new Error("Snippet not found");
        }
        throw new Error("Snippet is not deleted");
      }

      await ActivityLogger.log(
        id,
        "RESTORE",
        userWalletAddress,
        {
          title: restored.title,
          language: restored.language,
          restoredAt: new Date().toISOString(),
        },
      );

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

      await ActivityLogger.log(
        id,
        "DELETE",
        null,
        {
          title: deleted.title,
          language: deleted.language,
          permanentlyDeleted: true,
          deletedAt: new Date().toISOString(),
        },
      );

      return deleted;
    } catch (error) {
      console.error("[Service] Error permanently deleting snippet:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to permanently delete snippet");
    }
  }
}
