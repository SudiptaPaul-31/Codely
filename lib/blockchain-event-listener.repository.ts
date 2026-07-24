import { neon } from "@neondatabase/serverless";
import type {
  BlockchainEvent,
  EventLogStatus,
  PermissionType,
  StoredBlockchainEvent,
} from "@/lib/blockchain-event-listener.types";

const DEFAULT_STREAM_NAME = "stellar-app-events";

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

type EventLogRow = {
  event_id: string;
  event_type: string;
  status: EventLogStatus;
  attempts: number;
  source: string | null;
  last_error: string | null;
  payload: BlockchainEvent;
};

function toStoredEvent(row: EventLogRow): StoredBlockchainEvent {
  return {
    ...row.payload,
    status: row.status,
    attempts: Number(row.attempts ?? 0),
    source: row.source,
    lastError: row.last_error,
  };
}

export class BlockchainEventListenerRepository {
  async getCursor(streamName = DEFAULT_STREAM_NAME): Promise<string | null> {
    const result = (await getSql()`
      SELECT cursor
      FROM blockchain_event_cursors
      WHERE stream_name = ${streamName}
      LIMIT 1
    `) as Array<{ cursor: string }>;
    return result[0]?.cursor ?? null;
  }

  async saveCursor(
    streamName = DEFAULT_STREAM_NAME,
    cursor: string,
  ): Promise<void> {
    await getSql()`
      INSERT INTO blockchain_event_cursors (stream_name, cursor, updated_at)
      VALUES (${streamName}, ${cursor}, NOW())
      ON CONFLICT (stream_name)
      DO UPDATE SET
        cursor = EXCLUDED.cursor,
        updated_at = NOW()
    `;
  }

  async upsertEventLog(
    event: BlockchainEvent,
    source: string | null = null,
  ): Promise<StoredBlockchainEvent> {
    const payload = JSON.stringify(event);
    const result = (await getSql()`
      INSERT INTO blockchain_event_logs (
        event_id,
        event_type,
        cursor,
        tx_hash,
        contract_id,
        source,
        status,
        attempts,
        payload,
        created_at,
        updated_at
      )
      VALUES (
        ${event.id},
        ${event.type},
        ${event.cursor ?? null},
        ${event.txHash ?? null},
        ${event.contractId ?? null},
        ${source},
        'pending',
        0,
        ${payload}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (event_id)
      DO UPDATE SET
        cursor = COALESCE(EXCLUDED.cursor, blockchain_event_logs.cursor),
        tx_hash = COALESCE(EXCLUDED.tx_hash, blockchain_event_logs.tx_hash),
        contract_id = COALESCE(EXCLUDED.contract_id, blockchain_event_logs.contract_id),
        source = COALESCE(EXCLUDED.source, blockchain_event_logs.source),
        payload = EXCLUDED.payload,
        updated_at = NOW()
      RETURNING event_id, event_type, status, attempts, source, last_error, payload
    `) as EventLogRow[];

    return toStoredEvent(result[0]);
  }

  async getRetryableEvents(limit: number): Promise<StoredBlockchainEvent[]> {
    const result = await getSql()`
      SELECT event_id, event_type, status, attempts, source, last_error, payload
      FROM blockchain_event_logs
      WHERE status = 'retrying'
      ORDER BY updated_at ASC
      LIMIT ${limit}
    `;

    return (result as EventLogRow[]).map(toStoredEvent);
  }

  async markProcessing(eventId: string): Promise<void> {
    await getSql()`
      UPDATE blockchain_event_logs
      SET status = 'processing',
          updated_at = NOW()
      WHERE event_id = ${eventId}
    `;
  }

  async markProcessed(eventId: string): Promise<void> {
    await getSql()`
      UPDATE blockchain_event_logs
      SET status = 'processed',
          processed_at = NOW(),
          last_error = null,
          updated_at = NOW()
      WHERE event_id = ${eventId}
    `;
  }

  async markIgnored(eventId: string, reason: string): Promise<void> {
    await getSql()`
      UPDATE blockchain_event_logs
      SET status = 'ignored',
          processed_at = NOW(),
          last_error = ${reason},
          updated_at = NOW()
      WHERE event_id = ${eventId}
    `;
  }

  async markRetrying(eventId: string, errorMessage: string): Promise<void> {
    await getSql()`
      UPDATE blockchain_event_logs
      SET status = 'retrying',
          attempts = attempts + 1,
          last_error = ${errorMessage},
          updated_at = NOW()
      WHERE event_id = ${eventId}
    `;
  }

