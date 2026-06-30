import { FavoriteRepository } from "./favorite.repository";

export class FavoriteService {
  constructor(private favoriteRepository: FavoriteRepository) {}

  async getFavorites(walletAddress: string, options?: { limit?: number; offset?: number }) {
    return await this.favoriteRepository.getFavoritesByUser(walletAddress, options);
  }

  async toggleFavorite(walletAddress: string, snippetId: string) {
    return await this.favoriteRepository.toggleFavorite(walletAddress, snippetId);
  }

  async isFavorite(walletAddress: string, snippetId: string) {
    return await this.favoriteRepository.isFavorite(walletAddress, snippetId);
  }

  async getFavoriteStatuses(walletAddress: string, snippetIds: string[]) {
    return await this.favoriteRepository.getFavoriteStatuses(walletAddress, snippetIds);
  }
}
