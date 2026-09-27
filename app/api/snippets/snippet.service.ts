import {
  SnippetRepository,
  PaginationOptions,
  PaginatedResult,
  SearchSnippetsOptions,
} from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema, forkDuplicateSchema } from "./snippet.validator";
import { appendActivityLog } from "@/lib/activity-logger";
import { submitHashToStellar } from "@/lib/stellar";
import { IPFSService } from "@/lib/ipfs.service";
import {
  hashSnippetContent,
  SnippetOwnershipProof,
  verifySnippetOwnershipProof,
} from "@/lib/snippet-ownership-proof";
import { StellarRecoveryService } from "@/lib/stellar-recovery.service";

export class SnippetService {
  private recoveryService = new StellarRecoveryService();

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
      const requestedProof = validatedData.ownershipProof;
      if (requestedProof) {
        const proofCheck = verifySnippetOwnershipProof(requestedProof as SnippetOwnershipProof);
        if (
          !proofCheck.valid ||
          requestedProof.ownerWallet.toUpperCase() !== validatedData.ownerWalletAddress.toUpperCase() ||
          requestedProof.hash !== hashSnippetContent(validatedData.code)
        ) {
          await appendActivityLog("snippet.proof_verification_failed", "snippet", {
            actorWallet: requestedProof.ownerWallet,
            metadata: { error: proofCheck.error || "Proof does not match snippet" },
          });
          throw new Error("Invalid ownership proof");
        }
      }
      let snippet = await this.snippetRepository.create({
        ...validatedData,
        ipfsCid,
        id: requestedProof?.snippetId,
      });

      if (requestedProof) {
        const proof = requestedProof as SnippetOwnershipProof;
        if (proof.snippetId !== snippet.id) {
          throw new Error("Ownership proof does not match snippet");
        }
        const result = verifySnippetOwnershipProof(proof);
        if (
          !result.valid ||
          proof.ownerWallet.toUpperCase() !== String(snippet.owner_wallet_address).toUpperCase() ||
          proof.hash !== hashSnippetContent(snippet.code)
        ) {
          await appendActivityLog("snippet.proof_verification_failed", "snippet", {
            actorWallet: proof.ownerWallet,
            resourceId: snippet.id,
            metadata: { error: result.error || "Proof does not match snippet" },
          });
          throw new Error("Invalid ownership proof");
        }
        const anchor = await submitHashToStellar(
          process.env.STELLAR_SECRET_KEY || "",
          proof.signature,
          proof.snippetId,
          proof.createdAt,
        );
        if (!anchor.success || !anchor.transactionHash) {
          throw new Error(anchor.error || "Failed to anchor ownership proof");
        }
        await this.snippetRepository.saveOwnershipProof(
          proof,
          anchor.transactionHash,
        );
        await appendActivityLog("snippet.proof_generated", "snippet", {
          actorWallet: proof.ownerWallet,
          resourceId: snippet.id,
          metadata: { hash: proof.hash, createdAt: proof.createdAt },
        });
      }

