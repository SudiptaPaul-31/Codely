import { logEvent } from "@/lib/audit";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { CreateSnippetDTO, UpdateSnippetDTO } from "./snippet.validator";
import { SnippetOwnershipProof } from "@/lib/snippet-ownership-proof";

// Pagination options interface
export interface PaginationOptions {
  limit: number;
  offset: number;
}

export type SnippetVisibility = "private" | "public" | "shared";

export interface SearchSnippetsOptions extends PaginationOptions {
  title?: string;
  language?: string;
  tags?: string[];
  keyword?: string;
  /** Optional exact visibility filter */
  visibility?: SnippetVisibility;
  /** When set, only return snippets the viewer may see */
  viewerWalletAddress?: string;
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

  /**
   * Atomically transfer snippet ownership.
   * Guard ensures the current owner matches oldOwnerWalletAddress.
   */
  async transferOwnershipAtomic(params: {
    snippetId: string;
    oldOwnerWalletAddress: string;
    newOwnerWalletAddress: string;
  }) {
    const updatedAt = new Date();

    const result = await this.sql`
      UPDATE snippets
      SET owner_wallet_address = ${params.newOwnerWalletAddress},
          updated_at = ${updatedAt}
      WHERE id = ${params.snippetId}
        AND is_deleted = false
        AND owner_wallet_address = ${params.oldOwnerWalletAddress}
      RETURNING *
    `;

    return result[0] || null;
  }

  async findOwnerWalletAddress(snippetId: string) {
    const result = await this.sql`
      SELECT owner_wallet_address
      FROM snippets
      WHERE id = ${snippetId}
        AND is_deleted = false
    `;
    return result[0]?.owner_wallet_address || null;
  }

  async saveOwnershipProof(proof: SnippetOwnershipProof, anchoredTransactionHash?: string) {
    const existing = await this.sql`
      SELECT snippet_id
      FROM snippet_ownership_proofs
      WHERE snippet_id = ${proof.snippetId}
    `;

    if (existing[0]) {
      throw new Error("Ownership proof already exists");
    }

    const result = await this.sql`
      INSERT INTO snippet_ownership_proofs
        (snippet_id, content_hash, owner_wallet, signature, created_at, anchored_transaction_hash, anchored_at)
      VALUES
        (${proof.snippetId}, ${proof.hash}, ${proof.ownerWallet}, ${proof.signature}, ${proof.createdAt}, ${anchoredTransactionHash || null}, ${anchoredTransactionHash ? new Date() : null})
      RETURNING *
    `;
    return result[0] || null;
  }

  async findOwnershipProof(snippetId: string) {
    const result = await this.sql`
      SELECT snippet_id, content_hash AS hash, owner_wallet AS "ownerWallet",
             signature, created_at AS "createdAt", anchored_transaction_hash AS "anchoredTransactionHash"
      FROM snippet_ownership_proofs
      WHERE snippet_id = ${snippetId}
    `;
    return result[0] || null;
  }


  async findAll(options?: PaginationOptions & { visibility?: SnippetVisibility; viewerWalletAddress?: string }) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const visibility = options?.visibility ?? null;
    const viewer = options?.viewerWalletAddress ?? null;

    // Anonymous listings only see public snippets. Authenticated viewers also see
    // their own snippets and ones explicitly shared with them.
    const countResult = await this.sql`
      SELECT COUNT(*) as total FROM snippets s
      WHERE s.is_deleted = false
        AND (${visibility}::text IS NULL OR s.visibility = ${visibility})
        AND (
          (${viewer}::text IS NULL AND s.visibility = 'public')
          OR (
            ${viewer}::text IS NOT NULL
            AND (
              s.visibility = 'public'
              OR s.owner_wallet_address = ${viewer}
              OR s.id IN (
                SELECT snippet_id FROM snippet_share_users
                WHERE user_wallet_address = ${viewer}
              )
            )
          )
        )
    `;
    const total = Number(countResult[0]?.total ?? 0);

