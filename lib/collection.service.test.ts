import { CollectionService } from "../app/api/collections/collection.service";
import { CollectionRepository } from "../app/api/collections/collection.repository";

// Mock stellar to avoid network calls in tests
jest.mock("../lib/stellar", () => ({
  submitCollectionToStellar: jest.fn().mockResolvedValue({
    success: true,
    transactionHash: "mock-tx-hash-abc123",
    ledger: 12345,
    anchor: "mock-anchor-hash",
  }),
}));

const makeMockRepo = (): jest.Mocked<CollectionRepository> =>
  ({
    findByOwner: jest.fn(),
    findPublic: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addSnippet: jest.fn(),
    removeSnippet: jest.fn(),
    getSnippets: jest.fn(),
    isOwner: jest.fn(),
    snippetBelongsToCollection: jest.fn(),
  } as unknown as jest.Mocked<CollectionRepository>);

const OWNER = "GABCDEF1234567890";
const OTHER = "GXYZXYZ1234567890";

describe("CollectionService", () => {
  let service: CollectionService;
  let repo: jest.Mocked<CollectionRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new CollectionService(repo);
    jest.clearAllMocks();
  });

  describe("getCollectionsByOwner", () => {
    it("returns collections for the given wallet", async () => {
      const mockData = [{ id: "1", title: "My Collection" }];
      repo.findByOwner.mockResolvedValue(mockData);

      const result = await service.getCollectionsByOwner(OWNER);

      expect(result).toEqual(mockData);
      expect(repo.findByOwner).toHaveBeenCalledWith(OWNER);
    });

    it("wraps DB errors", async () => {
      repo.findByOwner.mockRejectedValue(new Error("DB down"));
      await expect(service.getCollectionsByOwner(OWNER)).rejects.toThrow("Failed to fetch collections");
    });
  });

  describe("getPublicCollections", () => {
    it("returns public collections", async () => {
      const mockData = [{ id: "2", title: "Public Col", is_public: true }];
      repo.findPublic.mockResolvedValue(mockData);

      const result = await service.getPublicCollections();
      expect(result).toEqual(mockData);
    });

    it("wraps DB errors", async () => {
      repo.findPublic.mockRejectedValue(new Error("DB down"));
      await expect(service.getPublicCollections()).rejects.toThrow("Failed to fetch public collections");
    });
  });

  describe("getCollectionById", () => {
    it("returns the collection when found", async () => {
      const col = { id: "abc", title: "Test" };
      repo.findById.mockResolvedValue(col);

      const result = await service.getCollectionById("abc");
      expect(result).toEqual(col);
    });

    it("throws 'not found' when collection is missing", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getCollectionById("missing")).rejects.toThrow("Collection not found");
    });
  });

  describe("createCollection", () => {
    it("creates a collection and returns it", async () => {
      const created = { id: "new-id", title: "New", owner_wallet_address: OWNER };
      repo.create.mockResolvedValue(created);

      const result = await service.createCollection(
        { title: "New", description: "", tags: [], isPublic: false },
        OWNER,
      );

      expect(result).toEqual(created);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "New" }),
        OWNER,
        "mock-tx-hash-abc123",
        12345,
        "mock-anchor-hash",
      );
    });

    it("wraps errors", async () => {
      repo.create.mockRejectedValue(new Error("insert failed"));
      await expect(
        service.createCollection({ title: "X", description: "", tags: [], isPublic: false }, OWNER),
      ).rejects.toThrow("Failed to create collection");
    });
  });

  describe("updateCollection", () => {
    it("updates when caller is the owner", async () => {
      repo.isOwner.mockResolvedValue(true);
      repo.update.mockResolvedValue({ id: "1", title: "Updated" });

      const result = await service.updateCollection("1", { title: "Updated" }, OWNER);
      expect(result).toEqual({ id: "1", title: "Updated" });
    });

    it("throws Unauthorized when caller is not the owner", async () => {
      repo.isOwner.mockResolvedValue(false);
      await expect(service.updateCollection("1", { title: "X" }, OTHER)).rejects.toThrow(
        "Unauthorized",
      );
    });
  });

  describe("deleteCollection", () => {
    it("deletes when caller is the owner", async () => {
      repo.isOwner.mockResolvedValue(true);
      repo.delete.mockResolvedValue({ id: "1" });

      await service.deleteCollection("1", OWNER);
      expect(repo.delete).toHaveBeenCalledWith("1");
    });

    it("throws Unauthorized when caller is not the owner", async () => {
      repo.isOwner.mockResolvedValue(false);
      await expect(service.deleteCollection("1", OTHER)).rejects.toThrow("Unauthorized");
    });
  });

  describe("addSnippet", () => {
    it("adds snippet when caller owns the collection", async () => {
      repo.isOwner.mockResolvedValue(true);
      repo.addSnippet.mockResolvedValue({ collection_id: "c1", snippet_id: "s1" });

      const result = await service.addSnippet("c1", "s1", OWNER);
      expect(repo.addSnippet).toHaveBeenCalledWith("c1", "s1");
      expect(result).toBeDefined();
    });

    it("throws Unauthorized when caller does not own the collection", async () => {
      repo.isOwner.mockResolvedValue(false);
      await expect(service.addSnippet("c1", "s1", OTHER)).rejects.toThrow("Unauthorized");
    });
  });

  describe("removeSnippet", () => {
    it("removes snippet when caller owns the collection", async () => {
      repo.isOwner.mockResolvedValue(true);
      repo.removeSnippet.mockResolvedValue({ collection_id: "c1", snippet_id: "s1" });

      await service.removeSnippet("c1", "s1", OWNER);
      expect(repo.removeSnippet).toHaveBeenCalledWith("c1", "s1");
    });

    it("throws Unauthorized when caller does not own the collection", async () => {
      repo.isOwner.mockResolvedValue(false);
      await expect(service.removeSnippet("c1", "s1", OTHER)).rejects.toThrow("Unauthorized");
    });
  });

  describe("getSnippets", () => {
    it("returns snippets for a public collection without wallet", async () => {
      repo.findById.mockResolvedValue({
        id: "c1",
        is_public: true,
        owner_wallet_address: OWNER,
      });
      repo.getSnippets.mockResolvedValue([{ id: "s1", title: "Snippet 1" }]);

      const snippets = await service.getSnippets("c1", null);
      expect(snippets).toHaveLength(1);
    });

    it("returns snippets for a private collection when caller is the owner", async () => {
      repo.findById.mockResolvedValue({
        id: "c1",
        is_public: false,
        owner_wallet_address: OWNER,
      });
      repo.getSnippets.mockResolvedValue([{ id: "s1" }]);

      const snippets = await service.getSnippets("c1", OWNER);
      expect(snippets).toHaveLength(1);
    });

    it("throws Unauthorized for private collection when caller is not the owner", async () => {
      repo.findById.mockResolvedValue({
        id: "c1",
        is_public: false,
        owner_wallet_address: OWNER,
      });

      await expect(service.getSnippets("c1", OTHER)).rejects.toThrow("Unauthorized");
    });

    it("throws not found when collection does not exist", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getSnippets("missing", OWNER)).rejects.toThrow("Collection not found");
    });
  });
});
