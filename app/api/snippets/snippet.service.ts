import {
  SnippetRepository,
  PaginationOptions,
  PaginatedResult,
  SearchSnippetsOptions,
} from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema } from "./snippet.validator";
import { appendActivityLog } from "@/lib/activity-logger";
import { IPFSService } from "@/lib/ipfs.service";

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
      // Upload code to IPFS
      let ipfsCid;
      try {
        ipfsCid = await IPFSService.uploadToIPFS(validatedData.code);
      } catch (ipfsError) {
        console.error("[Service] IPFS upload failed:", ipfsError);
        // We can either fail the creation or continue without CID. 
        // Requirements say: "system should generate and store IPFS CIDs in the database"
        throw new Error("Failed to upload snippet to IPFS");
      }

      // First create the snippet
      let snippet = await this.snippetRepository.create({
        ...validatedData,
        ipfsCid
      });

      // If licenseType is provided, mint it and update the snippet
      if (validatedData.licenseType && validatedData.licenseType !== "None") {
        const { mintSnippetLicenseOnStellar } = await import("@/lib/stellar");
        const tx = await mintSnippetLicenseOnStellar({
          snippetId: snippet.id,
          licenseType: validatedData.licenseType,
          ownerWalletAddress: validatedData.ownerWalletAddress,
        });

        if (tx.success && tx.transactionHash) {
          snippet = await this.snippetRepository.update(snippet.id, {
            licenseTransactionHash: tx.transactionHash,
            licenseMetadata: {
              type: validatedData.licenseType,
              timestamp: tx.timestamp,
              memo: tx.memo,
            }
          } as any);
        }
      }
      return snippet;
    } catch (error) {
      console.error("[Service] Error creating snippet:", error);
      throw new Error("Failed to create snippet");
    }
  }

  async updateSnippet(id: string, data: unknown) {
    const validatedData = updateSnippetSchema.parse(data);

    try {
      const existing = await this.snippetRepository.findById(id);
      if (!existing) {
        throw new Error("Snippet not found");
      }

      let ipfsCid;
      if (validatedData.code !== undefined) {
        try {
          ipfsCid = await IPFSService.uploadToIPFS(validatedData.code);
        } catch (ipfsError) {
          console.error("[Service] IPFS upload failed during update:", ipfsError);
          throw new Error("Failed to upload snippet to IPFS");
        }
      }

      let updated = await this.snippetRepository.update(id, {
        ...validatedData,
        ipfsCid
      });

      // Mint license if it's being set for the first time
      if (
        validatedData.licenseType &&
        validatedData.licenseType !== "None" &&
        !existing.license_transaction_hash
      ) {
        const { mintSnippetLicenseOnStellar } = await import("@/lib/stellar");
        const tx = await mintSnippetLicenseOnStellar({
          snippetId: id,
          licenseType: validatedData.licenseType,
          ownerWalletAddress: existing.owner_wallet_address,
        });

        if (tx.success && tx.transactionHash) {
          updated = await this.snippetRepository.update(id, {
            licenseTransactionHash: tx.transactionHash,
            licenseMetadata: {
              type: validatedData.licenseType,
              timestamp: tx.timestamp,
              memo: tx.memo,
            }
          } as any);
        }
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

      // Log the delete action using appendActivityLog
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
        throw new Error("Snippet not found or not deleted");
      }

      // Log the restore action using appendActivityLog
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

      // Log the permanent delete using appendActivityLog
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
}
