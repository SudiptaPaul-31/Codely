import { CleanupService } from "./cleanup.service";
import fs from "fs";
import path from "path";
import os from "os";

// Mock the database client
const mockSql = jest.fn();
jest.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

describe("CleanupService", () => {
  let cleanupService: CleanupService;

  beforeEach(() => {
    cleanupService = new CleanupService();
    jest.clearAllMocks();
  });

  describe("run", () => {
    it("should delete expired records and clean old temp files", async () => {
      // Mock db queries
      mockSql.mockResolvedValueOnce([{ id: "share-1" }]) // expired shares
             .mockResolvedValueOnce([{ id: "session-1" }]) // expired sessions
             .mockResolvedValueOnce([{ id: "nonce-1" }]) // expired nonces
             .mockResolvedValueOnce([{ id: "snippet-1" }]); // stale soft-deleted snippets

      // Create a temporary file to clean
      const tempDir = path.join(os.tmpdir(), "codely-imports-test");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const oldFilePath = path.join(tempDir, "old-file.txt");
      fs.writeFileSync(oldFilePath, "test data");
      
      // Backdate the modification time of the file to 2 hours ago
      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
      fs.utimesSync(oldFilePath, twoHoursAgo, twoHoursAgo);

      process.env.CLEANUP_TEMP_DIR = tempDir;

      const result = await cleanupService.run();

      expect(result.expiredSharesDeleted).toBe(1);
      expect(result.expiredSessionsDeleted).toBe(1);
      expect(result.expiredNoncesDeleted).toBe(1);
      expect(result.staleSnippetsDeleted).toBe(1);
      expect(result.tempFilesDeleted).toBe(1);

      expect(fs.existsSync(oldFilePath)).toBe(false);

      // Clean up the test temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
