import { SnippetRepository, PaginationOptions, PaginatedResult } from "./snippet.repository";
import { createSnippetSchema, updateSnippetSchema } from "./snippet.validator";

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
    // 1. Validation
    const validatedData = updateSnippetSchema.parse(data);

    // 2. Check ownership/existence
    const existing = await this.snippetRepository.findById(id);
    if (!existing) {
      throw new Error("Snippet not found");
    }

    // 3. Database interaction via Repository
    try {
      return await this.snippetRepository.update(id, validatedData);
    } catch (error) {
      console.error("[Service] Error updating snippet:", error);
      throw new Error("Failed to update snippet");
    }
  }

  async deleteSnippet(id: string) {
    // 1. Check ownership/existence
    const existing = await this.snippetRepository.findById(id);
    if (!existing) {
      throw new Error("Snippet not found");
    }

    // 2. Database interaction via Repository
    try {
      return await this.snippetRepository.delete(id);
    } catch (error) {
      console.error("[Service] Error deleting snippet:", error);
      throw new Error("Failed to delete snippet");
    }
  }
}
