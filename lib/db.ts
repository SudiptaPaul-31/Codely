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
