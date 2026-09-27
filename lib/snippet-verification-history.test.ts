import type { PendingStellarTransaction } from "@/lib/stellar-recovery.types";
import type {
  RecordSnippetVerificationEventParams,
  SnippetVerificationHistoryEvent,
} from "@/lib/snippet-verification-history.types";

jest.mock("@/lib/stellar-recovery.repository", () => ({
  StellarRecoveryRepository: jest.fn(),
}));

jest.mock("@/lib/snippet-transaction.repository", () => ({
  SnippetTransactionRepository: jest.fn(),
}));

jest.mock("@/lib/snippet-verification-history.repository", () => ({
  SnippetVerificationHistoryRepository: jest.fn(),
}));

jest.mock("@/lib/activity-logger", () => ({
  appendActivityLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/stellar", () => ({
  submitOwnershipTransferMemoToStellar: jest.fn(),
  submitHashToStellar: jest.fn(),
  submitBatchHashToStellar: jest.fn(),
  mintSnippetLicenseOnStellar: jest.fn(),
  classifyStellarError: jest
    .fn()
    .mockReturnValue({ retryable: false, reason: "unknown_error" }),
}));

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => jest.fn()),
}));

jest.mock("stellar-sdk", () => ({
  Horizon: {
    Server: jest.fn(() => ({
      transactions: jest.fn(() => ({
        hash: jest.fn(() => ({
          call: jest.fn().mockResolvedValue({ ledger: 12345 }),
        })),
      })),
    })),
  },
}));

import { StellarRecoveryService } from "@/lib/stellar-recovery.service";
import type { StellarRecoveryRepository } from "@/lib/stellar-recovery.repository";
import type { SnippetVerificationHistoryRepositoryLike } from "@/lib/snippet-verification-history.repository";
import * as stellar from "@/lib/stellar";

