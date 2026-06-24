import { CollectionRepository } from "./collection.repository";
import { CreateCollectionDTO, UpdateCollectionDTO } from "./collection.validator";
import { submitCollectionToStellar } from "@/lib/stellar";

export class CollectionService {
  constructor(private readonly repo: CollectionRepository) {}

  async getCollectionsByOwner(ownerWallet: string) {
    try {
      return await this.repo.findByOwner(ownerWallet);
    } catch (err) {
      throw new Error("Failed to fetch collections");
    }
  }

  async getPublicCollections() {
    try {
      return await this.repo.findPublic();
    } catch (err) {
      throw new Error("Failed to fetch public collections");
    }
  }

  async getCollectionById(id: string) {
    try {
      const collection = await this.repo.findById(id);
      if (!collection) throw new Error("Collection not found");
      return collection;
    } catch (err) {
      if (err instanceof Error && err.message === "Collection not found") throw err;
      throw new Error("Failed to fetch collection");
    }
  }

  async createCollection(data: CreateCollectionDTO, ownerWallet: string) {
    try {
      // Anchor on-chain first (uses mock when no secret key is set)
      const onChainResult = await submitCollectionToStellar(
        process.env.STELLAR_SECRET_KEY || "",
        "pending", // placeholder — real id assigned after DB insert
        ownerWallet,
        data.title,
        data.description ?? "",
        data.tags ?? [],
      );

      return await this.repo.create(
        data,
        ownerWallet,
        onChainResult.transactionHash,
        onChainResult.ledger,
        onChainResult.anchor,
      );
    } catch (err) {
      throw new Error("Failed to create collection");
    }
  }

  async updateCollection(
    id: string,
    data: UpdateCollectionDTO,
    callerWallet: string,
  ) {
    try {
      const isOwner = await this.repo.isOwner(id, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the collection owner");
      const updated = await this.repo.update(id, data);
      if (!updated) throw new Error("Collection not found");
      return updated;
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to update collection");
    }
  }

  async deleteCollection(id: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(id, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the collection owner");
      return await this.repo.delete(id);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to delete collection");
    }
  }

  async addSnippet(collectionId: string, snippetId: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(collectionId, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the collection owner");
      return await this.repo.addSnippet(collectionId, snippetId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to add snippet to collection");
    }
  }

  async removeSnippet(collectionId: string, snippetId: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(collectionId, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the collection owner");
      return await this.repo.removeSnippet(collectionId, snippetId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to remove snippet from collection");
    }
  }

  async getSnippets(collectionId: string, callerWallet: string | null) {
    try {
      const collection = await this.repo.findById(collectionId);
      if (!collection) throw new Error("Collection not found");

      // Allow access if collection is public or caller is the owner
      if (!collection.is_public && collection.owner_wallet_address !== callerWallet) {
        throw new Error("Unauthorized: this collection is private");
      }

      return await this.repo.getSnippets(collectionId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to fetch collection snippets");
    }
  }
}
