import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export interface LogQueryOptions {
  page: number;
  pageSize: number;
  action?: string;
  actorWallet?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string; // ISO date string
  to?: string;   // ISO date string
}

export interface ActivityLogRow {
  id: string;
  actor_wallet: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PaginatedLogs {
  data: ActivityLogRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class LogRepository {
  /**
   * Query activity logs with optional filters and pagination.
   * All filtering is done via parameterised queries to prevent SQL injection.
   */
  async findAll(opts: LogQueryOptions): Promise<PaginatedLogs> {
    const { page, pageSize, action, actorWallet, resourceType, resourceId, from, to } = opts;
    const offset = (page - 1) * pageSize;

    // Build WHERE clauses dynamically using neon's tagged template
    // We collect conditions as booleans and pass values as parameters
    const actionFilter      = action       ?? null;
    const actorFilter       = actorWallet  ?? null;
    const resourceTypeFilter = resourceType ?? null;
    const resourceIdFilter  = resourceId   ?? null;
    const fromFilter        = from ? new Date(from) : null;
    const toFilter          = to   ? new Date(to)   : null;

    // Count query
    const countResult = await sql`
      SELECT COUNT(*) AS total
      FROM activity_logs
      WHERE
        (${actionFilter}::text       IS NULL OR action        = ${actionFilter})
        AND (${actorFilter}::text    IS NULL OR actor_wallet  = ${actorFilter})
        AND (${resourceTypeFilter}::text IS NULL OR resource_type = ${resourceTypeFilter})
        AND (${resourceIdFilter}::text   IS NULL OR resource_id   = ${resourceIdFilter})
        AND (${fromFilter}::timestamptz  IS NULL OR created_at   >= ${fromFilter})
        AND (${toFilter}::timestamptz    IS NULL OR created_at   <= ${toFilter})
    `;

    const total = parseInt((countResult[0] as any)?.total ?? "0", 10);

    // Data query
    const rows = await sql`
      SELECT
        id, actor_wallet, action, resource_type, resource_id,
        metadata, ip_address, user_agent, created_at
      FROM activity_logs
      WHERE
        (${actionFilter}::text       IS NULL OR action        = ${actionFilter})
        AND (${actorFilter}::text    IS NULL OR actor_wallet  = ${actorFilter})
        AND (${resourceTypeFilter}::text IS NULL OR resource_type = ${resourceTypeFilter})
        AND (${resourceIdFilter}::text   IS NULL OR resource_id   = ${resourceIdFilter})
        AND (${fromFilter}::timestamptz  IS NULL OR created_at   >= ${fromFilter})
        AND (${toFilter}::timestamptz    IS NULL OR created_at   <= ${toFilter})
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const data = rows as ActivityLogRow[];

    return {
      data,
      total,
      page,
      pageSize,
      hasMore: offset + data.length < total,
    };
  }
}
