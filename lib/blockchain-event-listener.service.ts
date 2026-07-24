import crypto from "crypto";
import type {
  BlockchainEvent,
  BlockchainEventBatch,
  BlockchainEventSource,
  PermissionType,
  StoredBlockchainEvent,
} from "@/lib/blockchain-event-listener.types";
import { BlockchainEventListenerRepository } from "@/lib/blockchain-event-listener.repository";

export interface BlockchainEventListenerRepositoryLike {
  getCursor(streamName?: string): Promise<string | null>;
  saveCursor(streamName: string, cursor: string): Promise<void>;
  upsertEventLog(
    event: BlockchainEvent,
    source?: string | null,
  ): Promise<StoredBlockchainEvent>;
  getRetryableEvents(limit: number): Promise<StoredBlockchainEvent[]>;
  markProcessing(eventId: string): Promise<void>;
  markProcessed(eventId: string): Promise<void>;
  markIgnored(eventId: string, reason: string): Promise<void>;
  markRetrying(eventId: string, errorMessage: string): Promise<void>;
  markFailed(eventId: string, errorMessage: string): Promise<void>;
  syncSnippetOwnership(params: {
    snippetId: string;
    newOwnerWalletAddress: string;
    previousOwnerWalletAddress?: string | null;
    txHash?: string | null;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;
  upsertWalletVerification(params: {
    walletAddress: string;
    txHash?: string | null;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;
  recordSnippetVerification(params: {
    snippetId: string;
    walletAddress: string;
    signature?: string | null;
    message?: string | null;
    txHash?: string | null;
    timestamp: string;
  }): Promise<void>;
  syncPermission(params: {
    snippetId: string;
    targetWalletAddress: string;
    actorWalletAddress: string;
    permissionType: PermissionType;
    active: boolean;
    txHash?: string | null;
    timestamp: string;
  }): Promise<void>;
}

export interface SyncSummary {
  cursor: string | null;
  processed: number;
  retried: number;
  duplicates: number;
  ignored: number;
  failed: number;
  fetched: number;
}

class IgnoredEventError extends Error {}
class PermanentSyncError extends Error {}

export class HttpBlockchainEventSource implements BlockchainEventSource {
  constructor(
    private readonly endpoint = process.env.STELLAR_EVENT_SOURCE_URL,
    private readonly apiKey = process.env.STELLAR_EVENT_SOURCE_API_KEY,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchEvents(params: {
    cursor?: string | null;
    limit: number;
  }): Promise<BlockchainEventBatch> {
    if (!this.endpoint) {
      return {
        events: [],
        nextCursor: params.cursor ?? null,
        source: "env:STELLAR_EVENT_SOURCE_URL:not-configured",
      };
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("limit", String(params.limit));
    if (params.cursor) {
      url.searchParams.set("cursor", params.cursor);
    }

    const headers: HeadersInit = {};
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Event source request failed with ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    const rawEvents = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.events)
        ? payload.events
        : [];

    const events = (rawEvents as unknown[]).map((event: unknown) =>
      normalizeEvent(event),
    );
    const nextCursor =
      readString(payload?.nextCursor) ??
      readString(payload?.next_cursor) ??
      events.at(-1)?.cursor ??
      params.cursor ??
      null;

    return {
      events,
      nextCursor,
      source: this.endpoint,
    };
  }
}

export class BlockchainEventListenerService {
  constructor(
    private readonly repository: BlockchainEventListenerRepositoryLike = new BlockchainEventListenerRepository(),
    private readonly source: BlockchainEventSource = new HttpBlockchainEventSource(),
    private readonly streamName = "stellar-app-events",
    private readonly batchSize = 50,
  ) {}

  async sync(): Promise<SyncSummary> {
    const cursor = await this.repository.getCursor(this.streamName);
    const retryableEvents = await this.repository.getRetryableEvents(this.batchSize);

    let processed = 0;
    let retried = 0;
    let duplicates = 0;
    let ignored = 0;
    let failed = 0;

    for (const event of retryableEvents) {
      const outcome = await this.processEvent(event, event.source ?? "retry");
      if (outcome === "processed") {
        processed += 1;
        retried += 1;
      } else if (outcome === "duplicate") {
        duplicates += 1;
      } else if (outcome === "ignored") {
        ignored += 1;
      } else {
        failed += 1;
      }
    }

    const batch = await this.source.fetchEvents({
      cursor,
      limit: this.batchSize,
    });

    for (const event of batch.events) {
      const outcome = await this.processEvent(event, batch.source ?? "stellar");
      if (outcome === "processed") {
        processed += 1;
      } else if (outcome === "duplicate") {
        duplicates += 1;
      } else if (outcome === "ignored") {
        ignored += 1;
      } else {
        failed += 1;
      }
    }

    const nextCursor =
      batch.nextCursor ??
      batch.events.at(-1)?.cursor ??
      cursor ??
      null;

    if (nextCursor && nextCursor !== cursor) {
      await this.repository.saveCursor(this.streamName, nextCursor);
    }

    return {
      cursor: nextCursor,
      processed,
      retried,
      duplicates,
      ignored,
      failed,
      fetched: batch.events.length,
    };
  }

  private async processEvent(
    event: BlockchainEvent,
    source: string,
  ): Promise<"processed" | "duplicate" | "ignored" | "failed"> {
    const stored = await this.repository.upsertEventLog(event, source);

    if (stored.status === "processed") {
      return "duplicate";
    }

    if (stored.status === "ignored") {
      return "ignored";
    }

    await this.repository.markProcessing(event.id);

    try {
      await this.applyEvent(event);
      await this.repository.markProcessed(event.id);
      return "processed";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown blockchain sync error";

      if (error instanceof IgnoredEventError) {
        await this.repository.markIgnored(event.id, message);
        return "ignored";
      }

      if (error instanceof PermanentSyncError) {
        await this.repository.markFailed(event.id, message);
        return "failed";
      }

      await this.repository.markRetrying(event.id, message);
      return "failed";
    }
  }

  private async applyEvent(event: BlockchainEvent): Promise<void> {
    switch (event.type) {
      case "ownership.updated":
      case "snippet.transferred":
        await this.repository.syncSnippetOwnership({
          snippetId: requireString(event.snippetId, "snippetId"),
          newOwnerWalletAddress: requireString(
            event.newOwnerWalletAddress,
            "newOwnerWalletAddress",
          ),
          previousOwnerWalletAddress: event.previousOwnerWalletAddress ?? null,
          txHash: event.txHash ?? null,
          timestamp: event.timestamp,
          metadata: event.metadata ?? null,
        });
        return;

      case "verification.wallet":
        await this.repository.upsertWalletVerification({
          walletAddress: requireString(event.walletAddress, "walletAddress"),
          txHash: event.txHash ?? null,
          timestamp: event.timestamp,
          metadata: event.metadata ?? null,
        });
        return;

      case "verification.snippet":
        await this.repository.recordSnippetVerification({
          snippetId: requireString(event.snippetId, "snippetId"),
          walletAddress: requireString(event.walletAddress, "walletAddress"),
          signature: event.signature ?? null,
          message: event.message ?? null,
          txHash: event.txHash ?? null,
          timestamp: event.timestamp,
        });
        return;

      case "permission.granted":
      case "permission.revoked":
        await this.repository.syncPermission({
          snippetId: requireString(event.snippetId, "snippetId"),
          targetWalletAddress: requireString(
            event.targetWalletAddress,
            "targetWalletAddress",
          ),
          actorWalletAddress: requireString(
            event.actorWalletAddress,
            "actorWalletAddress",
          ),
          permissionType: requirePermissionType(event.permissionType),
          active: event.type === "permission.granted",
          txHash: event.txHash ?? null,
          timestamp: event.timestamp,
        });
        return;

      default:
        throw new IgnoredEventError(`Unsupported event type: ${event.type}`);
    }
  }
}

function normalizeEvent(input: unknown): BlockchainEvent {
  const record = isRecord(input) ? input : {};
  const metadata = readRecord(record.metadata) ?? readRecord(record.payload) ?? null;

  return {
    id: readString(record.id) ?? hashEvent(record),
    type: readString(record.type) ?? readString(record.eventType) ?? "unknown",
    timestamp:
      readString(record.timestamp) ??
      readString(record.createdAt) ??
      readString(record.created_at) ??
      new Date().toISOString(),
    cursor: readString(record.cursor) ?? readString(record.pagingToken) ?? null,
    txHash:
      readString(record.txHash) ??
      readString(record.transactionHash) ??
      readString(record.tx_hash) ??
      null,
    contractId: readString(record.contractId) ?? readString(record.contract_id) ?? null,
    ledger: readNumber(record.ledger),
    snippetId:
      readString(record.snippetId) ??
      readString(metadata?.snippetId) ??
      readString(metadata?.snippet_id) ??
      null,
    walletAddress:
      readString(record.walletAddress) ??
      readString(metadata?.walletAddress) ??
      readString(metadata?.wallet_address) ??
      null,
    previousOwnerWalletAddress:
      readString(record.previousOwnerWalletAddress) ??
      readString(metadata?.previousOwnerWalletAddress) ??
      readString(metadata?.oldOwnerWalletAddress) ??
      readString(metadata?.previous_owner_wallet_address) ??
      null,
    newOwnerWalletAddress:
      readString(record.newOwnerWalletAddress) ??
      readString(metadata?.newOwnerWalletAddress) ??
      readString(metadata?.ownerWalletAddress) ??
      readString(metadata?.new_owner_wallet_address) ??
      null,
    actorWalletAddress:
      readString(record.actorWalletAddress) ??
      readString(metadata?.actorWalletAddress) ??
      readString(metadata?.grantedByWalletAddress) ??
      readString(metadata?.actor_wallet_address) ??
      null,
    targetWalletAddress:
      readString(record.targetWalletAddress) ??
      readString(metadata?.targetWalletAddress) ??
      readString(metadata?.granteeWalletAddress) ??
      readString(metadata?.target_wallet_address) ??
      null,
    permissionType: normalizePermissionType(
      readString(record.permissionType) ?? readString(metadata?.permissionType),
    ),
    signature:
      readString(record.signature) ??
      readString(metadata?.signature) ??
      null,
    message:
      readString(record.message) ??
      readString(metadata?.message) ??
      null,
    metadata,
  };
}

function hashEvent(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireString(
  value: string | null | undefined,
  fieldName: string,
): string {
  if (!value) {
    throw new PermanentSyncError(`Missing required event field: ${fieldName}`);
  }
  return value;
}

function requirePermissionType(
  value: PermissionType | null | undefined,
): PermissionType {
  if (!value) {
    throw new PermanentSyncError("Missing required event field: permissionType");
  }
  return value;
}

function normalizePermissionType(value: string | null | undefined): PermissionType | null {
  return value === "view" || value === "edit" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
