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

export interface AnalyticsAggregation {
  action_type: ActionType;
  count: number;
}

export interface SnippetAnalyticsSummary {
  snippet_id: string;
  total_views: number;
  total_copies: number;
  total_shares: number;
  first_action_at: string | null;
  last_action_at: string | null;
  unique_users: number;
}

export interface UserAnalyticsActivity {
  action_type: ActionType;
  snippet_id: string;
  snippet_title: string | null;
  count: number;
  last_action_at: string;
}

export interface GlobalAnalyticsSummary {
  total_events: number;
  total_snippets_viewed: number;
  total_actions_by_type: AnalyticsAggregation[];
  most_viewed_snippets: Array<{
    snippet_id: string;
    title: string | null;
    view_count: number;
  }>;
  most_copied_snippets: Array<{
    snippet_id: string;
    title: string | null;
    copy_count: number;
  }>;
  most_shared_snippets: Array<{
    snippet_id: string;
    title: string | null;
    share_count: number;
  }>;
}

/**
 * AnalyticsService
 * Handles logging and querying of snippet analytics data
 */
class AnalyticsService {
  /**
   * Log a snippet action (view, copy, share)
   * Includes retry logic for failed inserts
   */
  async logAction(
    snippetId: string,
    actionType: ActionType,
    userWallet: string | null,
    ipAddress: string | null,
    userAgent: string | null,
    metadata: Record<string, unknown> = {}
  ): Promise<AnalyticsEvent> {
    const maxRetries = 3;
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
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100)
          );
        }
      }
    }

    throw new Error(
      `Failed to log analytics event after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Get aggregated analytics for a specific snippet
   */
  async getSnippetAnalytics(
    snippetId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AnalyticsAggregation[]> {
    const whereClause = startDate && endDate 
      ? `WHERE snippet_id = ${snippetId} AND created_at BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}`
      : `WHERE snippet_id = ${snippetId}`;

    const result = await sql`
      SELECT 
        action_type,
        COUNT(*) as count
      FROM snippet_analytics
      ${startDate && endDate 
        ? sql`WHERE snippet_id = ${snippetId} AND created_at BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}`
        : sql`WHERE snippet_id = ${snippetId}`}
      GROUP BY action_type
      ORDER BY action_type
    `;

    return result as AnalyticsAggregation[];
  }

  /**
   * Get comprehensive analytics summary for a snippet
   */
  async getSnippetAnalyticsSummary(
    snippetId: string
  ): Promise<SnippetAnalyticsSummary | null> {
    const result = await sql`
      SELECT
        snippet_id,
        COUNT(CASE WHEN action_type = 'view' THEN 1 END) as total_views,
        COUNT(CASE WHEN action_type = 'copy' THEN 1 END) as total_copies,
        COUNT(CASE WHEN action_type = 'share' THEN 1 END) as total_shares,
        MIN(created_at) as first_action_at,
        MAX(created_at) as last_action_at,
        COUNT(DISTINCT user_wallet) as unique_users
      FROM snippet_analytics
      WHERE snippet_id = ${snippetId}
      GROUP BY snippet_id
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0] as SnippetAnalyticsSummary;
  }

  /**
   * Get analytics for a user across all snippets
   */
  async getUserAnalyticsActivity(
    userWallet: string
  ): Promise<UserAnalyticsActivity[]> {
    const result = await sql`
      SELECT
        sa.action_type,
        sa.snippet_id,
        s.title as snippet_title,
        COUNT(*) as count,
        MAX(sa.created_at) as last_action_at
      FROM snippet_analytics sa
      LEFT JOIN snippets s ON sa.snippet_id = s.id
      WHERE sa.user_wallet = ${userWallet}
      GROUP BY sa.action_type, sa.snippet_id, s.title
      ORDER BY last_action_at DESC
    `;

    return result as UserAnalyticsActivity[];
  }

  /**
   * Get global analytics summary for dashboard
   */
  async getGlobalAnalyticsSummary(): Promise<GlobalAnalyticsSummary> {
    // Total events
    const totalEventsResult = await sql`
      SELECT COUNT(*) as total FROM snippet_analytics
    `;
    const totalEvents = totalEventsResult[0].total as number;

    // Total snippets viewed
    const snippetsViewedResult = await sql`
      SELECT COUNT(DISTINCT snippet_id) as count FROM snippet_analytics 
      WHERE action_type = 'view'
    `;
    const totalSnippetsViewed = snippetsViewedResult[0].count as number;

    // Actions by type
    const actionsByTypeResult = await sql`
      SELECT 
        action_type,
        COUNT(*) as count
      FROM snippet_analytics
      GROUP BY action_type
      ORDER BY count DESC
    `;
    const totalActionsByType = actionsByTypeResult as AnalyticsAggregation[];

    // Most viewed snippets
    const mostViewedResult = await sql`
      SELECT
        sa.snippet_id,
        s.title,
        COUNT(*) as view_count
      FROM snippet_analytics sa
      LEFT JOIN snippets s ON sa.snippet_id = s.id
      WHERE sa.action_type = 'view'
      GROUP BY sa.snippet_id, s.title
      ORDER BY view_count DESC
      LIMIT 10
    `;

    // Most copied snippets
    const mostCopiedResult = await sql`
      SELECT
        sa.snippet_id,
        s.title,
        COUNT(*) as copy_count
      FROM snippet_analytics sa
      LEFT JOIN snippets s ON sa.snippet_id = s.id
      WHERE sa.action_type = 'copy'
      GROUP BY sa.snippet_id, s.title
      ORDER BY copy_count DESC
      LIMIT 10
    `;

    // Most shared snippets
    const mostSharedResult = await sql`
      SELECT
        sa.snippet_id,
        s.title,
        COUNT(*) as share_count
      FROM snippet_analytics sa
      LEFT JOIN snippets s ON sa.snippet_id = s.id
      WHERE sa.action_type = 'share'
      GROUP BY sa.snippet_id, s.title
      ORDER BY share_count DESC
      LIMIT 10
    `;

    return {
      total_events: totalEvents,
      total_snippets_viewed: totalSnippetsViewed,
      total_actions_by_type: totalActionsByType,
      most_viewed_snippets: mostViewedResult as Array<{
        snippet_id: string;
        title: string | null;
        view_count: number;
      }>,
      most_copied_snippets: mostCopiedResult as Array<{
        snippet_id: string;
        title: string | null;
        copy_count: number;
      }>,
      most_shared_snippets: mostSharedResult as Array<{
        snippet_id: string;
        title: string | null;
        share_count: number;
      }>,
    };
  }

  /**
   * Get analytics for multiple snippets (for batch operations)
   */
  async getMultipleSnippetsAnalytics(
    snippetIds: string[]
  ): Promise<Map<string, AnalyticsAggregation[]>> {
    if (snippetIds.length === 0) {
      return new Map();
    }

    const result = await sql`
      SELECT 
        snippet_id,
        action_type,
        COUNT(*) as count
      FROM snippet_analytics
      WHERE snippet_id = ANY(${snippetIds})
      GROUP BY snippet_id, action_type
      ORDER BY snippet_id, action_type
    `;

    const analyticsMap = new Map<string, AnalyticsAggregation[]>();
    
    for (const snippetId of snippetIds) {
      analyticsMap.set(
        snippetId,
        result.filter((r) => r.snippet_id === snippetId) as AnalyticsAggregation[]
      );
    }

    return analyticsMap;
  }

  /**
   * Get time-series analytics data for a snippet
   */
  async getSnippetAnalyticsTimeSeries(
    snippetId: string,
    intervalDays: number = 7
  ): Promise<Array<{ date: string; views: number; copies: number; shares: number }>> {
    const result = await sql`
      SELECT
        DATE(created_at) as date,
        COUNT(CASE WHEN action_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN action_type = 'copy' THEN 1 END) as copies,
        COUNT(CASE WHEN action_type = 'share' THEN 1 END) as shares
      FROM snippet_analytics
      WHERE 
        snippet_id = ${snippetId}
        AND created_at >= now() - INTERVAL '${intervalDays} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    return result as Array<{ date: string; views: number; copies: number; shares: number }>;
  }
}

export const analyticsService = new AnalyticsService();
