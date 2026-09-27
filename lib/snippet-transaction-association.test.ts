import type { PendingStellarTransaction } from "@/lib/stellar-recovery.types";

jest.mock("@/lib/stellar-recovery.repository", () => ({
  StellarRecoveryRepository: jest.fn(),
}));

jest.mock("@/lib/snippet-transaction.repository", () => ({
  SnippetTransactionRepository: jest.fn(),
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
  neon: jest.fn(() => jest.fn().mockResolvedValue([])),
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
import { StellarRecoveryRepository } from "@/lib/stellar-recovery.repository";
import { appendActivityLog } from "@/lib/activity-logger";
import * as stellar from "@/lib/stellar";

const MEMO_REF = "snip:0123456789ab";
const BATCH_MEMO_REF = "snipb:fedcba987654";

function createRecord(
  overrides: Partial<PendingStellarTransaction> = {},
): PendingStellarTransaction {
  return {
    id: "rec-1",
    idempotency_key: "anchor:snippet-1:2026-09-25",
    tx_type: "hash_anchoring",
    status: "pending",
    payload: { snippetId: "snippet-1", contentHash: "hash-1" },
    stellar_tx_hash: null,
    stellar_ledger: null,
    attempt_count: 0,
    max_attempts: 5,
    last_error: null,
    next_retry_at: null,
    callback_status: "pending",
    created_at: "2026-09-25T00:00:00.000Z",
    updated_at: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

function loggedActions(): string[] {
  return (appendActivityLog as jest.Mock).mock.calls.map((call) => call[0]);
}

describe("StellarRecoveryService snippet memo associations", () => {
  let repo: Record<string, jest.Mock>;
  let snippetTransactions: Record<string, jest.Mock>;
  let service: StellarRecoveryService;

  beforeEach(() => {
    repo = {
      createPending: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
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
    };

    snippetTransactions = {
      linkPending: jest.fn(),
      markConfirmed: jest.fn(),
      markFailed: jest.fn(),
      findBySnippetId: jest.fn(),
      findByTransactionHash: jest.fn(),
      findByMemoRef: jest.fn(),
    };

    service = new StellarRecoveryService(
      repo as unknown as StellarRecoveryRepository,
      snippetTransactions as any,
    );

    jest.clearAllMocks();
  });

  it("links a submitted transaction to its snippet through the memo reference", async () => {
    repo.createPending.mockResolvedValue(createRecord());
    (stellar.submitHashToStellar as jest.Mock).mockResolvedValue({
      success: true,
      transactionHash: "tx-hash-1",
      ledger: 100,
      memo: `${MEMO_REF}:hash1`,
      memoRef: MEMO_REF,
    });

    await service.submitHashAnchoring({
      idempotencyKey: "anchor:snippet-1:2026-09-25",
      snippetId: "snippet-1",
      contentHash: "hash-1",
    });

    expect(snippetTransactions.linkPending).toHaveBeenCalledWith({
      snippetId: "snippet-1",
      transactionHash: "tx-hash-1",
      memoRef: MEMO_REF,
      txType: "hash_anchoring",
    });
    expect(snippetTransactions.markConfirmed).toHaveBeenCalledWith({
      transactionHash: "tx-hash-1",
      ledgerSequence: 12345,
    });
    expect(loggedActions()).toContain("stellar.memo.attached");
    expect(loggedActions()).toContain("snippet.transaction.linked");
    expect(loggedActions()).toContain("snippet.transaction.confirmed");
  });

  it("associates every snippet referenced by a batch transaction", async () => {
    repo.createPending.mockResolvedValue(
      createRecord({
        idempotency_key: "batch:1",
        tx_type: "batch_hash",
        payload: {
          snippets: [
            { id: "snippet-1", hash: "hash-1" },
            { id: "snippet-2", hash: "hash-2" },
          ],
        },
      }),
    );
    (stellar.submitBatchHashToStellar as jest.Mock).mockResolvedValue({
      success: true,
      transactionHash: "tx-batch",
      memo: BATCH_MEMO_REF,
      memoRef: BATCH_MEMO_REF,
    });

    await service.submitBatchHash({
      idempotencyKey: "batch:1",
      snippets: [
        { id: "snippet-1", hash: "hash-1" },
        { id: "snippet-2", hash: "hash-2" },
      ],
    });

    expect(snippetTransactions.linkPending).toHaveBeenCalledTimes(2);
    expect(snippetTransactions.linkPending).toHaveBeenCalledWith(
      expect.objectContaining({ snippetId: "snippet-1", memoRef: BATCH_MEMO_REF }),
    );
    expect(snippetTransactions.linkPending).toHaveBeenCalledWith(
      expect.objectContaining({ snippetId: "snippet-2", memoRef: BATCH_MEMO_REF }),
    );
  });

  it("never writes an association when the transaction has no memo reference", async () => {
    repo.createPending.mockResolvedValue(createRecord());
    (stellar.submitHashToStellar as jest.Mock).mockResolvedValue({
      success: true,
      transactionHash: "tx-hash-2",
      ledger: 200,
    });

    await service.submitHashAnchoring({
      idempotencyKey: "anchor:snippet-2:2026-09-25",
      snippetId: "snippet-1",
      contentHash: "hash-1",
    });

    expect(snippetTransactions.linkPending).not.toHaveBeenCalled();
    expect(repo.markSubmitted).toHaveBeenCalledWith({
      id: "rec-1",
      stellarTxHash: "tx-hash-2",
    });
  });

  it("keeps the transaction flow alive when association persistence fails", async () => {
    repo.createPending.mockResolvedValue(createRecord());
    (stellar.submitHashToStellar as jest.Mock).mockResolvedValue({
      success: true,
      transactionHash: "tx-hash-3",
      ledger: 300,
      memoRef: MEMO_REF,
    });
    snippetTransactions.linkPending.mockRejectedValue(new Error("database down"));

    await expect(
      service.submitHashAnchoring({
        idempotencyKey: "anchor:snippet-3:2026-09-25",
        snippetId: "snippet-1",
        contentHash: "hash-1",
      }),
    ).resolves.toBeDefined();

    expect(repo.markSubmitted).toHaveBeenCalled();
    expect(repo.markDead).not.toHaveBeenCalled();
    expect(snippetTransactions.markConfirmed).toHaveBeenCalled();
  });

  it("marks an existing association as failed when submission does not succeed", async () => {
    repo.createPending.mockResolvedValue(
      createRecord({ stellar_tx_hash: "tx-previous" }),
    );
    (stellar.submitHashToStellar as jest.Mock).mockResolvedValue({
      success: false,
      error: "tx_failed",
    });

    await service.submitHashAnchoring({
      idempotencyKey: "anchor:snippet-4:2026-09-25",
      snippetId: "snippet-1",
      contentHash: "hash-1",
    });

    expect(snippetTransactions.linkPending).not.toHaveBeenCalled();
    expect(snippetTransactions.markFailed).toHaveBeenCalledWith({
      transactionHash: "tx-previous",
      errorMessage: "tx_failed",
    });
    expect(loggedActions()).toContain("snippet.transaction.failed");
  });
});
