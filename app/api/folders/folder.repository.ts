import { neon } from "@neondatabase/serverless";
import { CreateFolderDTO, UpdateFolderDTO } from "./folder.validator";

export class FolderRepository {
  private sql;

  constructor() {
    this.sql = neon(process.env.DATABASE_URL!);
  }

  async findByOwner(ownerWallet: string) {
    const result = await this.sql`
      SELECT f.*,
             COUNT(fs.snippet_id)::int AS snippet_count
      FROM folders f
      LEFT JOIN folder_snippets fs ON fs.folder_id = f.id
      WHERE f.owner_wallet_address = ${ownerWallet}
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `;
    return result as any[];
  }

  async findById(id: string) {
    const result = await this.sql`
      SELECT f.*,
             COUNT(fs.snippet_id)::int AS snippet_count
      FROM folders f
      LEFT JOIN folder_snippets fs ON fs.folder_id = f.id
      WHERE f.id = ${id}
      GROUP BY f.id
    `;
    return result[0] || null;
  }

  async create(data: CreateFolderDTO, ownerWallet: string) {
    const result = await this.sql`
      INSERT INTO folders (name, description, owner_wallet_address)
      VALUES (${data.name}, ${data.description ?? ""}, ${ownerWallet})
      RETURNING *
    `;
    return result[0] as any;
  }

  async update(id: string, data: UpdateFolderDTO) {
    const updatedAt = new Date();
    const result = await this.sql`
      UPDATE folders
      SET name        = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          updated_at  = ${updatedAt}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] || null;
  }

  async delete(id: string) {
    const result = await this.sql`
      DELETE FROM folders WHERE id = ${id} RETURNING *
    `;
    return result[0] || null;
  }

  async addSnippet(folderId: string, snippetId: string) {
    const result = await this.sql`
      INSERT INTO folder_snippets (folder_id, snippet_id)
      VALUES (${folderId}, ${snippetId})
      ON CONFLICT (folder_id, snippet_id) DO NOTHING
      RETURNING *
    `;
    return result[0] || null;
  }

  async removeSnippet(folderId: string, snippetId: string) {
    const result = await this.sql`
      DELETE FROM folder_snippets
      WHERE folder_id = ${folderId} AND snippet_id = ${snippetId}
      RETURNING *
    `;
    return result[0] || null;
  }

  async getSnippets(folderId: string) {
    const result = await this.sql`
      SELECT s.*
      FROM snippets s
      JOIN folder_snippets fs ON fs.snippet_id = s.id
      WHERE fs.folder_id = ${folderId}
        AND s.is_deleted = false
      ORDER BY fs.added_at DESC
    `;
    return result as any[];
  }

  async isOwner(folderId: string, walletAddress: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 1 FROM folders
      WHERE id = ${folderId} AND owner_wallet_address = ${walletAddress}
    `;
    return result.length > 0;
  }

  async snippetBelongsToFolder(folderId: string, snippetId: string): Promise<boolean> {
    const result = await this.sql`
      SELECT 1 FROM folder_snippets
      WHERE folder_id = ${folderId} AND snippet_id = ${snippetId}
    `;
    return result.length > 0;
  }
}
