import { SnippetService } from "../app/api/snippets/snippet.service";
import { SnippetRepository } from "../app/api/snippets/snippet.repository";
import { ZodError } from "zod";
import { IPFSService } from "../lib/ipfs.service";

jest.mock("@/lib/ipfs.service", () => ({
  IPFSService: {
    uploadToIPFS: jest.fn().mockResolvedValue("QmMockCID-test"),
  },
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

// Mock the repository
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
  findDeletedByUser: jest.fn(),
  findAllDeleted: jest.fn(),
  findForksBySnippetId: jest.fn(),
  findOriginSnippet: jest.fn(),
} as unknown as SnippetRepository;

// Suppress console.error in tests
let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

// A real, checksum-valid Stellar public key
const VALID_WALLET = "GCRKPWEEZPKBMQ7L3FAKKZL7TPJBKEHIWUBMN554ASGZKDJXJ7FCXRRU";
// A different wallet (to avoid "Cannot duplicate your own snippet" guard)
const OTHER_WALLET = "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH6S7I3J5VD6PDMTF";

describe("SnippetService", () => {
  let service: SnippetService;

  beforeEach(() => {
    service = new SnippetService(mockRepository);
    jest.clearAllMocks();
  });

  describe("getAllSnippets", () => {
    it("should return all snippets", async () => {
      const mockSnippets = [{ id: "1", title: "Test Snippet" }];
      (mockRepository.findAll as jest.Mock).mockResolvedValue(mockSnippets);

      const result = await service.getAllSnippets();
      expect(result).toEqual(mockSnippets);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it("should throw error when fetch fails", async () => {
      (mockRepository.findAll as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      await expect(service.getAllSnippets()).rejects.toThrow(
        "Failed to fetch snippets",
      );
    });
  });

  describe("searchSnippets", () => {
    it("should return filtered snippets", async () => {
      const filters = {
        title: "React",
        language: "typescript",
        tags: ["frontend"],
        keyword: "hooks",
        limit: 10,
        offset: 0,
      };
      const mockResult = {
        data: [{ id: "1", title: "React Hooks" }],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      (mockRepository.search as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.searchSnippets(filters);
      expect(result).toEqual(mockResult);
      expect(mockRepository.search).toHaveBeenCalledWith(filters);
    });

    it("should throw error when search fails", async () => {
      (mockRepository.search as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      await expect(
        service.searchSnippets({ limit: 10, offset: 0, keyword: "react" }),
      ).rejects.toThrow("Failed to search snippets");
    });
  });

  describe("getSnippetById", () => {
    it("should return snippet by id", async () => {
      const mockSnippet = { id: "1", title: "Test Snippet" };
      (mockRepository.findById as jest.Mock).mockResolvedValue(mockSnippet);

      const result = await service.getSnippetById("1");
      expect(result).toEqual(mockSnippet);
      expect(mockRepository.findById).toHaveBeenCalledWith("1");
    });

    it("should throw error when snippet not found", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.getSnippetById("999")).rejects.toThrow(
        "Snippet not found",
      );
    });
  });

  describe("createSnippet", () => {
    it("should successfully create a snippet with valid data", async () => {
      const validData = {
        title: "Test",
        description: "Desc",
        code: 'console.log("hi")',
        language: "javascript",
        tags: ["test"],
        ownerWalletAddress: VALID_WALLET,
      };

      const expectedResult = { id: "1", ...validData, ipfsCid: "QmMockCID-test" };
      (mockRepository.create as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.createSnippet(validData);
      expect(result).toEqual(expectedResult);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining(validData),
      );
    });

    it("should reject missing required fields with a ZodError", async () => {
      const invalidData = { title: "" };

      await expect(service.createSnippet(invalidData)).rejects.toThrow(
        ZodError,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it("should reject a malformed wallet address", async () => {
      const invalidData = {
        title: "Test",
        description: "Desc",
        code: 'console.log("hi")',
        language: "javascript",
        tags: ["test"],
        ownerWalletAddress: "G1234567890123456789012345678901234567890123456789012345",
      };

      await expect(service.createSnippet(invalidData)).rejects.toThrow(
        ZodError,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it("should reject an unsupported language", async () => {
      const invalidData = {
        title: "Test",
        description: "Desc",
        code: 'console.log("hi")',
        language: "cobol",
        tags: ["test"],
        ownerWalletAddress: VALID_WALLET,
      };

      await expect(service.createSnippet(invalidData)).rejects.toThrow(
        ZodError,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it("should reject invalid visibility values", async () => {
      const invalidData = {
        title: "Test",
        description: "Desc",
        code: 'console.log("hi")',
        language: "javascript",
        tags: ["test"],
        ownerWalletAddress: VALID_WALLET,
        visibility: "friends",
      };

      await expect(service.createSnippet(invalidData)).rejects.toThrow(
        ZodError,
      );
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("updateSnippet", () => {
    it("should update snippet with valid data", async () => {
      const updateData = { title: "Updated Title" };
      const existingSnippet = { id: "1", title: "Old Title", code: "code", owner_wallet_address: "G123" };
      const updatedSnippet = { id: "1", title: "Updated Title" };

      (mockRepository.findById as jest.Mock).mockResolvedValue(existingSnippet);
      (mockRepository.update as jest.Mock).mockResolvedValue(updatedSnippet);

      const result = await service.updateSnippet("1", updateData);
      expect(result).toEqual(updatedSnippet);
      expect(mockRepository.update).toHaveBeenCalledWith("1", expect.objectContaining(updateData));
    });

    it("should throw error when snippet not found", async () => {
      const updateData = { title: "Updated Title" };
      (mockRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.updateSnippet("999", updateData)).rejects.toThrow(
        "Snippet not found",
      );
    });
  });

  // Duplicates and forks are written with repository.create() and linked to
  // their source through forked_from_id (the column scripts/init-db.sql defines).
  const original = {
    id: "orig-123",
    title: "Original Algorithm",
    description: "Original description",
    code: "function solve() {}",
    language: "javascript",
    tags: ["algorithm"],
    owner_wallet_address: "G_ORIGINAL",
    ipfs_cid: "QmOriginal",
  };
  const echoCreate = () =>
    (mockRepository.create as jest.Mock).mockImplementation(async (data) => ({
      id: "new-456",
      ...data,
      owner_wallet_address: data.ownerWalletAddress,
      forked_from_id: data.forkedFromId,
      is_fork: data.isFork,
    }));

  describe("duplicateSnippet", () => {
    it("copies the snippet into the requester's collection, linked to its source", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(original);
      echoCreate();

      const result = await service.duplicateSnippet("orig-123", OTHER_WALLET);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Original Algorithm (Copy)",
          description: "Original description",
          code: "function solve() {}",
          language: "javascript",
          tags: ["algorithm"],
          ownerWalletAddress: OTHER_WALLET,
          forkedFromId: "orig-123",
          isFork: false,
        }),
      );
      expect(result.id).not.toBe("orig-123");
      expect(result.forked_from_id).toBe("orig-123");
    });

    it("takes a title override from the request body", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(original);
      echoCreate();

      const result = await service.duplicateSnippet("orig-123", OTHER_WALLET, {
        title: "My Copy",
        ownerWalletAddress: OTHER_WALLET,
      });

      expect(result.title).toBe("My Copy");
    });

    it("rejects an invalid body with a ZodError", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(original);
      await expect(
        service.duplicateSnippet("orig-123", OTHER_WALLET, { title: "" }),
      ).rejects.toThrow(ZodError);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it("should throw error if original snippet not found on duplicate", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.duplicateSnippet("invalid-id", OTHER_WALLET)).rejects.toThrow(
        "Snippet not found",
      );
    });
  });

  describe("forkSnippet", () => {
    it("should create forked snippet with derivation link and customizable content", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(original);
      echoCreate();

      const result = await service.forkSnippet("orig-123", OTHER_WALLET, {
        title: "Customized Fork",
        code: "function solveOptimized() {}",
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Customized Fork",
          code: "function solveOptimized() {}",
          description: "Original description",
          ownerWalletAddress: OTHER_WALLET,
          forkedFromId: "orig-123",
          isFork: true,
        }),
      );
      expect(result.title).toBe("Customized Fork");
      expect(result.is_fork).toBe(true);
    });

    it("falls back to 'Fork of [Title]' when no title override is passed", async () => {
      (mockRepository.findById as jest.Mock).mockResolvedValue(original);
      echoCreate();

      const result = await service.forkSnippet("orig-123", OTHER_WALLET, {});
      expect(result.title).toBe("Fork of Original Algorithm");
      expect(result.code).toBe("function solve() {}");
    });
  });

  describe("deleteSnippet", () => {
    it("should delete snippet successfully", async () => {
      const existingSnippet = { id: "1", title: "Test" };
      (mockRepository.softDelete as jest.Mock).mockResolvedValue(existingSnippet);

      await expect(service.deleteSnippet("1")).resolves.not.toThrow();
      expect(mockRepository.softDelete).toHaveBeenCalledWith("1", null);
    });

    it("should throw error when snippet not found", async () => {
      (mockRepository.softDelete as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteSnippet("999")).rejects.toThrow(
        "Snippet not found",
      );
    });
  });
});
