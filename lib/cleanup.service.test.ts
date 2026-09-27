import fs from "fs";
import os from "os";
import path from "path";
import {
  CleanupService,
  DEFAULT_CLEANUP_CONFIG,
  loadCleanupConfig,
  parseNonNegativeInt,
} from "./cleanup.service";
import { CleanupRepository } from "./cleanup.repository";

const mockRepository = {
  deleteExpiredShares: jest.fn(),
  deleteTrashedSnippets: jest.fn(),
  deleteExpiredAuthRecords: jest.fn(),
  pruneStaleLogs: jest.fn(),
} as unknown as CleanupRepository;

let consoleLogSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

beforeAll(() => {
  consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("parseNonNegativeInt", () => {
  it("returns fallback when value is undefined", () => {
    expect(parseNonNegativeInt(undefined, 7)).toBe(7);
  });

  it("returns fallback when value is blank", () => {
    expect(parseNonNegativeInt("   ", 7)).toBe(7);
  });

  it("parses valid non-negative integers", () => {
    expect(parseNonNegativeInt("14", 7)).toBe(14);
    expect(parseNonNegativeInt("0", 7)).toBe(0);
  });

  it("returns fallback for negative or non-numeric values", () => {
    expect(parseNonNegativeInt("-3", 7)).toBe(7);
    expect(parseNonNegativeInt("abc", 7)).toBe(7);
    expect(parseNonNegativeInt("3.5.5", 7)).toBe(7);
  });
});

describe("loadCleanupConfig", () => {
  it("applies defaults when env vars are unset", () => {
    expect(loadCleanupConfig({} as NodeJS.ProcessEnv)).toEqual(DEFAULT_CLEANUP_CONFIG);
  });

  it("reads thresholds from env vars when set", () => {
    const config = loadCleanupConfig({
      CLEANUP_SHARE_GRACE_DAYS: "2",
      TRASH_RETENTION_DAYS: "60",
      BACKUP_RETENTION_DAYS: "10",
      LOG_RETENTION_DAYS: "0",
    } as unknown as NodeJS.ProcessEnv);

    expect(config).toEqual({
      shareGraceDays: 2,
      trashRetentionDays: 60,
      backupRetentionDays: 10,
      logRetentionDays: 0,
    });
  });

  it("falls back to defaults for invalid env values", () => {
    const config = loadCleanupConfig({
      CLEANUP_SHARE_GRACE_DAYS: "soon",
      TRASH_RETENTION_DAYS: "-5",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.shareGraceDays).toBe(DEFAULT_CLEANUP_CONFIG.shareGraceDays);
    expect(config.trashRetentionDays).toBe(DEFAULT_CLEANUP_CONFIG.trashRetentionDays);
  });
});

describe("CleanupService.run", () => {
  let service: CleanupService;

  beforeEach(() => {
    service = new CleanupService(mockRepository, os.tmpdir());
    jest.clearAllMocks();
  });

  it("runs every task and reports per-task counts and durations", async () => {
    (mockRepository.deleteExpiredShares as jest.Mock).mockResolvedValue(3);
    (mockRepository.deleteTrashedSnippets as jest.Mock).mockResolvedValue(1);
    (mockRepository.deleteExpiredAuthRecords as jest.Mock).mockResolvedValue(9);
    (mockRepository.pruneStaleLogs as jest.Mock).mockResolvedValue(25);

    const summary = await service.run({
      shareGraceDays: 7,
      trashRetentionDays: 30,
      backupRetentionDays: 30,
      logRetentionDays: 90,
    });

    expect(summary.expiredShares.deletedCount).toBe(3);
    expect(summary.trashedSnippets.deletedCount).toBe(1);
    expect(summary.expiredSessions.deletedCount).toBe(9);
    expect(summary.staleLogs.deletedCount).toBe(25);
    expect(summary.backupFiles.deletedCount).toBeGreaterThanOrEqual(0);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    for (const task of [
      summary.expiredShares,
      summary.trashedSnippets,
      summary.expiredSessions,
      summary.backupFiles,
      summary.staleLogs,
    ]) {
      expect(task.durationMs).toBeGreaterThanOrEqual(0);
      expect(task.error).toBeUndefined();
    }

    expect(mockRepository.deleteExpiredShares).toHaveBeenCalledWith(7);
    expect(mockRepository.deleteTrashedSnippets).toHaveBeenCalledWith(30);
    expect(mockRepository.pruneStaleLogs).toHaveBeenCalledWith(90);
  });

  it("continues remaining tasks when one fails, reporting the error in the summary", async () => {
    (mockRepository.deleteExpiredShares as jest.Mock).mockRejectedValue(
      new Error("connection refused"),
    );
    (mockRepository.deleteTrashedSnippets as jest.Mock).mockResolvedValue(4);
    (mockRepository.deleteExpiredAuthRecords as jest.Mock).mockResolvedValue(2);
    (mockRepository.pruneStaleLogs as jest.Mock).mockResolvedValue(6);

    const summary = await service.run({
      shareGraceDays: 7,
      trashRetentionDays: 30,
      backupRetentionDays: 30,
      logRetentionDays: 90,
    });

    expect(summary.expiredShares.error).toBe("connection refused");
    expect(summary.expiredShares.deletedCount).toBe(0);
    expect(summary.trashedSnippets.deletedCount).toBe(4);
    expect(summary.expiredSessions.deletedCount).toBe(2);
    expect(summary.staleLogs.deletedCount).toBe(6);
  });
});

describe("CleanupService.pruneBackupFiles", () => {
  const realFs = fs;
  let backupsDir: string;
  let service: CleanupService;

  beforeEach(() => {
    backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codely-backups-test-"));
    service = new CleanupService(mockRepository, backupsDir);
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  function createBackupFile(name: string, ageDaysAgo?: number) {
    const filePath = path.join(backupsDir, name);
    realFs.writeFileSync(filePath, "encrypted");
    if (ageDaysAgo !== undefined) {
      const past = new Date(Date.now() - ageDaysAgo * 24 * 60 * 60 * 1000);
      realFs.utimesSync(filePath, past, past);
    }
  }

  it("deletes only backup files older than retention that match the naming pattern", () => {
    createBackupFile("snippets-backup-2026-01-01T00-00-00-000Z.enc", 40);
    createBackupFile("snippets-backup-2026-08-01T00-00-00-000Z.enc", 1);
    createBackupFile("unrelated-old-file.enc", 40);
    createBackupFile("snippets-backup-no-extension.txt", 40);

    const deleted = service.pruneBackupFiles(30);

    expect(deleted).toBe(1);
    expect(fs.existsSync(path.join(backupsDir, "snippets-backup-2026-01-01T00-00-00-000Z.enc"))).toBe(false);
    expect(fs.existsSync(path.join(backupsDir, "snippets-backup-2026-08-01T00-00-00-000Z.enc"))).toBe(true);
    expect(fs.existsSync(path.join(backupsDir, "unrelated-old-file.enc"))).toBe(true);
    expect(fs.existsSync(path.join(backupsDir, "snippets-backup-no-extension.txt"))).toBe(true);
  });

  it("keeps files inside the retention window and deletes files past it", () => {
    createBackupFile("snippets-backup-inside-window.enc", 30 - 1 / 24);
    createBackupFile("snippets-backup-past-window.enc", 30 + 1 / 24);

    const deleted = service.pruneBackupFiles(30);

    expect(deleted).toBe(1);
    expect(fs.existsSync(path.join(backupsDir, "snippets-backup-inside-window.enc"))).toBe(true);
    expect(fs.existsSync(path.join(backupsDir, "snippets-backup-past-window.enc"))).toBe(false);
  });

  it("returns 0 when the backups directory does not exist", () => {
    const missingDir = path.join(backupsDir, "does-not-exist");
    const isolatedService = new CleanupService(mockRepository, missingDir);

    expect(isolatedService.pruneBackupFiles(30)).toBe(0);
  });
});