function createMockRecord(
  overrides: Partial<PendingStellarTransaction> = {},
): PendingStellarTransaction {
  return {
    id: "test-id-1",
    idempotency_key: "own:abc:old:new:2026-08-26",
    tx_type: "ownership_transfer",
    status: "pending",
    payload: {
      snippetId: "snippet-1",
      oldOwnerWalletAddress:
        "GOLDOWNER12345678901234567890123456789012345678901234567",
      newOwnerWalletAddress:
        "GNEWOWNER12345678901234567890123456789012345678901234567",
    },
    stellar_tx_hash: null,
    stellar_ledger: null,
    attempt_count: 0,
    max_attempts: 5,
    last_error: null,
    next_retry_at: null,
    callback_status: "pending",
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("StellarRecoveryService verification history recording", () => {
  let service: StellarRecoveryService;
  let repo: jest.Mocked<StellarRecoveryRepository>;
  let history: jest.Mocked<SnippetVerificationHistoryRepositoryLike>;

  beforeEach(() => {
    repo = {
      createPending: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      findBySnippetId: jest.fn(),
      markSubmitted: jest.fn(),
      markConfirmed: jest.fn(),
      markApplied: jest.fn(),
      markFailed: jest.fn(),
      markDead: jest.fn(),
      markCallbackFailed: jest.fn(),
      findRetryable: jest.fn(),
      findConfirmedNeedingCallback: jest.fn(),
    } as any;

    history = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
      findBySnippetId: jest.fn(),
      snippetExists: jest.fn(),
    } as any;

    service = new StellarRecoveryService(repo, undefined as any, history);
    jest.clearAllMocks();
    history.recordEvent.mockResolvedValue(undefined);
  });

  describe("on successful submission", () => {
    it("records a pending event with the transaction hash", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord();
      repo.createPending.mockResolvedValue(record);

      (stellar.submitOwnershipTransferMemoToStellar as jest.Mock).mockResolvedValue(
        {
          success: true,
          transactionHash: "tx-hash-123",
          memo: "tr:test:old:new",
        },
      );

      await service.submitOwnershipTransfer({
        idempotencyKey: "own:abc:old:new:2026-08-26",
        snippetId: "snippet-1",
        oldOwnerWalletAddress: "GOLD",
        newOwnerWalletAddress: "GNEW",
      });

      expect(history.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          snippetId: "snippet-1",
          transactionHash: "tx-hash-123",
          status: "pending",
          txType: "ownership_transfer",
        }),
      );
    });
  });

  describe("on confirmation", () => {
    it("records a confirmed event with ledger sequence and verified timestamp", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord();
      repo.createPending.mockResolvedValue(record);

      (stellar.submitOwnershipTransferMemoToStellar as jest.Mock).mockResolvedValue(
        {
          success: true,
          transactionHash: "tx-hash-123",
          memo: "tr:test:old:new",
        },
      );

      await service.submitOwnershipTransfer({
        idempotencyKey: "own:abc:old:new:2026-08-26",
        snippetId: "snippet-1",
        oldOwnerWalletAddress: "GOLD",
        newOwnerWalletAddress: "GNEW",
      });

      // The mocked Horizon poll resolves with ledger 12345.
      const confirmCall = history.recordEvent.mock.calls.find(
        (call) => (call[0] as RecordSnippetVerificationEventParams).status === "confirmed",
      );
      expect(confirmCall).toBeDefined();
      expect(confirmCall![0]).toEqual(
        expect.objectContaining({
          snippetId: "snippet-1",
          transactionHash: "tx-hash-123",
          status: "confirmed",
          ledgerSequence: 12345,
        }),
      );
      expect((confirmCall![0] as RecordSnippetVerificationEventParams).verifiedAt).toBeInstanceOf(
        Date,
      );
    });
  });

  describe("on failure", () => {
    it("records a failed event with the error message when a hash exists", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord({ stellar_tx_hash: "tx-hash-456" });
      repo.createPending.mockResolvedValue(record);

      (stellar.submitOwnershipTransferMemoToStellar as jest.Mock).mockResolvedValue({
        success: false,
        error: "network down",
      });
      (stellar.classifyStellarError as jest.Mock).mockReturnValue({
        retryable: true,
        reason: "network",
      });

      await service.submitOwnershipTransfer({
        idempotencyKey: "own:abc:old:new:2026-08-26",
        snippetId: "snippet-1",
        oldOwnerWalletAddress: "GOLD",
        newOwnerWalletAddress: "GNEW",
      });

      expect(history.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          snippetId: "snippet-1",
          transactionHash: "tx-hash-456",
          status: "failed",
          errorMessage: "network down",
        }),
      );
    });

    it("records nothing when submission failed before a hash existed", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord({ stellar_tx_hash: null });
      repo.createPending.mockResolvedValue(record);

      (stellar.submitOwnershipTransferMemoToStellar as jest.Mock).mockResolvedValue({
        success: false,
        error: "bad memo",
      });

      await service.submitOwnershipTransfer({
        idempotencyKey: "own:abc:old:new:2026-08-26",
        snippetId: "snippet-1",
        oldOwnerWalletAddress: "GOLD",
        newOwnerWalletAddress: "GNEW",
      });

      expect(history.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe("failure isolation and batch handling", () => {
    it("never aborts the transaction flow when history recording fails", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord();
      repo.createPending.mockResolvedValue(record);

      (stellar.submitOwnershipTransferMemoToStellar as jest.Mock).mockResolvedValue(
        {
          success: true,
          transactionHash: "tx-hash-123",
          memo: "tr:test:old:new",
        },
      );

      history.recordEvent.mockRejectedValue(new Error("db unavailable"));

      await expect(
        service.submitOwnershipTransfer({
          idempotencyKey: "own:abc:old:new:2026-08-26",
          snippetId: "snippet-1",
          oldOwnerWalletAddress: "GOLD",
          newOwnerWalletAddress: "GNEW",
        }),
      ).resolves.toBe(record);

      expect(repo.markSubmitted).toHaveBeenCalled();
      expect(repo.markConfirmed).toHaveBeenCalled();
    });

    it("records one event per snippet for batch transactions", async () => {
      repo.findByIdempotencyKey.mockResolvedValue(null);
      const record = createMockRecord({
        tx_type: "batch_hash",
        payload: {
          snippets: [
            { id: "snippet-1", hash: "hash-1" },
            { id: "snippet-2", hash: "hash-2" },
          ],
        },
      });
      repo.createPending.mockResolvedValue(record);

      (stellar.submitBatchHashToStellar as jest.Mock).mockResolvedValue({
        success: true,
        transactionHash: "tx-hash-batch",
        memo: "batch:ref",
      });

      await service.submitBatchHash({
        idempotencyKey: "batch:abc",
        snippets: [
          { id: "snippet-1", hash: "hash-1" },
          { id: "snippet-2", hash: "hash-2" },
        ],
      });

      const pendingCalls = history.recordEvent.mock.calls.filter(
        (call) => (call[0] as RecordSnippetVerificationEventParams).status === "pending",
      );
      expect(pendingCalls).toHaveLength(2);
      expect(pendingCalls.map((c) => (c[0] as any).snippetId).sort()).toEqual([
        "snippet-1",
        "snippet-2",
      ]);
      expect(
        pendingCalls.every(
          (c) => (c[0] as any).transactionHash === "tx-hash-batch",
        ),
      ).toBe(true);
    });
  });

  describe("history reads", () => {
    it("delegates getVerificationHistory to the repository", async () => {
      const events: SnippetVerificationHistoryEvent[] = [
        {
          id: "evt-1",
          snippetId: "snippet-1",
          transactionHash: "tx-hash-123",
          ledgerSequence: 12345,
          status: "confirmed",
          txType: "hash_anchoring",
          errorMessage: null,
          verifiedAt: "2026-08-26T01:00:00.000Z",
          createdAt: "2026-08-26T00:59:00.000Z",
          updatedAt: "2026-08-26T01:00:00.000Z",
        },
      ];
      history.findBySnippetId.mockResolvedValue({ data: events, total: 1 });

      const result = await service.getVerificationHistory("snippet-1", {
        limit: 10,
        offset: 0,
      });

      expect(history.findBySnippetId).toHaveBeenCalledWith("snippet-1", {
        limit: 10,
        offset: 0,
      });
      expect(result.total).toBe(1);
      expect(result.data[0].transactionHash).toBe("tx-hash-123");
      expect(result.data[0].ledgerSequence).toBe(12345);
    });
  });
});
