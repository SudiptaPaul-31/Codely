import { TextDecoder, TextEncoder } from "util";
global.TextDecoder = TextDecoder as any;
global.TextEncoder = TextEncoder as any;
process.env.DATABASE_URL = "postgresql://user:password@host.tld/dbname";

import type { SnippetService as SnippetServiceType } from "../app/api/snippets/snippet.service";
import type { SnippetRepository as SnippetRepositoryType } from "../app/api/snippets/snippet.repository";

const { SnippetService } = require("../app/api/snippets/snippet.service");
const { SnippetRepository } = require("../app/api/snippets/snippet.repository");

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
  checkExistingIds: jest.fn(),
  getUserSnippetHashes: jest.fn(),
  createMany: jest.fn(),
} as unknown as SnippetRepositoryType;

// Suppress console.error in tests
let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("SnippetService", () => {
  let service: SnippetServiceType;

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
        ownerWalletAddress:
          "G1234567890123456789012345678901234567890123456789012345",
      };

      const expectedResult = { id: "1", ...validData };
      (mockRepository.create as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.createSnippet(validData);
      expect(result).toEqual(expectedResult);
      expect(mockRepository.create).toHaveBeenCalledWith(validData);
    });

    it("should throw error with invalid data", async () => {
      const invalidData = { title: "" };

      await expect(service.createSnippet(invalidData)).rejects.toThrow();
    });
  });

  describe("updateSnippet", () => {
    it("should update snippet with valid data", async () => {
      const updateData = { title: "Updated Title" };
      const updatedSnippet = { id: "1", title: "Updated Title" };

      (mockRepository.update as jest.Mock).mockResolvedValue(updatedSnippet);

      const result = await service.updateSnippet("1", updateData);
      expect(result).toEqual(updatedSnippet);
      expect(mockRepository.update).toHaveBeenCalledWith("1", updateData);
    });

    it("should throw error when snippet not found", async () => {
      const updateData = { title: "Updated Title" };
      (mockRepository.update as jest.Mock).mockResolvedValue(null);

      await expect(service.updateSnippet("999", updateData)).rejects.toThrow(
        "Snippet not found",
      );
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

  describe("importSnippets", () => {
    const userWallet = "G1234567890123456789012345678901234567890123456789012345";

    it("should successfully import snippets that are valid and not duplicates", async () => {
      const snippetsToImport = [
        {
          title: "Imported 1",
          code: "console.log('first');",
          language: "javascript",
          metadata: {
            description: "First import",
            tags: ["imp1"]
          }
        }
      ];

      (mockRepository.checkExistingIds as jest.Mock).mockResolvedValue([]);
      (mockRepository.getUserSnippetHashes as jest.Mock).mockResolvedValue([]);
      (mockRepository.createMany as jest.Mock).mockResolvedValue([
        {
          id: "uuid-1",
          title: "Imported 1",
          description: "First import",
          code: "console.log('first');",
          language: "javascript",
          tags: ["imp1"],
          ownerWalletAddress: userWallet
        }
      ]);

      const result = await service.importSnippets(snippetsToImport, userWallet);

      expect(result.imported).toHaveLength(1);
      expect(result.duplicates).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(mockRepository.createMany).toHaveBeenCalledTimes(1);
    });

    it("should skip duplicates and report validation errors", async () => {
      const snippetsToImport = [
        {
          // Invalid snippet (missing metadata)
          title: "Invalid",
          code: "test",
          language: "javascript"
        },
        {
          // Duplicate snippet by content
          title: "Duplicate",
          code: "console.log('duplicate');",
          language: "javascript",
          metadata: {
            description: "Duplicate",
            tags: ["dup"]
          }
        }
      ];

      (mockRepository.checkExistingIds as jest.Mock).mockResolvedValue([]);

      const crypto = require("crypto");
      const codeHash = crypto.createHash("md5").update("console.log('duplicate');").digest("hex");

      (mockRepository.getUserSnippetHashes as jest.Mock).mockResolvedValue([
        {
          id: "dup-id",
          title: "Duplicate",
          language: "javascript",
          code_hash: codeHash
        }
      ]);
      (mockRepository.createMany as jest.Mock).mockResolvedValue([]);

      const result = await service.importSnippets(snippetsToImport, userWallet);

      expect(result.imported).toHaveLength(0);
      expect(result.duplicates).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.duplicates[0].title).toBe("Duplicate");
      expect(result.errors[0].index).toBe(0);
    });
  });
});

