import { neon } from "@neondatabase/serverless";
import { CreateCollectionDTO, UpdateCollectionDTO } from "./collection.validator";

export class CollectionRepository {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  async findByOwner(ownerWallet: string) {
    const result = await this.sql`
      SELECT c.*,
             COUNT(cs.snippet_id)::int AS snippet_count
      FROM collections c
      LEFT JOIN collection_snippets cs ON cs.collection_id = c.id
      WHERE c.owner_wallet_address = ${ownerWallet}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    return result as any[];
  }

  async findPublic() {
    const result = await this.sql`
      SELECT c.*,
             COUNT(cs.snippet_id)::int AS snippet_count
      FROM collections c
      LEFT JOIN collection_snippets cs ON cs.collection_id = c.id
      WHERE c.is_public = true
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    return result as any[];
  }

  async findById(id: string) {
    const result = await this.sql`
      SELECT c.*,
             COUNT(cs.snippet_id)::int AS snippet_count
      FROM collections c
      LEFT JOIN collection_snippets cs ON cs.collection_id = c.id
      WHERE c.id = ${id}
      GROUP BY c.id
    `;
    return result[0] || null;
  }

  async create(
    data: CreateCollectionDTO,
    ownerWallet: string,
    onChainTxHash?: string,
    onChainLedger?: number,
    anchor?: string,
  ) {
    const tagsJson = JSON.stringify(data.tags ?? []);
    const result = await this.sql`
      INSERT INTO collections (title, description, tags, owner_wallet_address, is_public, on_chain_tx_hash, on_chain_ledger, on_chain_anchor)
      VALUES (
        ${data.title},
        ${data.description ?? ""},
        ${tagsJson}::jsonb,
        ${ownerWallet},
        ${data.isPublic ?? false},
        ${onChainTxHash ?? null},
        ${onChainLedger ?? null},
        ${anchor ?? null}
      )
      RETURNING *
    `;
    return result[0] as any;
  }

  async update(id: string, data: UpdateCollectionDTO) {
    const updatedAt = new Date();
    const result = await this.sql`
      UPDATE collections
      SET title       = COALESCE(${data.title ?? null}, title),
          description = COALESCE(${data.description ?? null}, description),
          tags        = COALESCE(${data.tags ? JSON.stringify(data.tags) : null}::jsonb, tags),
          is_public   = COALESCE(${data.isPublic ?? null}, is_public),
          updated_at  = ${updatedAt}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] || null;
  }

  async delete(id: string) {
    const result = await this.sql`
      DELETE FROM collections WHERE id = ${id} RETURNING *
    `;
    return result[0] || null;
  }

  async addSnippet(collectionId: string, snippetId: string) {
    const result = await this.sql`
      INSERT INTO collection_snippets (collection_id, snippet_id)
      VALUES (${collectionId}, ${snippetId})
      ON CONFLICT (collection_id, snippet_id) DO NOTHING
      RETURNING *
    `;
    return result[0] || null;
  }

  async removeSnippet(collectionId: string, snippetId: string) {
    const result = await this.sql`
      DELETE FROM collection_snippets
      WHERE collection_id = ${collectionId} AND snippet_id = ${snippetId}
      RETURNING *
    `;
    return result[0] || null;
  }

  async getSnippets(collectionId: string) {
    const result = await this.sql`
      SELECT s.*
      FROM snippets s
      JOIN collection_snippets cs ON cs.snippet_id = s.id
      WHERE cs.collection_id = ${collectionId}
        AND s.is_deleted = false
      ORDER BY cs.added_at DESC
    `;
    return result as any[];
  }

  async isOwner(collectionId: string, walletAddress: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 1 FROM collections
      WHERE id = ${collectionId} AND owner_wallet_address = ${walletAddress}
    `;
    return result.length > 0;
  }

  async snippetBelongsToCollection(collectionId: string, snippetId: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 1 FROM collection_snippets
      WHERE collection_id = ${collectionId} AND snippet_id = ${snippetId}
    `;
    return result.length > 0;
  }
}
