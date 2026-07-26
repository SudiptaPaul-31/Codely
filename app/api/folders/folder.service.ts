import { FolderRepository } from "./folder.repository";
import { CreateFolderDTO, UpdateFolderDTO } from "./folder.validator";

export class FolderService {
  constructor(private readonly repo: FolderRepository) {}

  async getFoldersByOwner(ownerWallet: string) {
    try {
      return await this.repo.findByOwner(ownerWallet);
    } catch (err) {
      throw new Error("Failed to fetch folders");
    }
  }

  async getFolderById(id: string) {
    try {
      const folder = await this.repo.findById(id);
      if (!folder) throw new Error("Folder not found");
      return folder;
    } catch (err) {
      if (err instanceof Error && err.message === "Folder not found") throw err;
      throw new Error("Failed to fetch folder");
    }
  }

  async createFolder(data: CreateFolderDTO, ownerWallet: string) {
    try {
      return await this.repo.create(data, ownerWallet);
    } catch (err) {
      throw new Error("Failed to create folder");
    }
  }

  async updateFolder(id: string, data: UpdateFolderDTO, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(id, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the folder owner");
      const updated = await this.repo.update(id, data);
      if (!updated) throw new Error("Folder not found");
      return updated;
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to update folder");
    }
  }

  async deleteFolder(id: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(id, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the folder owner");
      return await this.repo.delete(id);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to delete folder");
    }
  }

  async addSnippet(folderId: string, snippetId: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(folderId, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the folder owner");
      return await this.repo.addSnippet(folderId, snippetId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to add snippet to folder");
    }
  }

  async removeSnippet(folderId: string, snippetId: string, callerWallet: string) {
    try {
      const isOwner = await this.repo.isOwner(folderId, callerWallet);
      if (!isOwner) throw new Error("Unauthorized: caller is not the folder owner");
      return await this.repo.removeSnippet(folderId, snippetId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to remove snippet from folder");
    }
  }

  async getSnippets(folderId: string, callerWallet: string) {
    try {
      const folder = await this.repo.findById(folderId);
      if (!folder) throw new Error("Folder not found");

      if (folder.owner_wallet_address !== callerWallet) {
        throw new Error("Unauthorized: this folder is private");
      }

      return await this.repo.getSnippets(folderId);
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error("Failed to fetch folder snippets");
    }
  }
}
