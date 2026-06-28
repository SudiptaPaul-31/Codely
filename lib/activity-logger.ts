import { neon } from "@neondatabase/serverless";

// Lazy initialize sql only when needed
let sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
}

export type ActivityAction =
  | "DELETE"
  | "RESTORE"
  | "CREATE"
  | "UPDATE"
  | "SHARE"
  | "REVOKESHARE"
  | "snippet.created"
  | "snippet.updated"
  | "snippet.deleted"
  | "snippet.soft_deleted"
  | "snippet.restored"
  | "wallet.connected"
  | "wallet.disconnected"
  | "signature.verified"
  | "signature.failed";

export interface ActivityLogEntry {
  id: string;
  snippetId: string;
  action: string;
  userWalletAddress: string | null;
  details: Record<string, any>;
  createdAt: Date;
}

export class ActivityLogger {
  static async log(
    snippetId: string,
    action: string,
    userWalletAddress: string | null = null,
    details: Record<string, any> = {},
  ): Promise<ActivityLogEntry> {
    try {
      const id = crypto.randomUUID();
      const createdAt = new Date();
      const db = getSql();

      if (!db) {
        console.log(`[ActivityLog] ${action} logged for snippet ${snippetId} (no DB)`, {
          id,
          userWalletAddress,
          details,
        });
        return {
          id,
          snippetId,
          action,
          userWalletAddress,
          details,
          createdAt,
        };
      }

      const result = await db`
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
}

export function extractIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export function extractUserAgent(headers: Headers): string | null {
  return headers.get("user-agent") ?? null;
}

export type ResourceType = "snippet" | "wallet";

export async function appendActivityLog(
  action: ActivityAction,
  resourceType: ResourceType,
  ctx: {
    actorWallet?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  const {
    actorWallet = null,
    resourceId = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
  } = ctx;

  try {
    const db = getSql();
    if (db) {
      await db`
        INSERT INTO activity_logs (
          actor_wallet,
          action,
          resource_type,
          resource_id,
          metadata,
          ip_address,
          user_agent
        ) VALUES (
          ${actorWallet},
          ${action},
          ${resourceType},
          ${resourceId},
          ${JSON.stringify(metadata)}::jsonb,
          ${ipAddress},
          ${userAgent}
        )`;
    }
  } catch (err) {
    console.error("[ActivityLog] Failed to write log entry:", err);
  }
}
