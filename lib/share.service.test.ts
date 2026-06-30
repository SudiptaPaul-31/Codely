import { ShareService } from "../app/api/snippets/share.service";
import { ShareRepository, CreateShareDTO } from "../app/api/snippets/share.repository";
import { SnippetRepository } from "../app/api/snippets/snippet.repository";

const mockShareRepository = {
  generateSecureToken: jest.fn(() => "test-token-123"),
  createShare: jest.fn(),
  findByToken: jest.fn(),
  findActiveShareBySnippet: jest.fn(),
  revokeShare: jest.fn(),
  revokeByToken: jest.fn(),
  getShareDetails: jest.fn(),
} as unknown as ShareRepository;

const mockSnippetRepository = {
  findAll: jest.fn(),
  search: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  findDeletedByUser: jest.fn(),
  findAllDeleted: jest.fn(),
  permanentlyDelete: jest.fn(),
} as unknown as SnippetRepository;

let consoleSpy: jest.SpyInstance;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleSpy.mockRestore();
});

describe("ShareService", () => {
  let service: ShareService;

  beforeEach(() => {
    service = new ShareService(mockShareRepository, mockSnippetRepository);
    jest.clearAllMocks();
  });

  describe("createShareLink", () => {
    it("should throw error when snippet not found", async () => {
      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createShareLink({
          snippetId: "non-existent",
          createdByWalletAddress: "G1234567890123456789012345678901234567890123456789012345",
        }),
      ).rejects.toThrow("Snippet not found");
    });

    it("should return existing share if one exists", async () => {
      const existingShare = {
        id: "1",
        snippet_id: "1",
        share_token: "existing-token",
        is_read_only: true,
        expires_at: null,
        created_by_wallet_address: "G1234567890123456789012345678901234567890123456789012345",
        revoked_at: null,
        revoked_by_wallet_address: null,
        created_at: new Date().toISOString(),
      };
      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue({ id: "1" });
      (mockShareRepository.findActiveShareBySnippet as jest.Mock).mockResolvedValue(
        existingShare,
      );

      const result = await service.createShareLink({
        snippetId: "1",
        createdByWalletAddress: "G1234567890123456789012345678901234567890123456789012345",
      });

      expect(result.shareToken).toBe("existing-token");
      expect(result.isReadOnly).toBe(true);
    });

    it("should create new share link when none exists", async () => {
      const newShare = {
        id: "1",
        snippet_id: "1",
        share_token: "test-token-123",
        is_read_only: true,
        expires_at: null,
        created_by_wallet_address: "G1234567890123456789012345678901234567890123456789012345",
        revoked_at: null,
        revoked_by_wallet_address: null,
        created_at: new Date().toISOString(),
      };
      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue({ id: "1" });
      (mockShareRepository.findActiveShareBySnippet as jest.Mock).mockResolvedValue(
        null,
      );
      (mockShareRepository.createShare as jest.Mock).mockResolvedValue(newShare);

      const result = await service.createShareLink({
        snippetId: "1",
        isReadOnly: true,
        createdByWalletAddress: "G1234567890123456789012345678901234567890123456789012345",
      });

      expect(result.shareToken).toBe("test-token-123");
      expect(result.isReadOnly).toBe(true);
      expect(mockShareRepository.createShare).toHaveBeenCalled();
    });
  });

  describe("getSharedSnippet", () => {
    it("should return null when share token not found", async () => {
      (mockShareRepository.findByToken as jest.Mock).mockResolvedValue(null);

      const result = await service.getSharedSnippet("invalid-token");

      expect(result).toBeNull();
    });

    it("should return snippet when share token is valid", async () => {
      const share = {
        id: "1",
        snippet_id: "1",
        share_token: "valid-token",
        is_read_only: true,
        expires_at: null,
        created_by_wallet_address: "G1234567890123456789012345678901234567890123456789012345",
        revoked_at: null,
        revoked_by_wallet_address: null,
        created_at: new Date().toISOString(),
      };
      const snippet = { id: "1", title: "Test Snippet" };

      (mockShareRepository.findByToken as jest.Mock).mockResolvedValue(share);
      (mockSnippetRepository.findById as jest.Mock).mockResolvedValue(snippet);

      const result = await service.getSharedSnippet("valid-token");

      expect(result).toEqual({ snippet, isReadOnly: true });
    });
  });

  describe("revokeShare", () => {
    it("should throw error when no active share exists", async () => {
      (mockShareRepository.findActiveShareBySnippet as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.revokeShare("1", "G1234567890123456789012345678901234567890123456789012345"),
      ).rejects.toThrow("No active share link found for this snippet");
    });

    it("should revoke share successfully", async () => {
      const existingShare = {
        id: "1",
        snippet_id: "1",
        share_token: "existing-token",
        is_read_only: true,
        expires_at: null,
        created_by_wallet_address: "G1234567890123456789012345678901234567890123456789012345",
        revoked_at: null,
        revoked_by_wallet_address: null,
        created_at: new Date().toISOString(),
      };
      (mockShareRepository.findActiveShareBySnippet as jest.Mock).mockResolvedValue(
        existingShare,
      );
      (mockShareRepository.revokeShare as jest.Mock).mockResolvedValue(true);

      const result = await service.revokeShare(
        "1",
        "G1234567890123456789012345678901234567890123456789012345",
      );

      expect(result).toBe(true);
    });
  });
});