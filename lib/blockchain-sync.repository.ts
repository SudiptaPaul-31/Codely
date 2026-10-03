import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export interface SyncLogParams {
  snippetId: string;
  transactionHash?: string | null;
  discrepancyType: string;
  resolution: string;
}

export class BlockchainSyncRepository {
  async logSyncDiscrepancy(params: SyncLogParams): Promise<void> {
    await getSql()`
      INSERT INTO blockchain_sync_log (
        snippet_id,
        transaction_hash,
        discrepancy_type,
        resolution
      ) VALUES (
        ${params.snippetId},
        ${params.transactionHash ?? null},
        ${params.discrepancyType},
        ${params.resolution}
      )
    `;
  }

  async getAllSnippets(): Promise<any[]> {
    return getSql()`
      SELECT id, owner, updated_at 
      FROM snippets
    `;
  }

  async getSnippetByid(snippetId: string): Promise<any> {
    const result = await getSql()`
      SELECT id, owner, updated_at 
      FROM snippets 
      WHERE id = ${snippetId}
    `;
    return result[0];
  }

  async updateSnippetOwner(snippetId: string, newOwner: string, updatedAt: Date): Promise<void> {
    await getSql()`
      UPDATE snippets 
      SET owner = ${newOwner}, updated_at = ${updatedAt.toISOString()} 
      WHERE id = ${snippetId}
    `;
  }
}
