import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { CreateSnippetDTO, UpdateSnippetDTO } from "./snippet.validator";

// Pagination options interface
export interface PaginationOptions {
  limit: number;
  offset: number;
}

// Paginated result interface
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export class SnippetRepository {
  private sql;

  constructor() {
    // Initialize the database connection
    this.sql = neon(process.env.DATABASE_URL!);
  }

  async findAll(options?: PaginationOptions) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Get total count for pagination metadata (excluding soft-deleted)
    const countResult = await this.sql`SELECT COUNT(*) as total FROM snippets WHERE is_deleted = false`;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated snippets with consistent ordering by created_at DESC (excluding soft-deleted)
    const result = await this.sql`
      SELECT * FROM snippets 
      WHERE is_deleted = false
      ORDER BY created_at DESC 
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

  async findById(id: string) {
    const result = await this.sql`
      SELECT * FROM snippets WHERE id = ${id} AND is_deleted = false
    `;
    return result[0] || null;
  }

  async create(data: CreateSnippetDTO) {
    const id = crypto.randomUUID();
    const createdAt = new Date();

    const result = await this.sql`
      INSERT INTO snippets (id, title, description, code, language, tags, owner_wallet_address, created_at, updated_at) 
      VALUES (${id}, ${data.title}, ${data.description}, ${data.code}, ${data.language}, ${data.tags}, ${data.ownerWalletAddress}, ${createdAt}, ${createdAt}) 
      RETURNING *
    `;
    return result[0];
  }

  async update(id: string, data: UpdateSnippetDTO) {
    const updatedAt = new Date();

    // Build dynamic update query using tagged template
    const updates: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      updates.push("title = ${value}");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push("description = ${value}");
      values.push(data.description);
    }
    if (data.code !== undefined) {
      updates.push("code = ${value}");
      values.push(data.code);
    }
    if (data.language !== undefined) {
      updates.push("language = ${value}");
      values.push(data.language);
    }
    if (data.tags !== undefined) {
      updates.push("tags = ${value}");
      values.push(data.tags);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    // Build the SET clause with proper parameter placeholders
    const setClause = updates.join(", ");

    // Use raw SQL for dynamic updates
    const result = await this.sql`
      UPDATE snippets 
      SET title = COALESCE(${data.title}, title),
          description = COALESCE(${data.description}, description),
          code = COALESCE(${data.code}, code),
          language = COALESCE(${data.language}, language),
          tags = COALESCE(${data.tags}, tags),
          updated_at = ${updatedAt}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] || null;
  }

  async delete(id: string) {
    const result = await this.sql`
      DELETE FROM snippets WHERE id = ${id} RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Soft delete: mark snippet as deleted without removing data
   */
  async softDelete(id: string, deletedBy: string | null = null) {
    const deletedAt = new Date();

    const result = await this.sql`
      UPDATE snippets 
      SET is_deleted = true, deleted_at = ${deletedAt}, deleted_by = ${deletedBy}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Restore a soft-deleted snippet
   */
  async restore(id: string) {
    const result = await this.sql`
      UPDATE snippets 
      SET is_deleted = false, deleted_at = null, deleted_by = null
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] || null;
  }

  /**
   * Get all soft-deleted snippets for a user (trash view)
   */
  async findDeletedByUser(
    userWalletAddress: string,
    options?: PaginationOptions,
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Get total count
    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM snippets 
      WHERE is_deleted = true AND owner_wallet_address = ${userWalletAddress}
    `;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated deleted snippets
    const result = await this.sql`
      SELECT * FROM snippets 
      WHERE is_deleted = true AND owner_wallet_address = ${userWalletAddress}
      ORDER BY deleted_at DESC 
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

  /**
   * Get all soft-deleted snippets (admin view)
   */
  async findAllDeleted(options?: PaginationOptions) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Get total count
    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM snippets WHERE is_deleted = true
    `;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated deleted snippets
    const result = await this.sql`
      SELECT * FROM snippets 
      WHERE is_deleted = true
      ORDER BY deleted_at DESC 
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

  /**
   * Permanently delete a snippet (hard delete)
   */
  async permanentlyDelete(id: string) {
    const result = await this.sql`
      DELETE FROM snippets WHERE id = ${id} RETURNING *
    `;
    return result[0] || null;
  }
}
