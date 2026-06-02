import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Ensure crypto is available
import crypto from "crypto";

export async function getSnippetById(id: string) {
  try {
    const result = await sql`SELECT * FROM snippets WHERE id = ${id}`;
    return result[0] as any;
  } catch (error) {
    console.error("Error fetching snippet:", error);
    throw error;
  }
}

export async function updateSnippet(
  id: string,
  title: string,
  description: string,
  code: string,
  language: string,
  tags: string[],
) {
  try {
    const updatedAt = new Date();
    console.log("[v0] Updating snippet:", { id, title, language });
    const result = await sql`
      UPDATE snippets 
      SET title = ${title}, description = ${description}, code = ${code}, language = ${language}, tags = ${tags}, updated_at = ${updatedAt} 
      WHERE id = ${id} 
      RETURNING *
    `;
    console.log("[v0] Snippet updated successfully:", result[0]);
    return result[0] as any;
  } catch (error) {
    console.error("[v0] Error updating snippet:", error);
    throw error;
  }
}

export async function deleteSnippet(id: string) {
  try {
    await sql`DELETE FROM snippets WHERE id = ${id}`;
    return true;
  } catch (error) {
    console.error("Error deleting snippet:", error);
    throw error;
  }
}

// ============ Version Management Functions ============

export async function createSnippetVersion(
  snippetId: string,
  content: {
    title: string;
    description: string;
    code: string;
    language: string;
    tags: string[];
  },
  editorId: string | null = null,
) {
  try {
    const id = crypto.randomUUID();
    const versionNumber = await getNextVersionNumber(snippetId);
    const createdAt = new Date();

    const result = await sql`
      INSERT INTO snippet_versions (id, snippet_id, content, editor_id, version_number, created_at)
      VALUES (${id}, ${snippetId}, ${JSON.stringify(content)}, ${editorId}, ${versionNumber}, ${createdAt})
      RETURNING *
    `;

    console.log("[v0] Snippet version created:", {
      id,
      snippetId,
      versionNumber,
    });
    return result[0] as any;
  } catch (error) {
    console.error("[v0] Error creating snippet version:", error);
    throw error;
  }
}

export async function getNextVersionNumber(snippetId: string): Promise<number> {
  try {
    const result = await sql`
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM snippet_versions
      WHERE snippet_id = ${snippetId}
    `;
    return result[0]?.next_version || 1;
  } catch (error) {
    console.error("[v0] Error getting next version number:", error);
    return 1;
  }
}

export async function getVersionHistory(
  snippetId: string,
  page: number = 1,
  pageSize: number = 10,
) {
  try {
    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM snippet_versions
      WHERE snippet_id = ${snippetId}
    `;
    const total = parseInt(countResult[0]?.total || "0");

    // Get paginated versions
    const result = await sql`
      SELECT * FROM snippet_versions
      WHERE snippet_id = ${snippetId}
      ORDER BY version_number DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return {
      versions: result as any[],
      total,
      page,
      pageSize,
    };
  } catch (error) {
    console.error("[v0] Error fetching version history:", error);
    throw error;
  }
}

export async function getVersionById(versionId: string) {
  try {
    const result = await sql`
      SELECT * FROM snippet_versions WHERE id = ${versionId}
    `;
    return result[0] as any;
  } catch (error) {
    console.error("[v0] Error fetching version:", error);
    throw error;
  }
}

