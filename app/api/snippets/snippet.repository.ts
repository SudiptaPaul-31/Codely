import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { CreateSnippetDTO, UpdateSnippetDTO } from "./snippet.validator";

// Pagination options interface
export interface PaginationOptions {
  limit: number;
  offset: number;
}

export interface SearchSnippetsOptions extends PaginationOptions {
  title?: string;
  language?: string;
  tags?: string[];
  keyword?: string;
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

    // Get total count for pagination metadata
    const countResult = await this.sql`SELECT COUNT(*) as total FROM snippets`;
    const total = Number(countResult[0]?.total ?? 0);

    // Fetch paginated snippets with consistent ordering by created_at DESC
    const result = await this.sql`
      SELECT * FROM snippets 
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

  async search(options: SearchSnippetsOptions) {
    const limit = options.limit;
    const offset = options.offset;
    const title = options.title?.trim() || null;
    const titlePattern = title ? `%${title}%` : null;
    const language = options.language?.trim() || null;
    const keyword = options.keyword?.trim() || null;
    const tags = options.tags?.length ? options.tags : null;
    const tagsJson = tags ? JSON.stringify(tags) : null;

    const countResult = await this.sql`
      SELECT COUNT(*) AS total
      FROM snippets
      WHERE (${title}::text IS NULL OR title ILIKE ${titlePattern})
        AND (${language}::text IS NULL OR LOWER(language) = LOWER(${language}))
        AND (${tagsJson}::jsonb IS NULL OR tags @> ${tagsJson}::jsonb)
        AND (
          ${keyword}::text IS NULL
          OR (
            setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(description, '')), 'B') ||
            setweight(to_tsvector('simple', COALESCE(code, '')), 'C') ||
            setweight(to_tsvector('simple', COALESCE(language, '')), 'B') ||
            setweight(jsonb_to_tsvector('simple', COALESCE(tags, '[]'::jsonb), '["string"]'), 'B')
          ) @@ websearch_to_tsquery('simple', ${keyword})
        )
    `;

    const total = Number(countResult[0]?.total ?? 0);

    const result = await this.sql`
      SELECT *
      FROM snippets
      WHERE (${title}::text IS NULL OR title ILIKE ${titlePattern})
        AND (${language}::text IS NULL OR LOWER(language) = LOWER(${language}))
        AND (${tagsJson}::jsonb IS NULL OR tags @> ${tagsJson}::jsonb)
        AND (
          ${keyword}::text IS NULL
          OR (
            setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(description, '')), 'B') ||
            setweight(to_tsvector('simple', COALESCE(code, '')), 'C') ||
            setweight(to_tsvector('simple', COALESCE(language, '')), 'B') ||
            setweight(jsonb_to_tsvector('simple', COALESCE(tags, '[]'::jsonb), '["string"]'), 'B')
          ) @@ websearch_to_tsquery('simple', ${keyword})
        )
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
      SELECT * FROM snippets WHERE id = ${id}
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
}
