import { FavoritesRepository, PaginatedFavorites } from "./favorites.repository";
import { SnippetRepository } from "../snippets/snippet.repository";
import { favoritesPaginationSchema } from "./favorites.validator";

export class FavoritesService {
  constructor(
    private favoritesRepository: FavoritesRepository,
    private snippetRepository: SnippetRepository,
  ) {}

  async addFavorite(walletAddress: string, snippetId: string) {
    const snippet = await this.snippetRepository.findById(snippetId);
    if (!snippet) {
      throw new Error("Snippet not found");
    }

    const existing = await this.favoritesRepository.findByWalletAndSnippet(walletAddress, snippetId);
    if (existing) {
      throw new Error("Favorite already exists");
    }

    try {
      return await this.favoritesRepository.add(walletAddress, snippetId);
    } catch (error) {
      console.error("[FavoritesService] Error adding favorite:", error);
      throw new Error("Failed to add favorite");
    }
  }

  async removeFavorite(walletAddress: string, snippetId: string) {
    const existing = await this.favoritesRepository.findByWalletAndSnippet(walletAddress, snippetId);
    if (!existing) {
      return null;
    }

    try {
      return await this.favoritesRepository.remove(walletAddress, snippetId);
    } catch (error) {
      console.error("[FavoritesService] Error removing favorite:", error);
      throw new Error("Failed to remove favorite");
    }
  }

  async getFavorites(walletAddress: string, query: { page?: number; limit?: number }): Promise<PaginatedFavorites> {
    const { page, limit } = favoritesPaginationSchema.parse(query);

    try {
      return await this.favoritesRepository.findAllByWallet(walletAddress, page, limit);
    } catch (error) {
      console.error("[FavoritesService] Error fetching favorites:", error);
      throw new Error("Failed to fetch favorites");
    }
  }
}
