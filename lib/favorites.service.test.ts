import { FavoritesService } from "../app/api/favorites/favorites.service";
import { FavoritesRepository } from "../app/api/favorites/favorites.repository";
import { SnippetRepository } from "../app/api/snippets/snippet.repository";

const mockFavoritesRepository = {
  add: jest.fn(),
  remove: jest.fn(),
  findByWalletAndSnippet: jest.fn(),
  findAllByWallet: jest.fn(),
  countByWallet: jest.fn(),
} as unknown as FavoritesRepository;

const mockSnippetRepository = {
  findById: jest.fn(),
} as unknown as SnippetRepository;

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("FavoritesService", () => {
  let service: FavoritesService;

  beforeEach(() => {
    service = new FavoritesService(mockFavoritesRepository, mockSnippetRepository);
    jest.clearAllMocks();
  });

  describe("addFavorite", () => {
    it("should add a favorite successfully", async () => {
      const mockSnippet = { id: "snippet-1", title: "Test" };
      const mockFavorite = { id: "fav-1", wallet_address: "GA...", snippet_id: "snippet-1" };

      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue(mockSnippet);
      (mockFavoritesRepository.findByWalletAndSnippet as jest.Mock).mockResolvedValue(null);
      (mockFavoritesRepository.add as jest.Mock).mockResolvedValue(mockFavorite);

      const result = await service.addFavorite("GA...", "snippet-1");
      expect(result).toEqual(mockFavorite);
      expect(mockSnippetRepository.findById).toHaveBeenCalledWith("snippet-1");
      expect(mockFavoritesRepository.add).toHaveBeenCalledWith("GA...", "snippet-1");
    });

    it("should reject duplicate favorite", async () => {
      const mockSnippet = { id: "snippet-1", title: "Test" };
      const existingFavorite = { id: "fav-1", wallet_address: "GA...", snippet_id: "snippet-1" };

      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue(mockSnippet);
      (mockFavoritesRepository.findByWalletAndSnippet as jest.Mock).mockResolvedValue(existingFavorite);

      await expect(service.addFavorite("GA...", "snippet-1")).rejects.toThrow("Favorite already exists");
      expect(mockFavoritesRepository.add).not.toHaveBeenCalled();
    });

    it("should throw error when snippet does not exist", async () => {
      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.addFavorite("GA...", "nonexistent")).rejects.toThrow("Snippet not found");
      expect(mockFavoritesRepository.add).not.toHaveBeenCalled();
    });
  });

  describe("removeFavorite", () => {
    it("should remove a favorite successfully", async () => {
      const existingFavorite = { id: "fav-1", wallet_address: "GA...", snippet_id: "snippet-1" };
      (mockFavoritesRepository.findByWalletAndSnippet as jest.Mock).mockResolvedValue(existingFavorite);
      (mockFavoritesRepository.remove as jest.Mock).mockResolvedValue(existingFavorite);

      const result = await service.removeFavorite("GA...", "snippet-1");
      expect(result).toEqual(existingFavorite);
      expect(mockFavoritesRepository.remove).toHaveBeenCalledWith("GA...", "snippet-1");
    });

    it("should return null when favorite does not exist", async () => {
      (mockFavoritesRepository.findByWalletAndSnippet as jest.Mock).mockResolvedValue(null);

      const result = await service.removeFavorite("GA...", "nonexistent");
      expect(result).toBeNull();
      expect(mockFavoritesRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe("getFavorites", () => {
    it("should return paginated favorites with snippet data", async () => {
      const mockResult = {
        data: [
          { id: "fav-1", snippet_id: "snippet-1", title: "Snippet 1" },
          { id: "fav-2", snippet_id: "snippet-2", title: "Snippet 2" },
        ],
        total: 2,
        page: 1,
        limit: 20,
      };

      (mockFavoritesRepository.findAllByWallet as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.getFavorites("GA...", { page: 1, limit: 20 });
      expect(result).toEqual(mockResult);
      expect(mockFavoritesRepository.findAllByWallet).toHaveBeenCalledWith("GA...", 1, 20);
    });

    it("should use default pagination values when not provided", async () => {
      const mockResult = { data: [], total: 0, page: 1, limit: 20 };
      (mockFavoritesRepository.findAllByWallet as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.getFavorites("GA...", {});
      expect(result).toEqual(mockResult);
      expect(mockFavoritesRepository.findAllByWallet).toHaveBeenCalledWith("GA...", 1, 20);
    });

    it("should throw error when fetch fails", async () => {
      (mockFavoritesRepository.findAllByWallet as jest.Mock).mockRejectedValue(new Error("DB error"));

      await expect(service.getFavorites("GA...", { page: 1, limit: 10 })).rejects.toThrow("Failed to fetch favorites");
    });
  });
});
