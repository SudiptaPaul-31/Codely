import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

export type ActionType = "view" | "copy" | "share";

export interface CreateAnalyticsDTO {
  snippetId: string;
  walletAddress?: string | null;
  actionType: ActionType;
}

export interface AggregationRow {
  action_type: string;
  count: number;
}

export class AnalyticsRepository {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  async logAction(data: CreateAnalyticsDTO) {
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const walletAddress = data.walletAddress || null;

    const result = await this.sql`
      INSERT INTO snippet_analytics (id, snippet_id, wallet_address, action_type, created_at)
      VALUES (${id}, ${data.snippetId}, ${walletAddress}, ${data.actionType}, ${createdAt})
      RETURNING *
    `;
    return result[0];
  }

  async getSnippetAggregations(snippetId: string): Promise<AggregationRow[]> {
    const result = await this.sql`
      SELECT action_type, COUNT(*)::int as count
      FROM snippet_analytics
      WHERE snippet_id = ${snippetId}
      GROUP BY action_type
    `;
    return result as AggregationRow[];
  }

  async getGlobalAggregations(): Promise<AggregationRow[]> {
    const result = await this.sql`
      SELECT action_type, COUNT(*)::int as count
      FROM snippet_analytics
      GROUP BY action_type
    `;
    return result as AggregationRow[];
  }
}
