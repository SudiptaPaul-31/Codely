import { neon } from "@neondatabase/serverless";

let sql: ReturnType<typeof neon> | null = null;
function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
}

const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

type DeleteResult = Array<{ id: string }>;

export class CleanupRepository {
  async deleteExpiredShares(graceDays: number): Promise<number> {
    return this.runBatched((limit) =>
      getSql()`
        DELETE FROM snippet_shares
        WHERE id IN (
          SELECT id FROM snippet_shares
          WHERE (
            (
              expires_at IS NOT NULL
              AND expires_at < NOW() - ${graceDays} * INTERVAL '1 day'
            )
            OR (
              revoked_at IS NOT NULL
              AND revoked_at < NOW() - ${graceDays} * INTERVAL '1 day'
            )
          )
          LIMIT ${limit}
        )
        RETURNING id
      `,
    );
  }

  async deleteTrashedSnippets(retentionDays: number): Promise<number> {
    return this.runBatched((limit) =>
      getSql()`
        DELETE FROM snippets
        WHERE id IN (
          SELECT id FROM snippets
          WHERE is_deleted = TRUE
            AND deleted_at IS NOT NULL
            AND deleted_at < NOW() - ${retentionDays} * INTERVAL '1 day'
          LIMIT ${limit}
        )
        RETURNING id
      `,
    );
  }

  async deleteExpiredAuthRecords(): Promise<number> {
    const sessions = await this.runBatched((limit) =>
      getSql()`
        DELETE FROM auth_sessions
        WHERE id IN (
          SELECT id FROM auth_sessions
          WHERE expires_at < NOW()
          LIMIT ${limit}
        )
        RETURNING id
      `,
    );

    const nonces = await this.runBatched((limit) =>
      getSql()`
        DELETE FROM login_nonces
        WHERE id IN (
          SELECT id FROM login_nonces
          WHERE expires_at < NOW()
          LIMIT ${limit}
        )
        RETURNING id
      `,
    );

    return sessions + nonces;
  }

  async pruneStaleLogs(retentionDays: number): Promise<number> {
    let deleted = 0;

    const tables = [
      {
        name: "activity_logs",
        prune: (limit: number) =>
          getSql()`
            DELETE FROM activity_logs
            WHERE id IN (
              SELECT id FROM activity_logs
              WHERE created_at < NOW() - ${retentionDays} * INTERVAL '1 day'
              LIMIT ${limit}
            )
            RETURNING id
          `,
      },
      {
        name: "snippet_analytics",
        prune: (limit: number) =>
          getSql()`
            DELETE FROM snippet_analytics
            WHERE id IN (
              SELECT id FROM snippet_analytics
              WHERE created_at < NOW() - ${retentionDays} * INTERVAL '1 day'
              LIMIT ${limit}
            )
            RETURNING id
          `,
      },
      {
        name: "audits",
        prune: (limit: number) =>
          getSql()`
            DELETE FROM audits
            WHERE id IN (
              SELECT id FROM audits
              WHERE created_at < NOW() - ${retentionDays} * INTERVAL '1 day'
              LIMIT ${limit}
            )
            RETURNING id
          `,
      },
    ];

    for (const table of tables) {
      try {
        deleted += await this.runBatched(table.prune);
      } catch (error) {
        console.error(`[CleanupRepository] Failed to prune ${table.name}:`, error);
      }
    }

    return deleted;
  }

  private async runBatched(query: (limit: number) => Promise<any>): Promise<number> {
    let deleted = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result: DeleteResult = await query(BATCH_SIZE);
      deleted += result.length;
      if (result.length < BATCH_SIZE) break;
    }
    return deleted;
  }
}
