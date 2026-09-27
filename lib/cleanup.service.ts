import fs from "fs";
import path from "path";
import { CleanupRepository } from "./cleanup.repository";

export interface CleanupConfig {
  shareGraceDays: number;
  trashRetentionDays: number;
  backupRetentionDays: number;
  logRetentionDays: number;
}

export interface CleanupTaskResult {
  deletedCount: number;
  durationMs: number;
  error?: string;
}

export interface CleanupRunSummary {
  expiredShares: CleanupTaskResult;
  trashedSnippets: CleanupTaskResult;
  expiredSessions: CleanupTaskResult;
  backupFiles: CleanupTaskResult;
  staleLogs: CleanupTaskResult;
  totalDurationMs: number;
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  shareGraceDays: 7,
  trashRetentionDays: 30,
  backupRetentionDays: 30,
  logRetentionDays: 90,
};

const BACKUP_FILE_PATTERN = /^snippets-backup-.*\.enc$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  return Number.parseInt(value, 10);
}

export function loadCleanupConfig(env: NodeJS.ProcessEnv = process.env): CleanupConfig {
  return {
    shareGraceDays: parseNonNegativeInt(
      env.CLEANUP_SHARE_GRACE_DAYS,
      DEFAULT_CLEANUP_CONFIG.shareGraceDays,
    ),
    trashRetentionDays: parseNonNegativeInt(
      env.TRASH_RETENTION_DAYS,
      DEFAULT_CLEANUP_CONFIG.trashRetentionDays,
    ),
    backupRetentionDays: parseNonNegativeInt(
      env.BACKUP_RETENTION_DAYS,
      DEFAULT_CLEANUP_CONFIG.backupRetentionDays,
    ),
    logRetentionDays: parseNonNegativeInt(
      env.LOG_RETENTION_DAYS,
      DEFAULT_CLEANUP_CONFIG.logRetentionDays,
    ),
  };
}

export class CleanupService {
  constructor(
    private repository: CleanupRepository,
    private backupsDir?: string,
  ) {}

  async run(config: CleanupConfig = loadCleanupConfig()): Promise<CleanupRunSummary> {
    const startedAt = Date.now();

    const expiredShares = await this.runTask("purgeExpiredShares", () =>
      this.repository.deleteExpiredShares(config.shareGraceDays),
    );
    const trashedSnippets = await this.runTask("purgeTrashedSnippets", () =>
      this.repository.deleteTrashedSnippets(config.trashRetentionDays),
    );
    const expiredSessions = await this.runTask("expireAuthRecords", () =>
      this.repository.deleteExpiredAuthRecords(),
    );
    const backupFiles = await this.runTask("pruneBackupFiles", () =>
      this.pruneBackupFiles(config.backupRetentionDays),
    );
    const staleLogs = await this.runTask("pruneStaleLogs", () =>
      this.repository.pruneStaleLogs(config.logRetentionDays),
    );

    return {
      expiredShares,
      trashedSnippets,
      expiredSessions,
      backupFiles,
      staleLogs,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  pruneBackupFiles(retentionDays: number): number {
    const dir = this.backupsDir ?? path.join(process.cwd(), "backups");
    if (!fs.existsSync(dir)) return 0;

    const cutoffMs = Date.now() - retentionDays * MS_PER_DAY;
    let deletedCount = 0;

    for (const entry of fs.readdirSync(dir)) {
      if (!BACKUP_FILE_PATTERN.test(entry)) continue;

      const filePath = path.join(dir, entry);
      try {
        if (fs.statSync(filePath).mtimeMs < cutoffMs) {
          fs.unlinkSync(filePath);
          deletedCount += 1;
        }
      } catch (error) {
        console.error(`[CleanupService] Failed to prune backup file ${entry}:`, error);
      }
    }

    return deletedCount;
  }

  private async runTask(
    name: string,
    task: () => number | Promise<number>,
  ): Promise<CleanupTaskResult> {
    const startedAt = Date.now();
    try {
      const deletedCount = await task();
      console.log(
        `[CleanupService] ${name} deleted ${deletedCount} record(s) in ${Date.now() - startedAt}ms`,
      );
      return { deletedCount, durationMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CleanupService] ${name} failed after ${Date.now() - startedAt}ms:`, error);
      return { deletedCount: 0, durationMs: Date.now() - startedAt, error: message };
    }
  }
}
