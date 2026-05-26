import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

export type ActivityAction = "DELETE" | "RESTORE" | "CREATE" | "UPDATE";

export interface ActivityLogEntry {
  id: string;
  snippetId: string;
  action: ActivityAction;
  userWalletAddress: string | null;
  details: Record<string, any>;
  createdAt: Date;
}

export class ActivityLogger {
  /**
   * Log an activity action for audit trail
   */
  static async log(
    snippetId: string,
    action: ActivityAction,
    userWalletAddress: string | null = null,
    details: Record<string, any> = {},
  ): Promise<ActivityLogEntry> {
    try {
      const id = crypto.randomUUID();
      const createdAt = new Date();

      const result = await sql`
        INSERT INTO activity_logs (id, snippet_id, action, user_wallet_address, details, created_at)
        VALUES (${id}, ${snippetId}, ${action}, ${userWalletAddress}, ${JSON.stringify(details)}, ${createdAt})
        RETURNING *
      `;

      console.log(`[ActivityLog] ${action} logged for snippet ${snippetId}`, {
        id,
        userWalletAddress,
        details,
      });

      return {
        id: result[0].id,
        snippetId: result[0].snippet_id,
        action: result[0].action,
        userWalletAddress: result[0].user_wallet_address,
        details: result[0].details,
        createdAt: result[0].created_at,
      };
    } catch (error) {
      console.error("[ActivityLog] Error logging activity:", error);
      throw error;
    }
  }

  /**
   * Get activity history for a snippet
   */
  static async getSnippetHistory(
    snippetId: string,
    limit: number = 50,
  ): Promise<ActivityLogEntry[]> {
    try {
      const result = await sql`
        SELECT * FROM activity_logs
        WHERE snippet_id = ${snippetId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return result.map((row: any) => ({
        id: row.id,
        snippetId: row.snippet_id,
        action: row.action,
        userWalletAddress: row.user_wallet_address,
        details: row.details,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error("[ActivityLog] Error fetching activity history:", error);
      throw error;
    }
  }

  /**
   * Get activity logs for a user
   */
  static async getUserActivity(
    userWalletAddress: string,
    limit: number = 100,
  ): Promise<ActivityLogEntry[]> {
    try {
      const result = await sql`
        SELECT * FROM activity_logs
        WHERE user_wallet_address = ${userWalletAddress}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return result.map((row: any) => ({
        id: row.id,
        snippetId: row.snippet_id,
        action: row.action,
        userWalletAddress: row.user_wallet_address,
        details: row.details,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error("[ActivityLog] Error fetching user activity:", error);
      throw error;
    }
  }

  /**
   * Get all delete actions for a specific user
   */
  static async getUserDeleteActions(
    userWalletAddress: string,
    limit: number = 50,
  ): Promise<ActivityLogEntry[]> {
    try {
      const result = await sql`
        SELECT * FROM activity_logs
        WHERE user_wallet_address = ${userWalletAddress}
          AND action = 'DELETE'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return result.map((row: any) => ({
        id: row.id,
        snippetId: row.snippet_id,
        action: row.action,
        userWalletAddress: row.user_wallet_address,
        details: row.details,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error("[ActivityLog] Error fetching delete actions:", error);
      throw error;
    }
  }
}
