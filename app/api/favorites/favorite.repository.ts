import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

export class FavoriteRepository {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  // Get all favorite snippets for a user
  async getFavoritesByUser(
    walletAddress: string,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const countResult = await this.sql`
      SELECT COUNT(*) as total
      FROM favorites
      WHERE wallet_address = ${walletAddress}
    `;
    const total = Number(countResult[0]?.total || 0);

    const result = await this.sql`
      SELECT s.*
      FROM favorites f
      JOIN snippets s ON f.snippet_id = s.id
      WHERE f.wallet_address = ${walletAddress}
        AND s.is_deleted = false
      ORDER BY f.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const data = result as any[];

    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }

  // Check if a snippet is favorited by a user
  async isFavorite(walletAddress: string, snippetId: string) {
    const result = await this.sql`
      SELECT *
      FROM favorites
      WHERE wallet_address = ${walletAddress}
        AND snippet_id = ${snippetId}
    `;
    return result.length > 0;
  }

  // Toggle favorite (add if not exists, remove if exists)
  async toggleFavorite(walletAddress: string, snippetId: string) {
    const existing = await this.sql`
      SELECT *
      FROM favorites
      WHERE wallet_address = ${walletAddress}
        AND snippet_id = ${snippetId}
    `;

    if (existing.length > 0) {
      // Remove favorite
      await this.sql`
        DELETE FROM favorites
        WHERE wallet_address = ${walletAddress}
          AND snippet_id = ${snippetId}
      `;
      return { favorited: false };
    } else {
      // Add favorite
      const id = crypto.randomUUID();
      const createdAt = new Date();
      await this.sql`
        INSERT INTO favorites (id, wallet_address, snippet_id, created_at)
        VALUES (${id}, ${walletAddress}, ${snippetId}, ${createdAt})
      `;
      return { favorited: true };
    }
  }

  // Get favorite statuses for multiple snippets
  async getFavoriteStatuses(walletAddress: string, snippetIds: string[]) {
    if (snippetIds.length === 0) return {};

    const result = await this.sql`
      SELECT snippet_id
      FROM favorites
      WHERE wallet_address = ${walletAddress}
        AND snippet_id IN (${snippetIds.join(",")})
    `;

    const statuses: Record<string, boolean> = {};
    for (const row of result as any[]) {
      statuses[row.snippet_id] = true;
    }
    return statuses;
  }
}