export async function restoreVersion(
  versionId: string,
  editorId: string | null = null,
) {
  try {
    // Get the version to restore
    const version = await getVersionById(versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    const snippetId = version.snippet_id;
    const content = version.content;

    // Update the snippet (this will also create a new version via the API)
    const updatedAt = new Date();
    const result = await sql`
      UPDATE snippets
      SET title = ${content.title},
          description = ${content.description},
          code = ${content.code},
          language = ${content.language},
          tags = ${JSON.stringify(content.tags)},
          updated_at = ${updatedAt},
          revision = revision + 1
      WHERE id = ${snippetId}
      RETURNING *
    `;

    // Create a new version entry for the restore action
    await createSnippetVersion(snippetId, content, editorId);

    console.log("[v0] Version restored:", { snippetId, versionId });
    return result[0] as any;
  } catch (error) {
    console.error("[v0] Error restoring version:", error);
    throw error;
  }
}

// ============ NFT Functions ============

export async function updateSnippetNft(
  id: string,
  txHash: string,
  metadata: object,
) {
  try {
    const result = await sql`
      UPDATE snippets
      SET nft_transaction_hash = ${txHash},
          nft_metadata = ${JSON.stringify(metadata)},
          updated_at = ${new Date()}
      WHERE id = ${id}
      RETURNING *
    `;
    return result[0] as any;
  } catch (error) {
    console.error("Error updating snippet NFT:", error);
    throw error;
  }
}

// ============ On-Chain Timestamp Verification Functions ============

/**
 * Fetch a snippet including its on-chain verification fields.
 */
export async function getSnippetWithHash(id: string) {
  try {
    const result = await sql`
      SELECT id, title, description, code, language, tags,
             owner_wallet_address, created_at, updated_at,
             on_chain_hash, transaction_hash, verified_at
      FROM snippets
      WHERE id = ${id}
    `;
    return (result[0] as any) || null;
  } catch (error) {
    console.error("Error fetching snippet with hash:", error);
    throw error;
  }
}

/**
 * Persist the on-chain hash and Stellar transaction hash for a snippet.
 * Immutability: if on_chain_hash is already set, this call is rejected
 * to prevent overwriting an existing proof-of-existence record.
 */
export async function storeSnippetHash(
  id: string,
  onChainHash: string,
  transactionHash: string,
) {
  try {
    // Guard: do not overwrite an existing verified record
    const existing = await sql`
      SELECT on_chain_hash FROM snippets WHERE id = ${id}
    `;
    if (existing[0]?.on_chain_hash) {
      throw new Error(
        "Snippet is already verified on-chain. Timestamps are immutable.",
      );
    }

    const verifiedAt = new Date();
    const result = await sql`
      UPDATE snippets
      SET on_chain_hash    = ${onChainHash},
          transaction_hash = ${transactionHash},
          verified_at      = ${verifiedAt}
      WHERE id = ${id}
      RETURNING id, on_chain_hash, transaction_hash, verified_at
    `;
    return result[0] as any;
  } catch (error) {
    console.error("Error storing snippet hash:", error);
    throw error;
  }
}

/**
 * Compare the snippet's current content hash against the stored on-chain hash.
 */
export async function verifySnippetIntegrity(
  id: string,
  title: string,
  description: string,
  code: string,
  language: string,
  tags: string[],
): Promise<{ isValid: boolean; message: string }> {
  try {
    const { generateSnippetHash } = await import("@/lib/hash");

    const snippet = await sql`
      SELECT on_chain_hash FROM snippets WHERE id = ${id}
    `;

    if (!snippet[0]?.on_chain_hash) {
      return {
        isValid: false,
        message: "Snippet has not been verified on-chain yet.",
      };
    }

    const currentHash = generateSnippetHash(
      title,
      description,
      code,
      language,
      tags,
    );

    const isValid = currentHash === snippet[0].on_chain_hash;

    return {
      isValid,
      message: isValid
        ? "Snippet integrity verified — content matches the on-chain record."
        : "Integrity check failed — snippet content has been modified since on-chain verification.",
    };
  } catch (error) {
    console.error("Error verifying snippet integrity:", error);
    throw error;
  }
}

/**
 * Return all snippets that have been verified on the Stellar blockchain.
 */
export async function getVerifiedSnippets() {
  try {
    const result = await sql`
      SELECT id, title, language, on_chain_hash, transaction_hash, verified_at, created_at
      FROM snippets
      WHERE on_chain_hash IS NOT NULL
        AND is_deleted = false
      ORDER BY verified_at DESC
    `;
    return result as any[];
  } catch (error) {
    console.error("Error fetching verified snippets:", error);
    throw error;
  }
}