      // If licenseType is provided, mint it via recovery service
      if (validatedData.licenseType && validatedData.licenseType !== "None") {
        const idempotencyKey = `lic:${snippet.id.slice(0, 8)}:${validatedData.licenseType}`;
        const record = await this.recoveryService.submitLicenseMint({
          idempotencyKey,
          snippetId: snippet.id,
          licenseType: validatedData.licenseType,
          ownerWalletAddress: validatedData.ownerWalletAddress,
        });

        if (record.status === "confirmed" && record.callback_status === "applied" && record.stellar_tx_hash) {
          snippet = await this.snippetRepository.update(snippet.id, {
            licenseTransactionHash: record.stellar_tx_hash,
            licenseMetadata: {
              type: validatedData.licenseType,
              memo: `lic:${snippet.id.slice(0, 8)}`,
            }
          } as any);
        } else if (record.status === "dead") {
          console.error("[Service] License minting failed permanently for snippet:", snippet.id);
        } else {
          console.warn("[Service] License minting queued for retry:", record.status, record.id);
        }
      }
      return snippet;
    } catch (error) {
      console.error("[Service] Error creating snippet:", error);
      if (error instanceof Error && (error.message === "Invalid ownership proof" || error.message.includes("ownership proof"))) {
        throw error;
      }
      throw new Error("Failed to create snippet");
    }
  }

  async getOwnershipProof(id: string) {
    const snippet = await this.getSnippetById(id);
    const proof = await this.snippetRepository.findOwnershipProof(id);
    const verification = proof
      ? verifySnippetOwnershipProof(proof as SnippetOwnershipProof)
      : { valid: false, error: "Ownership proof not found" };
    await appendActivityLog(
      verification.valid ? "snippet.proof_verified" : "snippet.proof_verification_failed",
      "snippet",
      { actorWallet: proof?.ownerWallet || snippet.owner_wallet_address, resourceId: id, metadata: { error: verification.error } },
    );
    return { proof, verified: verification.valid, error: verification.error };
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
        const idempotencyKey = `lic:${id.slice(0, 8)}:${validatedData.licenseType}`;
        const record = await this.recoveryService.submitLicenseMint({
          idempotencyKey,
          snippetId: id,
          licenseType: validatedData.licenseType,
          ownerWalletAddress: existing.owner_wallet_address,
        });

        if (record.status === "confirmed" && record.callback_status === "applied" && record.stellar_tx_hash) {
          updated = await this.snippetRepository.update(id, {
            licenseTransactionHash: record.stellar_tx_hash,
            licenseMetadata: {
              type: validatedData.licenseType,
              memo: `lic:${id.slice(0, 8)}`,
            }
          } as any);
        } else if (record.status === "dead") {
          console.error("[Service] License minting failed permanently for snippet:", id);
        } else {
          console.warn("[Service] License minting queued for retry:", record.status, record.id);
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
   * Duplicate a snippet (creates an identical copy in the user's collection)
   */
  async duplicateSnippet(
    snippetId: string,
    userWalletAddress: string,
    titleOverride?: string,
  ) {
    try {
      const original = await this.snippetRepository.findById(snippetId);
      if (!original) {
        throw new Error("Snippet not found");
      }

      const title = titleOverride?.trim() || `${original.title} (Copy)`;
      const tags = Array.isArray(original.tags)
        ? original.tags
        : (typeof original.tags === "string" ? JSON.parse(original.tags) : []);

      let ipfsCid = original.ipfs_cid;
      try {
        ipfsCid = await IPFSService.uploadToIPFS(original.code);
      } catch (ipfsErr) {
        console.warn("[Service] Non-critical IPFS upload failure on duplicate:", ipfsErr);
      }

      const duplicate = await this.snippetRepository.create({
        title,
        description: original.description || "",
        code: original.code,
        language: original.language,
        tags: tags.length > 0 ? tags : ["snippet"],
        ownerWalletAddress: userWalletAddress,
        forkedFromId: original.id,
        isFork: false,
        ipfsCid,
      });

      await appendActivityLog("snippet.duplicated", "snippet", {
        actorWallet: userWalletAddress,
        resourceId: duplicate.id,
        metadata: {
          originSnippetId: original.id,
          originTitle: original.title,
          title: duplicate.title,
          language: duplicate.language,
        },
      });

      return duplicate;
    } catch (error) {
      if (error instanceof Error && error.message === "Snippet not found") {
        throw error;
      }
      console.error("[Service] Error duplicating snippet:", error);
      throw new Error("Failed to duplicate snippet");
    }
  }

  /**
   * Fork a snippet (creates a derived snippet with editable content)
   */
  async forkSnippet(
    snippetId: string,
    userWalletAddress: string,
    data?: unknown,
  ) {
    try {
      const original = await this.snippetRepository.findById(snippetId);
      if (!original) {
        throw new Error("Snippet not found");
      }

      const validatedData = data ? (await import("./snippet.validator")).forkSnippetSchema.parse(data) : {};

      const originalTags = Array.isArray(original.tags)
        ? original.tags
        : (typeof original.tags === "string" ? JSON.parse(original.tags) : []);

      const title = validatedData.title?.trim() || `Fork of ${original.title}`;
      const description = validatedData.description !== undefined ? validatedData.description : (original.description || "");
      const code = validatedData.code !== undefined ? validatedData.code : original.code;
      const language = validatedData.language !== undefined ? validatedData.language : original.language;
      const tags = validatedData.tags && validatedData.tags.length > 0 ? validatedData.tags : (originalTags.length > 0 ? originalTags : ["fork"]);

      let ipfsCid = original.ipfs_cid;
      try {
        ipfsCid = await IPFSService.uploadToIPFS(code);
      } catch (ipfsErr) {
        console.warn("[Service] Non-critical IPFS upload failure on fork:", ipfsErr);
      }

      let forked = await this.snippetRepository.create({
        title,
        description,
        code,
        language,
        tags,
        ownerWalletAddress: userWalletAddress,
        forkedFromId: original.id,
        isFork: true,
        licenseType: validatedData.licenseType,
        ipfsCid,
      });

      if (validatedData.licenseType && validatedData.licenseType !== "None") {
        try {
          const { mintSnippetLicenseOnStellar } = await import("@/lib/stellar");
          const tx = await mintSnippetLicenseOnStellar({
            snippetId: forked.id,
            licenseType: validatedData.licenseType,
            ownerWalletAddress: userWalletAddress,
          });

          if (tx.success && tx.transactionHash) {
            forked = await this.snippetRepository.update(forked.id, {
              licenseTransactionHash: tx.transactionHash,
              licenseMetadata: {
                type: validatedData.licenseType,
                timestamp: tx.timestamp,
                memo: tx.memo,
              }
            } as any);
          }
        } catch (err) {
          console.error("[Service] License minting for fork failed:", err);
        }
      }

      await appendActivityLog("snippet.forked", "snippet", {
        actorWallet: userWalletAddress,
        resourceId: forked.id,
        metadata: {
          originSnippetId: original.id,
          originTitle: original.title,
          title: forked.title,
          language: forked.language,
        },
      });

      return forked;
    } catch (error) {
      if (error instanceof Error && error.message === "Snippet not found") {
        throw error;
      }
      console.error("[Service] Error forking snippet:", error);
      throw error instanceof Error ? error : new Error("Failed to fork snippet");
    }
  }

  /**
   * Get all snippets derived/forked from a snippet
   */
  async getSnippetForks(snippetId: string) {
    try {
      return await this.snippetRepository.findForksBySnippetId(snippetId);
    } catch (error) {
      console.error("[Service] Error fetching snippet forks:", error);
      throw new Error("Failed to fetch snippet forks");
    }
  }

  /**
   * Get origin/parent snippet of a forked snippet
   */
  async getSnippetOrigin(snippetId: string) {
    try {
      return await this.snippetRepository.findOriginSnippet(snippetId);
    } catch (error) {
      console.error("[Service] Error fetching snippet origin:", error);
      throw new Error("Failed to fetch snippet origin");
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
