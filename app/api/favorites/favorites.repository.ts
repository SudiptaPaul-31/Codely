import { neon } from "@neondatabase/serverless";

export interface PaginatedFavorites {
  data: any[];
  total: number;
  page: number;
  limit: number;
}

export class FavoritesRepository {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  async add(walletAddress: string, snippetId: string) {
    const result = await this.sql`
      INSERT INTO favorites (wallet_address, snippet_id)
      VALUES (${walletAddress}, ${snippetId})
      RETURNING *
    `;
    return result[0] || null;
  }

  async remove(walletAddress: string, snippetId: string) {
    const result = await this.sql`
      DELETE FROM favorites
      WHERE wallet_address = ${walletAddress} AND snippet_id = ${snippetId}
      RETURNING *
    `;
    return result[0] || null;
  }

  async findByWalletAndSnippet(walletAddress: string, snippetId: string) {
    const result = await this.sql`
      SELECT * FROM favorites
      WHERE wallet_address = ${walletAddress} AND snippet_id = ${snippetId}
    `;
    return result[0] || null;
  }

  async findAllByWallet(walletAddress: string, page: number, limit: number) {
    const offset = (page - 1) * limit;

    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM favorites
      WHERE wallet_address = ${walletAddress}
    `;
    const total = Number(countResult[0]?.total ?? 0);

    const result = await this.sql`
      SELECT
        f.id,
        f.favorited_at,
        s.id AS snippet_id,
        s.title,
        s.description,
        s.language,
        s.code,
        s.tags,
        s.owner_wallet_address,
        s.created_at,
        s.updated_at
      FROM favorites f
      JOIN snippets s ON s.id = f.snippet_id AND s.is_deleted = false
      WHERE f.wallet_address = ${walletAddress}
      ORDER BY f.favorited_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      data: result as any[],
      total,
      page,
      limit,
    };
  }

  async countByWallet(walletAddress: string): Promise<number> {
    const result = await this.sql`
      SELECT COUNT(*) as total FROM favorites WHERE wallet_address = ${walletAddress}
    `;
    return Number(result[0]?.total ?? 0);
  }
}
