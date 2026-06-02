import { neon } from "@neondatabase/serverless";

// Initialise the Neon DB client
const sql = neon(process.env.DATABASE_URL!);

/** Extract the client IP address from request headers.
 * Supports the standard `x-forwarded-for` header (used when behind a reverse proxy)
 * and the `x-real-ip` fallback. Returns `null` if no IP information is present.
 */
export function extractIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // The header may contain a comma‑separated list; the first entry is the client IP.
    return forwarded.split(",")[0].trim();
  }
  const realIp = headers.get("x-real-ip");
  return realIp ?? null;
}

/** Extract the User‑Agent string from request headers. */
export function extractUserAgent(headers: Headers): string | null {
  return headers.get("user-agent") ?? null;
}

/** Action identifiers for activity logging. Extend this union when adding new events. */
export type ActivityAction =
  | "snippet.created"
  | "snippet.updated"
  | "snippet.deleted"
  | "snippet.soft_deleted"
  | "snippet.restored"
  | "wallet.connected"
  | "wallet.disconnected";

/** Resource types that can be referenced by a log entry. */
export type ResourceType = "snippet" | "wallet";

/** Append an immutable activity log entry.
 * This function performs **only** an INSERT – it never updates or deletes rows.
 * Errors are caught and logged so that log failures never interrupt the primary
 * business logic (fire‑and‑forget semantics).
 */
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
    await sql`
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
  } catch (err) {
    console.error("[ActivityLog] Failed to write log entry:", err);
    // Swallow the error – logging must not block the main operation.
  }
}
