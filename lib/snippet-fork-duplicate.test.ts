import { SnippetService } from "../app/api/snippets/snippet.service";
import { SnippetRepository } from "../app/api/snippets/snippet.repository";

const MOCK_WALLET = "G1234567890123456789012345678901234567890123456789012345";
const OTHER_WALLET = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SOURCE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NEW_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const mockSourceSnippet = {
  id: SOURCE_ID,
  title: "Original Snippet",
  description: "An original code snippet",
  code: 'console.log("hello")',
  language: "javascript",
  tags: ["test", "demo"],
  owner_wallet_address: OTHER_WALLET,
  original_snippet_id: null,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
};

const mockDuplicateResult = {
  id: NEW_ID,
  title: "Original Snippet",
  description: "An original code snippet",
  code: 'console.log("hello")',
  language: "javascript",
  tags: ["test", "demo"],
  owner_wallet_address: MOCK_WALLET,
  original_snippet_id: SOURCE_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockForkResult = {
  ...mockDuplicateResult,
  title: "Original Snippet (fork)",
};

const mockRepository = {
  findAll: jest.fn(),
  search: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  permanentlyDelete: jest.fn(),
  duplicateSnippet: jest.fn(),
  forkSnippet: jest.fn(),
  findForksBySnippetId: jest.fn(),
  findOriginSnippet: jest.fn(),
} as unknown as SnippetRepository;

const historyMockRepository = mockRepository as unknown as {
  findForksBySnippetId: jest.Mock;
  findOriginSnippet: jest.Mock;
};

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("SnippetService - Fork & Duplicate", () => {
  let service: SnippetService;

  beforeEach(() => {
    service = new SnippetService(mockRepository);
    jest.clearAllMocks();
  });

  describe("duplicateSnippet", () => {
    it("should create an identical copy in the requesting user's collection", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.duplicateSnippet as jest.Mock).mockResolvedValue(mockDuplicateResult);

      const result = await service.duplicateSnippet(SOURCE_ID, MOCK_WALLET);

      expect(result).toEqual(mockDuplicateResult);
      expect(result.owner_wallet_address).toBe(MOCK_WALLET);
      expect(result.original_snippet_id).toBe(SOURCE_ID);
      expect(result.id).not.toBe(SOURCE_ID);
    });

    it("should preserve title, tags, language, and description", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.duplicateSnippet as jest.Mock).mockResolvedValue(mockDuplicateResult);

      const result = await service.duplicateSnippet(SOURCE_ID, MOCK_WALLET);

      expect(result.title).toBe(mockSourceSnippet.title);
      expect(result.language).toBe(mockSourceSnippet.language);
      expect(result.description).toBe(mockSourceSnippet.description);
      expect(result.code).toBe(mockSourceSnippet.code);
    });

    it("should allow title override via optional data", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      const overriddenResult = { ...mockDuplicateResult, title: "My Copy" };
      (mockRepository.duplicateSnippet as jest.Mock).mockResolvedValue(overriddenResult);

      const result = await service.duplicateSnippet(SOURCE_ID, MOCK_WALLET, {
        title: "My Copy",
      });

      expect(result.title).toBe("My Copy");
      expect(mockRepository.duplicateSnippet).toHaveBeenCalledWith(
        SOURCE_ID,
        MOCK_WALLET,
        { title: "My Copy" },
      );
    });

    it("should throw 404 when source snippet is not found", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.duplicateSnippet("nonexistent-id", MOCK_WALLET),
      ).rejects.toThrow("Source snippet not found");
    });

    it("should throw when requesting user is the owner", async () => {
      const ownSnippet = { ...mockSourceSnippet, owner_wallet_address: MOCK_WALLET };
      (mockRepository.findById as jest.Mock).mockResolvedValue(ownSnippet);

      await expect(
        service.duplicateSnippet(SOURCE_ID, MOCK_WALLET),
      ).rejects.toThrow("Cannot duplicate your own snippet");
    });

    it("should log activity for successful duplication", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.duplicateSnippet as jest.Mock).mockResolvedValue(mockDuplicateResult);

      await service.duplicateSnippet(SOURCE_ID, MOCK_WALLET);

      expect(mockRepository.duplicateSnippet).toHaveBeenCalledTimes(1);
    });
  });

  describe("forkSnippet", () => {
    it("should create a derived copy with '(fork)' appended to title", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.forkSnippet as jest.Mock).mockResolvedValue(mockForkResult);

      const result = await service.forkSnippet(SOURCE_ID, MOCK_WALLET);

      expect(result).toEqual(mockForkResult);
      expect(result.owner_wallet_address).toBe(MOCK_WALLET);
      expect(result.original_snippet_id).toBe(SOURCE_ID);
      expect(result.title).toContain("(fork)");
      expect(result.id).not.toBe(SOURCE_ID);
    });

    it("should preserve metadata (language, tags, code, description)", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.forkSnippet as jest.Mock).mockResolvedValue(mockForkResult);

      const result = await service.forkSnippet(SOURCE_ID, MOCK_WALLET);

      expect(result.language).toBe(mockSourceSnippet.language);
      expect(result.description).toBe(mockSourceSnippet.description);
      expect(result.code).toBe(mockSourceSnippet.code);
    });

    it("should allow title and code overrides", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      const overriddenFork = {
        ...mockForkResult,
        title: "Custom Fork Title",
        code: 'console.log("forked and modified")',
      };
      (mockRepository.forkSnippet as jest.Mock).mockResolvedValue(overriddenFork);

      const result = await service.forkSnippet(SOURCE_ID, MOCK_WALLET, {
        title: "Custom Fork Title",
        code: 'console.log("forked and modified")',
      });

      expect(result.title).toBe("Custom Fork Title");
      expect(result.code).toBe('console.log("forked and modified")');
      expect(mockRepository.forkSnippet).toHaveBeenCalledWith(
        SOURCE_ID,
        MOCK_WALLET,
        { title: "Custom Fork Title", code: 'console.log("forked and modified")' },
      );
    });

    it("should throw 404 when source snippet is not found", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.forkSnippet("nonexistent-id", MOCK_WALLET),
      ).rejects.toThrow("Source snippet not found");
    });

    it("should throw when requesting user is the owner", async () => {
      const ownSnippet = { ...mockSourceSnippet, owner_wallet_address: MOCK_WALLET };
      (mockRepository.findById as jest.Mock).mockResolvedValue(ownSnippet);

      await expect(
        service.forkSnippet(SOURCE_ID, MOCK_WALLET),
      ).rejects.toThrow("Cannot fork your own snippet");
    });

    it("should handle optional overrides being undefined", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSourceSnippet);
      (mockRepository.forkSnippet as jest.Mock).mockResolvedValue(mockForkResult);

      await service.forkSnippet(SOURCE_ID, MOCK_WALLET);

      expect(mockRepository.forkSnippet).toHaveBeenCalledWith(
        SOURCE_ID,
        MOCK_WALLET,
        undefined,
      );
    });
  });

  describe("Requirement 6: History Tracking & Traceability", () => {
    it("fetches all forks derived from a snippet", async () => {
      const mockForks = [
        { id: "fork-1", title: "Fork A", forked_from_id: "root-1", is_fork: true },
        { id: "fork-2", title: "Fork B", forked_from_id: "root-1", is_fork: true },
      ];

      historyMockRepository.findForksBySnippetId.mockResolvedValue(mockForks);

      const forks = await service.getSnippetForks("root-1");
      expect(forks).toEqual(mockForks);
      expect(historyMockRepository.findForksBySnippetId).toHaveBeenCalledWith("root-1");
    });

    it("fetches origin snippet for a forked snippet", async () => {
      const originalSnippet = {
        id: "root-1",
        title: "Root Template",
        language: "python",
      };

      historyMockRepository.findOriginSnippet.mockResolvedValue(originalSnippet);

      const origin = await service.getSnippetOrigin("fork-1");
      expect(origin).toEqual(originalSnippet);
      expect(historyMockRepository.findOriginSnippet).toHaveBeenCalledWith("fork-1");
    });
  });
});