    const result = await this.sql`
      SELECT s.*
      FROM snippets s
      WHERE s.is_deleted = false
        AND (${visibility}::text IS NULL OR s.visibility = ${visibility})
        AND (
          (${viewer}::text IS NULL AND s.visibility = 'public')
          OR (
            ${viewer}::text IS NOT NULL
            AND (
              s.visibility = 'public'
              OR s.owner_wallet_address = ${viewer}
              OR s.id IN (
                SELECT snippet_id FROM snippet_share_users
                WHERE user_wallet_address = ${viewer}
              )
            )
          )
        )
      ORDER BY s.created_at DESC
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
    const visibility = options.visibility ?? null;
    const viewer = options.viewerWalletAddress ?? null;

    const countResult = await this.sql`
      SELECT COUNT(*) AS total
      FROM snippets s
      WHERE (${title}::text IS NULL OR s.title ILIKE ${titlePattern})
        AND (${language}::text IS NULL OR LOWER(s.language) = LOWER(${language}))
        AND (${tagsJson}::jsonb IS NULL OR s.tags @> ${tagsJson}::jsonb)
        AND (${visibility}::text IS NULL OR s.visibility = ${visibility})
        AND (
          (${viewer}::text IS NULL AND s.visibility = 'public')
          OR (
            ${viewer}::text IS NOT NULL
            AND (
              s.visibility = 'public'
              OR s.owner_wallet_address = ${viewer}
              OR s.id IN (
                SELECT snippet_id FROM snippet_share_users
                WHERE user_wallet_address = ${viewer}
              )
            )
          )
        )
        AND (
          ${keyword}::text IS NULL
          OR (
            setweight(to_tsvector('simple', COALESCE(s.title, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(s.description, '')), 'B') ||
            setweight(to_tsvector('simple', COALESCE(s.code, '')), 'C') ||
            setweight(to_tsvector('simple', COALESCE(s.language, '')), 'B') ||
            setweight(jsonb_to_tsvector('simple', COALESCE(s.tags, '[]'::jsonb), '["string"]'), 'B')
          ) @@ websearch_to_tsquery('simple', ${keyword})
        )
        AND s.is_deleted = false
    `;

    const total = Number(countResult[0]?.total ?? 0);

    const result = await this.sql`
      SELECT s.*
      FROM snippets s
      WHERE (${title}::text IS NULL OR s.title ILIKE ${titlePattern})
        AND (${language}::text IS NULL OR LOWER(s.language) = LOWER(${language}))
        AND (${tagsJson}::jsonb IS NULL OR s.tags @> ${tagsJson}::jsonb)
        AND (${visibility}::text IS NULL OR s.visibility = ${visibility})
        AND (
          (${viewer}::text IS NULL AND s.visibility = 'public')
          OR (
            ${viewer}::text IS NOT NULL
            AND (
              s.visibility = 'public'
              OR s.owner_wallet_address = ${viewer}
              OR s.id IN (
                SELECT snippet_id FROM snippet_share_users
                WHERE user_wallet_address = ${viewer}
              )
            )
          )
        )
        AND (
          ${keyword}::text IS NULL
          OR (
            setweight(to_tsvector('simple', COALESCE(s.title, '')), 'A') ||
            setweight(to_tsvector('simple', COALESCE(s.description, '')), 'B') ||
            setweight(to_tsvector('simple', COALESCE(s.code, '')), 'C') ||
            setweight(to_tsvector('simple', COALESCE(s.language, '')), 'B') ||
            setweight(jsonb_to_tsvector('simple', COALESCE(s.tags, '[]'::jsonb), '["string"]'), 'B')
          ) @@ websearch_to_tsquery('simple', ${keyword})
        )
        AND s.is_deleted = false
      ORDER BY s.created_at DESC
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

  async findSharedUsers(snippetId: string) {
    const result = await this.sql`
      SELECT user_wallet_address, granted_by_wallet_address, created_at AS granted_at
      FROM snippet_share_users
      WHERE snippet_id = ${snippetId}
      ORDER BY created_at ASC
    `;
    return result as any[];
  }

  async addSharedUser(snippetId: string, userWalletAddress: string, grantedBy: string) {
    const result = await this.sql`
      INSERT INTO snippet_share_users (snippet_id, user_wallet_address, granted_by_wallet_address)
      VALUES (${snippetId}, ${userWalletAddress}, ${grantedBy})
      ON CONFLICT (snippet_id, user_wallet_address) DO NOTHING
      RETURNING *
    `;
    return result[0] || null;
  }

  async removeSharedUser(snippetId: string, userWalletAddress: string) {
    const result = await this.sql`
      DELETE FROM snippet_share_users
      WHERE snippet_id = ${snippetId} AND user_wallet_address = ${userWalletAddress}
      RETURNING *
    `;
    return result[0] || null;
  }

  async isSharedWith(snippetId: string, userWalletAddress: string) {
    const result = await this.sql`
      SELECT 1 FROM snippet_share_users
      WHERE snippet_id = ${snippetId} AND user_wallet_address = ${userWalletAddress}
      LIMIT 1
    `;
    return result.length > 0;
  }

  async create(data: CreateSnippetDTO & { id?: string; licenseTransactionHash?: string; licenseMetadata?: any; ipfsCid?: string; originalSnippetId?: string }) {
    const id = data.id ?? crypto.randomUUID();
    const createdAt = new Date();
    const forkedFromId = data.forkedFromId || null;
    const isFork = Boolean(data.isFork);

    const visibility = data.visibility || "private";

    const result = await this.sql`
      INSERT INTO snippets (
        id, title, description, code, language, tags, owner_wallet_address,
        forked_from_id, is_fork,
        license_type, license_transaction_hash, license_metadata, ipfs_cid,
        original_snippet_id,
        visibility,
        created_at, updated_at
      ) 
      VALUES (
        ${id}, ${data.title}, ${data.description}, ${data.code}, ${data.language},
        ${data.tags}, ${data.ownerWalletAddress},
        ${forkedFromId}, ${isFork},
        ${data.licenseType || null}, ${data.licenseTransactionHash || null},
        ${data.licenseMetadata ? JSON.stringify(data.licenseMetadata) : null},
        ${data.ipfsCid || null}, ${data.originalSnippetId || null},
        ${visibility},
        ${createdAt}, ${createdAt}
      ) 
      RETURNING *
    `;
    await logEvent("snippet_created", data.ownerWalletAddress, id, data.title);
    return result[0];
  }

  async update(id: string, data: UpdateSnippetDTO & { licenseTransactionHash?: string; licenseMetadata?: any; ipfsCid?: string }) {
    const updatedAt = new Date();

    const forkedFromId = data.forkedFromId !== undefined ? data.forkedFromId : null;
    const isFork = data.isFork !== undefined ? data.isFork : null;

    // Use raw SQL for dynamic updates
    const result = await this.sql`
      UPDATE snippets 
      SET title = COALESCE(${data.title}, title),
          description = COALESCE(${data.description}, description),
          code = COALESCE(${data.code}, code),
          language = COALESCE(${data.language}, language),
          tags = COALESCE(${data.tags}, tags),
          forked_from_id = COALESCE(${forkedFromId}, forked_from_id),
          is_fork = COALESCE(${isFork}, is_fork),
          license_type = COALESCE(${data.licenseType || null}, license_type),
          license_transaction_hash = COALESCE(${data.licenseTransactionHash || null}, license_transaction_hash),
          license_metadata = COALESCE(${data.licenseMetadata ? JSON.stringify(data.licenseMetadata) : null}, license_metadata),
          ipfs_cid = COALESCE(${data.ipfsCid || null}, ipfs_cid),
          visibility = COALESCE(${data.visibility || null}, visibility),
          updated_at = ${updatedAt}
      WHERE id = ${id} AND is_deleted = false
      RETURNING *
    `;
    if (result[0]) await logEvent("snippet_updated", result[0].owner_wallet_address, id, "Snippet updated");
    return result[0] || null;
  }

  /**
   * Find all snippets forked/derived from a specific snippet ID
   */
  async findForksBySnippetId(snippetId: string) {
    const result = await this.sql`
      SELECT * FROM snippets
      WHERE forked_from_id = ${snippetId} AND is_deleted = false
      ORDER BY created_at DESC
    `;
    return result as any[];
  }

  /**
   * Find origin/parent snippet of a forked snippet
   */
  async findOriginSnippet(forkedSnippetId: string) {
    const child = await this.findById(forkedSnippetId);
    if (!child || !child.forked_from_id) {
      return null;
    }
    const origin = await this.findById(child.forked_from_id);
    return origin;
  }

  async delete(id: string) {
    const result = await this.sql`
      DELETE FROM snippets WHERE id = ${id} AND is_deleted = false RETURNING *
    `;
    if (result[0]) await logEvent("snippet_deleted", result[0].owner_wallet_address, id, "Snippet permanently deleted");
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
    if (result[0]) await logEvent("snippet_soft_deleted", deletedBy || result[0].owner_wallet_address, id, "Snippet soft deleted");
    return result[0] || null;
  }

  /**
   * Restore a soft-deleted snippet
   */
  async restore(id: string) {
    const result = await this.sql`
      UPDATE snippets 
      SET is_deleted = false, deleted_at = null, deleted_by = null
      WHERE id = ${id} AND is_deleted = true
      RETURNING *
    `;
    if (result[0]) await logEvent("snippet_restored", result[0].owner_wallet_address, id, "Snippet restored");
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

  /**
   * Return all unique tags across non-deleted snippets, with usage counts.
   * Unnests the jsonb tags array so each tag is counted individually.
   */
  async findAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const result = await this.sql`
      SELECT tag, COUNT(*)::int AS count
      FROM snippets, jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(tags) = 'array' THEN tags ELSE '[]'::jsonb END
      ) AS tag
      WHERE is_deleted = false
        AND tags IS NOT NULL
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `;
    return result as any[];
  }

  /**
   * Duplicate a snippet: create an identical copy in the requesting user's collection.
   * Preserves title, description, code, language, and tags.
   * Sets originalSnippetId for traceability.
   */
  async duplicateSnippet(
    sourceId: string,
    newOwnerWalletAddress: string,
    overrides?: { title?: string; description?: string; code?: string },
  ) {
    const source = await this.findById(sourceId);
    if (!source) return null;

    const id = crypto.randomUUID();
    const createdAt = new Date();

    const result = await this.sql`
      INSERT INTO snippets (
        id, title, description, code, language, tags,
        owner_wallet_address, original_snippet_id,
        created_at, updated_at
      ) VALUES (
        ${id},
        ${overrides?.title ?? source.title},
        ${overrides?.description ?? source.description},
        ${overrides?.code ?? source.code},
        ${source.language},
        ${JSON.stringify(source.tags)}::jsonb,
        ${newOwnerWalletAddress},
        ${sourceId},
        ${createdAt},
        ${createdAt}
      )
      RETURNING *
    `;

    await logEvent("snippet_duplicated", newOwnerWalletAddress, id, `Duplicated from ${sourceId}`);
    return result[0] || null;
  }

  /**
   * Fork a snippet: create a derived copy with editable content in the requesting user's collection.
   * Same as duplicate but intended for mutation; preserves original reference.
   */
  async forkSnippet(
    sourceId: string,
    newOwnerWalletAddress: string,
    overrides?: { title?: string; description?: string; code?: string },
  ) {
    const source = await this.findById(sourceId);
    if (!source) return null;

    const id = crypto.randomUUID();
    const createdAt = new Date();

    const result = await this.sql`
      INSERT INTO snippets (
        id, title, description, code, language, tags,
        owner_wallet_address, original_snippet_id,
        created_at, updated_at
      ) VALUES (
        ${id},
        ${overrides?.title ?? `${source.title} (fork)`},
        ${overrides?.description ?? source.description},
        ${overrides?.code ?? source.code},
        ${source.language},
        ${JSON.stringify(source.tags)}::jsonb,
        ${newOwnerWalletAddress},
        ${sourceId},
        ${createdAt},
        ${createdAt}
      )
      RETURNING *
    `;

    await logEvent("snippet_forked", newOwnerWalletAddress, id, `Forked from ${sourceId}`);
    return result[0] || null;
  }
}