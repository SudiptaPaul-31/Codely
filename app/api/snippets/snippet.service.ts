import {
  SnippetRepository,
  PaginationOptions,
  PaginatedResult,
  SearchSnippetsOptions,
} from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema } from "./snippet.validator";
import { ActivityLogger } from "@/lib/activity-logger";
import { storeOnIPFS, retrieveFromIPFS } from "@/lib/ipfs";

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

  async getSnippetByIpfsCid(ipfsCid: string) {
    try {
      const snippet = await this.snippetRepository.findByIpfsCid(ipfsCid);
      if (!snippet) {
        throw new Error("Snippet not found for this IPFS CID");
      }
      return snippet;
    } catch (error) {
      console.error("[Service] Error fetching snippet by IPFS CID:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to fetch snippet");
    }
  }

  async createSnippet(data: unknown, storeOnIpfs: boolean = false) {
    // 1. Validation (Throws ZodError if invalid)
    const validatedData = createSnippetSchema.parse(data);

    let ipfsCid: string | undefined;

    // 2. Store code on IPFS if requested
    if (storeOnIpfs && validatedData.code) {
      try {
        ipfsCid = await storeOnIPFS(validatedData.code);
        console.log("[Service] Snippet stored on IPFS with CID:", ipfsCid);
      } catch (error) {
        console.error("[Service] Error storing snippet on IPFS:", error);
        // Continue even if IPFS fails - we'll still store in database
      }
    }

    // 3. Database interaction via Repository
    try {
      return await this.snippetRepository.create({
        ...validatedData,
        ipfsCid,
      });
    } catch (error) {
      console.error("[Service] Error creating snippet:", error);
      throw new Error("Failed to create snippet");
    }
  }

  async updateSnippet(id: string, data: unknown, storeOnIpfs: boolean = false) {
    // 1. Validation
    const validatedData = updateSnippetSchema.parse(data);

    // 2. Check ownership/existence
    const existing = await this.snippetRepository.findById(id);
    if (!existing) {
      throw new Error("Snippet not found");
    }

    let ipfsCid: string | undefined = existing.ipfs_cid;

    // 3. Store updated code on IPFS if requested
    if (storeOnIpfs && validatedData.code) {
      try {
        ipfsCid = await storeOnIPFS(validatedData.code);
        console.log("[Service] Updated snippet stored on IPFS with CID:", ipfsCid);
      } catch (error) {
        console.error("[Service] Error storing updated snippet on IPFS:", error);
        // Continue even if IPFS fails
      }
    }

    // 4. Database interaction via Repository
    try {
      return await this.snippetRepository.update(id, {
        ...validatedData,
        ipfsCid,
      });
    } catch (error) {
      console.error("[Service] Error updating snippet:", error);
      throw new Error("Failed to update snippet");
    }
  }

  /**
   * Soft delete a snippet (marks as deleted, preserves data)
   */
  async deleteSnippet(id: string, userWalletAddress: string | null = null) {
    // 1. Check ownership/existence
    const existing = await this.snippetRepository.findById(id);
    if (!existing) {
      throw new Error("Snippet not found");
    }

    // 2. Soft delete via Repository
    try {
      const deleted = await this.snippetRepository.softDelete(id, userWalletAddress);
      
      // 3. Log the delete action
      await ActivityLogger.log(
        id,
        "DELETE",
        userWalletAddress,
        {
          title: existing.title,
          language: existing.language,
          deletedAt: new Date().toISOString(),
        },
      );

      return deleted;
    } catch (error) {
      console.error("[Service] Error deleting snippet:", error);
      throw new Error("Failed to delete snippet");
    }
  }

  /**
   * Restore a soft-deleted snippet
   */
  async restoreSnippet(id: string, userWalletAddress: string | null = null) {
    try {
      // Get the snippet (including soft-deleted ones)
      const result = await this.snippetRepository["sql"]`
        SELECT * FROM snippets WHERE id = ${id}
      `;
      const snippet = result[0];

      if (!snippet) {
        throw new Error("Snippet not found");
      }

      if (!snippet.is_deleted) {
        throw new Error("Snippet is not deleted");
      }

      // Restore via Repository
      const restored = await this.snippetRepository.restore(id);

      // Log the restore action
      await ActivityLogger.log(
        id,
        "RESTORE",
        userWalletAddress,
        {
          title: snippet.title,
          language: snippet.language,
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
      // Get the snippet first (for logging)
      const result = await this.snippetRepository["sql"]`
        SELECT * FROM snippets WHERE id = ${id}
      `;
      const snippet = result[0];

      if (!snippet) {
        throw new Error("Snippet not found");
      }

      // Permanently delete
      const deleted = await this.snippetRepository.permanentlyDelete(id);

      // Log the permanent delete
      await ActivityLogger.log(
        id,
        "DELETE",
        null,
        {
          title: snippet.title,
          language: snippet.language,
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
