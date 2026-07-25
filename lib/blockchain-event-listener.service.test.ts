import type {
  BlockchainEvent,
  BlockchainEventSource,
  StoredBlockchainEvent,
} from "@/lib/blockchain-event-listener.types";
import type { BlockchainEventListenerRepositoryLike } from "@/lib/blockchain-event-listener.service";
import { BlockchainEventListenerService } from "@/lib/blockchain-event-listener.service";

function createStoredEvent(
  event: BlockchainEvent,
  overrides: Partial<StoredBlockchainEvent> = {},
): StoredBlockchainEvent {
  return {
    ...event,
    status: overrides.status ?? "pending",
    attempts: overrides.attempts ?? 0,
    source: overrides.source ?? "test-source",
    lastError: overrides.lastError ?? null,
  };
}

describe("BlockchainEventListenerService", () => {
  let repository: jest.Mocked<BlockchainEventListenerRepositoryLike>;
  let source: jest.Mocked<BlockchainEventSource>;

  beforeEach(() => {
    repository = {
      getCursor: jest.fn().mockResolvedValue("cursor-1"),
      saveCursor: jest.fn().mockResolvedValue(undefined),
      upsertEventLog: jest.fn(),
      getRetryableEvents: jest.fn().mockResolvedValue([]),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markProcessed: jest.fn().mockResolvedValue(undefined),
      markIgnored: jest.fn().mockResolvedValue(undefined),
      markRetrying: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      syncSnippetOwnership: jest.fn().mockResolvedValue(undefined),
      upsertWalletVerification: jest.fn().mockResolvedValue(undefined),
      recordSnippetVerification: jest.fn().mockResolvedValue(undefined),
      syncPermission: jest.fn().mockResolvedValue(undefined),
    };

    source = {
      fetchEvents: jest.fn().mockResolvedValue({
        events: [],
        nextCursor: "cursor-1",
        source: "test-source",
      }),
    };
  });

  it("processes ownership transfer events and saves the newest cursor", async () => {
    const event: BlockchainEvent = {
      id: "evt-1",
      type: "snippet.transferred",
      timestamp: "2026-07-24T00:00:00.000Z",
      cursor: "cursor-2",
      txHash: "tx-1",
      snippetId: "snippet-1",
      previousOwnerWalletAddress: "GOLDOWNER12345678901234567890123456789012345678901234567",
      newOwnerWalletAddress: "GNEWOWNER12345678901234567890123456789012345678901234567",
      metadata: { purchaseId: "purchase-1" },
    };

    source.fetchEvents.mockResolvedValue({
      events: [event],
      nextCursor: "cursor-2",
      source: "test-source",
    });
    repository.upsertEventLog.mockResolvedValue(createStoredEvent(event));

    const service = new BlockchainEventListenerService(repository, source);
    const summary = await service.sync();

    expect(repository.syncSnippetOwnership).toHaveBeenCalledWith({
      snippetId: "snippet-1",
      newOwnerWalletAddress:
        "GNEWOWNER12345678901234567890123456789012345678901234567",
      previousOwnerWalletAddress:
        "GOLDOWNER12345678901234567890123456789012345678901234567",
      txHash: "tx-1",
      timestamp: "2026-07-24T00:00:00.000Z",
      metadata: { purchaseId: "purchase-1" },
    });
    expect(repository.markProcessed).toHaveBeenCalledWith("evt-1");
    expect(repository.saveCursor).toHaveBeenCalledWith(
      "stellar-app-events",
      "cursor-2",
    );
    expect(summary).toMatchObject({
      processed: 1,
      duplicates: 0,
      failed: 0,
      cursor: "cursor-2",
    });
  });

  it("skips events that were already processed", async () => {
    const event: BlockchainEvent = {
      id: "evt-duplicate",
      type: "verification.wallet",
      timestamp: "2026-07-24T00:00:00.000Z",
      cursor: "cursor-2",
      walletAddress: "GWALLET123456789012345678901234567890123456789012345678",
    };

    source.fetchEvents.mockResolvedValue({
      events: [event],
      nextCursor: "cursor-2",
      source: "test-source",
    });
    repository.upsertEventLog.mockResolvedValue(
      createStoredEvent(event, { status: "processed" }),
    );

    const service = new BlockchainEventListenerService(repository, source);
    const summary = await service.sync();

    expect(repository.markProcessing).not.toHaveBeenCalled();
    expect(repository.upsertWalletVerification).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      processed: 0,
      duplicates: 1,
      failed: 0,
    });
  });

  it("retries transient failures from the retry queue before fetching new events", async () => {
    const retryEvent: BlockchainEvent = {
      id: "evt-retry",
      type: "permission.granted",
      timestamp: "2026-07-24T00:00:00.000Z",
      cursor: "cursor-retry",
      txHash: "tx-retry",
      snippetId: "snippet-9",
      actorWalletAddress: "GACTOR1234567890123456789012345678901234567890123456789",
      targetWalletAddress: "GTARGET123456789012345678901234567890123456789012345678",
      permissionType: "edit",
    };

    repository.getRetryableEvents.mockResolvedValue([
      createStoredEvent(retryEvent, { status: "retrying", attempts: 1 }),
    ]);
    repository.upsertEventLog.mockResolvedValue(
      createStoredEvent(retryEvent, { status: "retrying", attempts: 1 }),
    );

    const service = new BlockchainEventListenerService(repository, source);
    const summary = await service.sync();

    expect(repository.syncPermission).toHaveBeenCalledWith({
      snippetId: "snippet-9",
      targetWalletAddress:
        "GTARGET123456789012345678901234567890123456789012345678",
      actorWalletAddress:
        "GACTOR1234567890123456789012345678901234567890123456789",
      permissionType: "edit",
      active: true,
      txHash: "tx-retry",
      timestamp: "2026-07-24T00:00:00.000Z",
    });
    expect(summary).toMatchObject({
      processed: 1,
      retried: 1,
      failed: 0,
    });
  });

  it("marks malformed events as permanently failed", async () => {
    const malformedEvent: BlockchainEvent = {
      id: "evt-bad",
      type: "verification.snippet",
      timestamp: "2026-07-24T00:00:00.000Z",
      cursor: "cursor-3",
      walletAddress: "GWALLET123456789012345678901234567890123456789012345678",
    };

    source.fetchEvents.mockResolvedValue({
      events: [malformedEvent],
      nextCursor: "cursor-3",
      source: "test-source",
    });
    repository.upsertEventLog.mockResolvedValue(createStoredEvent(malformedEvent));

    const service = new BlockchainEventListenerService(repository, source);
    const summary = await service.sync();

    expect(repository.markFailed).toHaveBeenCalledWith(
      "evt-bad",
      "Missing required event field: snippetId",
    );
    expect(repository.markRetrying).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      processed: 0,
      failed: 1,
    });
  });
});