  async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await getSql()`
      UPDATE blockchain_event_logs
      SET status = 'failed',
          attempts = attempts + 1,
          last_error = ${errorMessage},
          updated_at = NOW()
      WHERE event_id = ${eventId}
    `;
  }

  async syncSnippetOwnership(params: {
    snippetId: string;
    newOwnerWalletAddress: string;
    previousOwnerWalletAddress?: string | null;
    txHash?: string | null;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    const occurredAt = new Date(params.timestamp);

    const result = (params.previousOwnerWalletAddress
      ? await getSql()`
          UPDATE snippets
          SET owner_wallet_address = ${params.newOwnerWalletAddress},
              updated_at = ${occurredAt}
          WHERE id = ${params.snippetId}
            AND owner_wallet_address = ${params.previousOwnerWalletAddress}
          RETURNING id
        `
      : await getSql()`
          UPDATE snippets
          SET owner_wallet_address = ${params.newOwnerWalletAddress},
              updated_at = ${occurredAt}
          WHERE id = ${params.snippetId}
          RETURNING id
        `) as Array<{ id: string }>;

    if (result.length === 0) {
      throw new Error("Snippet ownership sync failed: snippet missing or owner mismatch");
    }

    const listingId = this.readMetadataString(params.metadata, "listingId");
    const purchaseId = this.readMetadataString(params.metadata, "purchaseId");

    if (listingId) {
      await getSql()`
        UPDATE marketplace_listings
        SET status = 'sold',
            updated_at = ${occurredAt}
        WHERE id = ${listingId}
      `;
    }

    if (purchaseId) {
      await getSql()`
        UPDATE marketplace_purchases
        SET status = 'completed',
            release_tx_hash = COALESCE(${params.txHash ?? null}, release_tx_hash),
            completed_at = COALESCE(completed_at, ${occurredAt})
        WHERE id = ${purchaseId}
      `;

      await getSql()`
        UPDATE marketplace_escrow
        SET status = 'released',
            release_tx_hash = COALESCE(${params.txHash ?? null}, release_tx_hash),
            released_at = COALESCE(released_at, ${occurredAt})
        WHERE purchase_id = ${purchaseId}
      `;
    }
  }

  async upsertWalletVerification(params: {
    walletAddress: string;
    txHash?: string | null;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await getSql()`
      INSERT INTO wallet_identity_verifications (
        wallet_address,
        status,
        last_verified_at,
        tx_hash,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        ${params.walletAddress},
        'verified',
        ${new Date(params.timestamp)},
        ${params.txHash ?? null},
        ${JSON.stringify(params.metadata ?? {})}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        status = 'verified',
        last_verified_at = EXCLUDED.last_verified_at,
        tx_hash = COALESCE(EXCLUDED.tx_hash, wallet_identity_verifications.tx_hash),
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;
  }

  async recordSnippetVerification(params: {
    snippetId: string;
    walletAddress: string;
    signature?: string | null;
    message?: string | null;
    txHash?: string | null;
    timestamp: string;
  }): Promise<void> {
    await getSql()`
      INSERT INTO snippet_verifications (
        snippet_id,
        wallet_address,
        signature,
        message,
        verified_at,
        status,
        is_active,
        created_at
      )
      VALUES (
        ${params.snippetId},
        ${params.walletAddress},
        ${params.signature ?? params.txHash ?? "blockchain-event"},
        ${params.message ?? `On-chain verification synced from ${params.txHash ?? "unknown transaction"}`},
        ${new Date(params.timestamp)},
        'verified',
        true,
        NOW()
      )
    `;
  }

  async syncPermission(params: {
    snippetId: string;
    targetWalletAddress: string;
    actorWalletAddress: string;
    permissionType: PermissionType;
    active: boolean;
    txHash?: string | null;
    timestamp: string;
  }): Promise<void> {
    const occurredAt = new Date(params.timestamp);

    if (params.active) {
      await getSql()`
        INSERT INTO snippet_permissions (
          snippet_id,
          grantee_wallet_address,
          permission_type,
          granted_by_wallet_address,
          on_chain_tx_hash,
          granted_at,
          revoked_at,
          is_active
        )
        VALUES (
          ${params.snippetId},
          ${params.targetWalletAddress},
          ${params.permissionType},
          ${params.actorWalletAddress},
          ${params.txHash ?? null},
          ${occurredAt},
          null,
          true
        )
        ON CONFLICT (snippet_id, grantee_wallet_address, permission_type)
        DO UPDATE SET
          granted_by_wallet_address = EXCLUDED.granted_by_wallet_address,
          on_chain_tx_hash = COALESCE(EXCLUDED.on_chain_tx_hash, snippet_permissions.on_chain_tx_hash),
          granted_at = EXCLUDED.granted_at,
          revoked_at = null,
          is_active = true
      `;
    } else {
      await getSql()`
        UPDATE snippet_permissions
        SET is_active = false,
            revoked_at = ${occurredAt},
            on_chain_tx_hash = COALESCE(${params.txHash ?? null}, on_chain_tx_hash)
        WHERE snippet_id = ${params.snippetId}
          AND grantee_wallet_address = ${params.targetWalletAddress}
          AND permission_type = ${params.permissionType}
      `;
    }

    await getSql()`
      INSERT INTO permission_activity_log (
        snippet_id,
        actor_wallet_address,
        target_wallet_address,
        action,
        permission_type,
        on_chain_tx_hash,
        created_at
      )
      VALUES (
        ${params.snippetId},
        ${params.actorWalletAddress},
        ${params.targetWalletAddress},
        ${params.active ? "grant" : "revoke"},
        ${params.permissionType},
        ${params.txHash ?? null},
        ${occurredAt}
      )
    `;
  }

  private readMetadataString(
    metadata: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    const value = metadata?.[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}
