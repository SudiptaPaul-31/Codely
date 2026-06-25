import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export type ActionType = 'view' | 'copy' | 'share';

export interface AnalyticsEvent {
  id: string;
  snippet_id: string;
  user_wallet: string | null;
  action_type: ActionType;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * AnalyticsRepository
 * Low-level data access for analytics
 */
class AnalyticsRepository {
  /**
   * Insert an analytics event with retry logic
   */
  async insertEvent(
    snippetId: string,
    actionType: ActionType,
    userWallet: string | null,
    ipAddress: string | null,
    userAgent: string | null,
    metadata: Record<string, unknown> = {},
    maxRetries: number = 3
  ): Promise<AnalyticsEvent> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await sql`
          INSERT INTO snippet_analytics 
          (snippet_id, user_wallet, action_type, metadata, ip_address, user_agent)
          VALUES (${snippetId}, ${userWallet}, ${actionType}, ${JSON.stringify(metadata)}, ${ipAddress}, ${userAgent})
          RETURNING *
        `;

        if (result.length === 0) {
          throw new Error('Failed to insert analytics event');
        }

        return result[0] as AnalyticsEvent;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100)
          );
        }
      }
    }

    throw new Error(
      `Failed to insert analytics event after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Get all analytics events for a snippet
   */
  async getEventsBySnippet(
    snippetId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ events: AnalyticsEvent[]; total: number }> {
    const countResult = await sql`
      SELECT COUNT(*) as total FROM snippet_analytics WHERE snippet_id = ${snippetId}
    `;
    const total = countResult[0].total as number;

    const events = await sql`
      SELECT * FROM snippet_analytics
      WHERE snippet_id = ${snippetId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { events: events as AnalyticsEvent[], total };
  }

  /**
   * Get aggregated counts by action type for a snippet
   */
  async getAggregatedCounts(
    snippetId: string
  ): Promise<Record<ActionType, number>> {
    const result = await sql`
      SELECT 
        action_type,
        COUNT(*) as count
      FROM snippet_analytics
      WHERE snippet_id = ${snippetId}
      GROUP BY action_type
    `;

    const counts: Record<ActionType, number> = {
      view: 0,
      copy: 0,
      share: 0,
    };

    for (const row of result) {
      counts[row.action_type as ActionType] = row.count;
    }

    return counts;
  }

  /**
   * Get events within a date range
   */
  async getEventsByDateRange(
    snippetId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsEvent[]> {
    const result = await sql`
      SELECT * FROM snippet_analytics
      WHERE snippet_id = ${snippetId}
        AND created_at >= ${startDate.toISOString()}
        AND created_at <= ${endDate.toISOString()}
      ORDER BY created_at DESC
    `;

    return result as AnalyticsEvent[];
  }

  /**
   * Get total count by action type across all snippets
   */
  async getGlobalActionCounts(): Promise<Record<ActionType, number>> {
    const result = await sql`
      SELECT 
        action_type,
        COUNT(*) as count
      FROM snippet_analytics
      GROUP BY action_type
    `;

    const counts: Record<ActionType, number> = {
      view: 0,
      copy: 0,
      share: 0,
    };

    for (const row of result) {
      counts[row.action_type as ActionType] = row.count;
    }

    return counts;
  }

  /**
   * Get top snippets by action count
   */
  async getTopSnippets(
    actionType: ActionType,
    limit: number = 10
  ): Promise<Array<{ snippet_id: string; title: string | null; count: number }>> {
    const result = await sql`
      SELECT
        sa.snippet_id,
        s.title,
        COUNT(*) as count
      FROM snippet_analytics sa
      LEFT JOIN snippets s ON sa.snippet_id = s.id
      WHERE sa.action_type = ${actionType}
      GROUP BY sa.snippet_id, s.title
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    return result as Array<{ snippet_id: string; title: string | null; count: number }>;
  }

  /**
   * Get user's analytics activity
   */
  async getUserActivity(
    userWallet: string
  ): Promise<Array<{ action_type: ActionType; snippet_id: string; count: number; last_action_at: string }>> {
    const result = await sql`
      SELECT
        action_type,
        snippet_id,
        COUNT(*) as count,
        MAX(created_at) as last_action_at
      FROM snippet_analytics
      WHERE user_wallet = ${userWallet}
      GROUP BY action_type, snippet_id
      ORDER BY last_action_at DESC
    `;

    return result as Array<{ action_type: ActionType; snippet_id: string; count: number; last_action_at: string }>;
  }

  /**
   * Check if a snippet has any analytics
   */
  async hasAnalytics(snippetId: string): Promise<boolean> {
    const result = await sql`
      SELECT COUNT(*) as count FROM snippet_analytics WHERE snippet_id = ${snippetId}
    `;

    return result[0].count > 0;
  }

  /**
   * Get analytics summary for batch snippets
   */
  async getBatchSummaries(
    snippetIds: string[]
  ): Promise<Array<{ snippet_id: string; views: number; copies: number; shares: number }>> {
    if (snippetIds.length === 0) {
      return [];
    }

    const result = await sql`
      SELECT
        snippet_id,
        COUNT(CASE WHEN action_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN action_type = 'copy' THEN 1 END) as copies,
        COUNT(CASE WHEN action_type = 'share' THEN 1 END) as shares
      FROM snippet_analytics
      WHERE snippet_id = ANY(${snippetIds})
      GROUP BY snippet_id
    `;

    return result as Array<{ snippet_id: string; views: number; copies: number; shares: number }>;
  }
}

export const analyticsRepository = new AnalyticsRepository();
