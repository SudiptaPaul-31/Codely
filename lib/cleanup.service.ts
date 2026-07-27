import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import os from "os";

export interface CleanupResult {
  expiredSharesDeleted: number;
  expiredSessionsDeleted: number;
  expiredNoncesDeleted: number;
  staleSnippetsDeleted: number;
  tempFilesDeleted: number;
}

export class CleanupService {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  /**
   * Run all scheduled cleanup jobs.
   */
  async run(): Promise<CleanupResult> {
    console.log("[CleanupService] Starting scheduled cleanup jobs...");
    const now = new Date();

    // 1. Clean up expired share links
    console.log("[CleanupService] Cleaning up expired share links...");
    const expiredShares = await this.sql`
      DELETE FROM snippet_shares 
      WHERE expires_at < ${now} 
      RETURNING id
    `;
    const expiredSharesDeleted = expiredShares.length;
    console.log(`[CleanupService] Deleted ${expiredSharesDeleted} expired share links.`);

    // 2. Clean up expired auth sessions
    console.log("[CleanupService] Cleaning up expired auth sessions...");
    const expiredSessions = await this.sql`
      DELETE FROM auth_sessions 
      WHERE expires_at < ${now} 
      RETURNING id
    `;
    const expiredSessionsDeleted = expiredSessions.length;
    console.log(`[CleanupService] Deleted ${expiredSessionsDeleted} expired auth sessions.`);

    // 3. Clean up expired login nonces
    console.log("[CleanupService] Cleaning up expired login nonces...");
    const expiredNonces = await this.sql`
      DELETE FROM login_nonces 
      WHERE expires_at < ${now} 
      RETURNING id
    `;
    const expiredNoncesDeleted = expiredNonces.length;
    console.log(`[CleanupService] Deleted ${expiredNoncesDeleted} expired login nonces.`);

    // 4. Clean up stale soft-deleted snippets (e.g. deleted more than X days ago)
    const thresholdDays = parseInt(process.env.CLEANUP_STALE_DELETED_SNIPPETS_DAYS || "30", 10);
    console.log(`[CleanupService] Cleaning up soft-deleted snippets older than ${thresholdDays} days...`);
    
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

    const staleSnippets = await this.sql`
      DELETE FROM snippets 
      WHERE is_deleted = true 
        AND deleted_at < ${thresholdDate} 
      RETURNING id
    `;
    const staleSnippetsDeleted = staleSnippets.length;
    console.log(`[CleanupService] Deleted ${staleSnippetsDeleted} stale soft-deleted snippets.`);

    // 5. Clean up temporary files
    const tempFileThresholdMinutes = parseInt(process.env.CLEANUP_TEMP_FILES_MINUTES || "60", 10);
    const tempDir = process.env.CLEANUP_TEMP_DIR || path.join(os.tmpdir(), "codely-imports");
    console.log(`[CleanupService] Cleaning up temporary files in ${tempDir} older than ${tempFileThresholdMinutes} minutes...`);

    const tempFileThresholdMs = tempFileThresholdMinutes * 60 * 1000;
    const tempFilesDeleted = this.cleanDirectory(tempDir, tempFileThresholdMs);
    console.log(`[CleanupService] Deleted ${tempFilesDeleted} temporary files.`);

    console.log("[CleanupService] Scheduled cleanup jobs completed successfully.");

    return {
      expiredSharesDeleted,
      expiredSessionsDeleted,
      expiredNoncesDeleted,
      staleSnippetsDeleted,
      tempFilesDeleted,
    };
  }

  /**
   * Recursively clean files in a directory that are older than ageThresholdMs.
   */
  private cleanDirectory(dirPath: string, ageThresholdMs: number): number {
    let deletedCount = 0;
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const files = fs.readdirSync(dirPath);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          deletedCount += this.cleanDirectory(filePath, ageThresholdMs);
          // If the directory is now empty, delete it
          if (fs.readdirSync(filePath).length === 0) {
            fs.rmdirSync(filePath);
          }
        } else if (now - stats.mtimeMs > ageThresholdMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        console.error(`[CleanupService] Failed to clean temporary item ${filePath}:`, err);
      }
    }

    return deletedCount;
  }
}
