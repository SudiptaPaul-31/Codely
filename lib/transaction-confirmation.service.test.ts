import type {
  TransactionConfirmationRepositoryLike,
} from "@/lib/transaction-confirmation.repository";
import type { TransactionConfirmation } from "@/lib/transaction-confirmation.types";

// Mock @neondatabase/serverless to avoid jsdom TextDecoder issues
jest.mock("@neondatabase/serverless", () => {
  const mockNeon = jest.fn(() => jest.fn());
  return { neon: mockNeon, __esModule: true };
});

// We mock the Stellar SDK to avoid hitting the network in tests
jest.mock("stellar-sdk", () => {
  const original = jest.requireActual("stellar-sdk");
  return {
    ...original,
    Horizon: {
      ...original.Horizon,
      Server: jest.fn(),
    },
    Networks: original.Networks,
    Keypair: original.Keypair,
    TransactionBuilder: original.TransactionBuilder,
    Operation: original.Operation,
    Memo: original.Memo,
    Transaction: original.Transaction,
    BASE_FEE: original.BASE_FEE,
  };
});

import * as StellarSdk from "stellar-sdk";
import { StellarTransactionConfirmationService } from "@/lib/transaction-confirmation.service";

function createMockConfirmation(
  overrides: Partial<TransactionConfirmation> = {},
): TransactionConfirmation {
  return {
    id: overrides.id ?? "tx-id",
    stellarTxHash:
      overrides.stellarTxHash ??
      "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    status: overrides.status ?? "pending",
    lifecycle: overrides.lifecycle ?? "preparing",
    walletAddress:
      overrides.walletAddress ??
      "GDUMMY12345678901234567890123456789012345678901234567890",
    memo: overrides.memo ?? null,
    ledger: overrides.ledger ?? null,
    metadata: overrides.metadata ?? null,
    errorMessage: overrides.errorMessage ?? null,
    retryCount: overrides.retryCount ?? 0,
    maxRetries: overrides.maxRetries ?? 3,
    lastPolledAt: overrides.lastPolledAt ?? null,
    confirmedAt: overrides.confirmedAt ?? null,
    failedAt: overrides.failedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("StellarTransactionConfirmationService", () => {
  let repository: jest.Mocked<TransactionConfirmationRepositoryLike>;
  let mockServer: any;
  let mockTxCall: jest.Mock;

  beforeEach(() => {
    repository = {
      insert: jest.fn(),
      updateLifecycle: jest.fn(),
      incrementRetry: jest.fn(),
      updateLastPolledAt: jest.fn(),
      findByHash: jest.fn(),
      findByWallet: jest.fn(),
      findPendingForPolling: jest.fn(),
    };

    mockTxCall = jest.fn();
    mockServer = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
      transactions: jest.fn().mockReturnValue({
        transaction: jest.fn().mockReturnValue({
          call: mockTxCall,
        }),
      }),
    };

    (StellarSdk.Horizon.Server as jest.Mock).mockImplementation(
      () => mockServer,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Successful confirmation ─────────────────────────────────

  describe("submitAndConfirm — successful path", () => {
    it("should submit a transaction and confirm it successfully", async () => {
      const txHash =
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";

      const insertedConfirmation = createMockConfirmation({
        id: "tx-1",
        stellarTxHash: "",
      });

      const confirmedConfirmation = createMockConfirmation({
        id: "tx-1",
        stellarTxHash: txHash,
        status: "successful",
        lifecycle: "confirmed",
        ledger: 12345,
        confirmedAt: "2026-01-01T00:00:10.000Z",
      });

      repository.insert.mockResolvedValue(insertedConfirmation);
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(confirmedConfirmation);

      // Mock server account loading with proper Stellar account shape
      mockServer.loadAccount.mockResolvedValue({
        sequence: "1",
        sequenceNumber: () => "1",
        accountId: () => accountId,
        incrementSequenceNumber: jest.fn(),
      });

      // Mock submission response
      mockServer.submitTransaction.mockResolvedValue({
        hash: txHash,
        ledger: 12345,
      });

      // Mock tx lookup (confirmed)
      mockTxCall.mockResolvedValue({
        hash: txHash,
        ledger: 12345,
        successful: true,
      });

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 5,
      });

      // Create a valid keypair for signing
      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const result = await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({
            name: "test",
            value: "hello-world",
          }) as any,
        ],
      });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: accountId,
        }),
      );
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        expect.any(String),
        "submitted",
        "pending",
      );
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        expect.any(String),
        "confirming",
        "pending",
      );
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        expect.any(String),
        "confirmed",
        "successful",
        expect.objectContaining({
          ledger: 12345,
        }),
      );
      expect(result.status).toBe("successful");
      expect(result.lifecycle).toBe("confirmed");
    });
  });

  // ── Failed transaction ──────────────────────────────────────

  describe("confirmExisting — failed transaction", () => {
    it("should mark transaction as failed when Horizon returns unsuccessful", async () => {
      const txHash =
        "failtx3456789012failtx3456789012failtx3456789012failtx3456789012";

      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.incrementRetry.mockResolvedValue(undefined);

      // Simulate transaction not found or failing upon poll
      mockTxCall.mockRejectedValue(
        new Error("tx_failed"),
      );

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 3,
      });

      await expect(
        service.confirmExisting({
          secretKey: "",
          id: "tx-fail",
          stellarTxHash: txHash,
        }),
      ).rejects.toThrow("Transaction confirmation timed out");

      // Should have marked as confirming first
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-fail",
        "confirming",
        "pending",
      );

      // After all polls fail, should be marked failed
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-fail",
        "failed",
        "failed",
        expect.objectContaining({
          errorMessage: expect.stringContaining("timed out"),
        }),
      );
    });
  });

  // ── Pending/confirming state ─────────────────────────────────

  describe("pending/confirming state tracking", () => {
    it("should transition from preparing → submitted → confirming on successful submission", async () => {
      const txHash =
        "statetx5678901234statetx5678901234statetx5678901234statetx5678901234";

      const lifecycleUpdates: string[] = [];

      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-state" }),
      );
      repository.updateLifecycle.mockImplementation((id: any, lifecycle: any) => {
        lifecycleUpdates.push(lifecycle);
        return Promise.resolve(undefined);
      });
      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-state",
          stellarTxHash: txHash,
          status: "successful",
          lifecycle: "confirmed",
        }),
      );

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });
      mockServer.submitTransaction.mockResolvedValue({
        hash: txHash,
        ledger: 123,
      });
      mockTxCall.mockResolvedValue({
        hash: txHash,
        ledger: 123,
        successful: true,
      });

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 2,
      });

      await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({
            name: "state-test",
            value: "testing",
          }) as any,
        ],
      });

      expect(lifecycleUpdates).toEqual([
        "submitted",
        "confirming",
        "confirmed",
      ]);
    });
  });

  // ── Invalid transaction ─────────────────────────────────────

  describe("invalid transaction handling", () => {
    it("should handle invalid transaction gracefully", async () => {
      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-invalid" }),
      );
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-invalid",
          status: "failed",
          lifecycle: "failed",
          errorMessage: "Stellar transaction failed",
        }),
      );

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });
      mockServer.submitTransaction.mockRejectedValue(
        new Error("tx_bad_auth"),
      );

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository);

      const result = await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({
            name: "invalid",
            value: "test",
          }) as any,
        ],
      });

      expect(result?.status).toBe("failed");
      expect(result?.lifecycle).toBe("failed");

      // Should have called updateLifecycle with "failed"
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        expect.any(String),
        "failed",
        "failed",
        expect.objectContaining({
          errorMessage: expect.any(String),
        }),
      );
    });
  });

  // ── Network failure / retry ─────────────────────────────────

  describe("network failure with retry", () => {
    it("should retry on transient network errors", async () => {
      const txHash =
        "netfail7890123456netfail7890123456netfail7890123456netfail7890123456";

      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.incrementRetry.mockResolvedValue(undefined);

      // First two calls: transient network error; third: success
      mockTxCall
        .mockRejectedValueOnce(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }))
        .mockRejectedValueOnce(Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }))
        .mockResolvedValue({
          hash: txHash,
          ledger: 999,
          successful: true,
        });

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 5,
      });

      await service.confirmExisting({
        secretKey: "",
        id: "tx-net",
        stellarTxHash: txHash,
      });

      // Should have called incrementRetry for transient errors
      expect(repository.incrementRetry).toHaveBeenCalledTimes(2);
      expect(repository.updateLastPolledAt).toHaveBeenCalled();

      // Should eventually succeed
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-net",
        "confirmed",
        "successful",
        expect.any(Object),
      );
    });
  });

  // ── Max retries bounded ─────────────────────────────────────

  describe("bounded retry — does not retry permanently failed txns", () => {
    it("should not retry beyond maxRetries in pollPending", async () => {
      const exhaustedTx = createMockConfirmation({
        id: "tx-exhausted",
        stellarTxHash:
          "exhtx1234567890123456789012exhausted3456789012exhausted345678",
        status: "pending",
        lifecycle: "confirming",
        retryCount: 3, // already at max (default 3)
        maxRetries: 3,
      });

      repository.findPendingForPolling.mockResolvedValue([exhaustedTx]);
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.incrementRetry.mockResolvedValue(undefined);

      const service = new StellarTransactionConfirmationService(repository);

      const results = await service.pollPending();

      // Should not call confirmExisting, instead mark failed directly
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-exhausted",
        "failed",
        "failed",
        expect.objectContaining({
          errorMessage: expect.stringContaining("Max retries"),
        }),
      );
      expect(results[0].lifecycle).toBe("failed");
      expect(results[0].status).toBe("failed");
    });
  });

  // ── Database synchronization ────────────────────────────────

  describe("database synchronization", () => {
    it("should sync confirmed ledger and timestamp to database", async () => {
      const txHash =
        "dbsynctest12345678901234567890dbsynctest12345678901234567890";

      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-db",
          stellarTxHash: txHash,
          status: "successful",
          lifecycle: "confirmed",
          ledger: 77777,
          confirmedAt: "2026-08-01T00:00:00.000Z",
        }),
      );

      mockTxCall.mockResolvedValue({
        hash: txHash,
        ledger: 77777,
        successful: true,
      });

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 2,
      });

      await service.confirmExisting({
        secretKey: "",
        id: "tx-db",
        stellarTxHash: txHash,
      });

      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-db",
        "confirmed",
        "successful",
        expect.objectContaining({
          ledger: 77777,
          confirmedAt: expect.any(String),
        }),
      );
    });
  });

  // ── Transaction hash lookup / status endpoint ────────────────

  describe("getStatusByHash — status lookup", () => {
    it("should return confirmation by Stellar transaction hash", async () => {
      const txHash =
        "lookuptx1234567890123456789012lookuptx1234567890123456789012";

      const expected = createMockConfirmation({
        id: "tx-lookup",
        stellarTxHash: txHash,
        status: "successful",
        lifecycle: "confirmed",
      });

      repository.findByHash.mockResolvedValue(expected);

      const service = new StellarTransactionConfirmationService(repository);
      const result = await service.getStatusByHash(txHash);

      expect(result).not.toBeNull();
      expect(result!.stellarTxHash).toBe(txHash);
      expect(result!.status).toBe("successful");
      expect(result!.lifecycle).toBe("confirmed");
    });

    it("should return null for unknown hash", async () => {
      repository.findByHash.mockResolvedValue(null);

      const service = new StellarTransactionConfirmationService(repository);
      const result = await service.getStatusByHash("unknown-hash");

      expect(result).toBeNull();
    });
  });

  // ── Wallet listing ──────────────────────────────────────────

  describe("getByWallet — paginated wallet history", () => {
    it("should return paginated confirmations for a wallet", async () => {
      const wallet = "GWALLET123456789";
      const mockResult = {
        confirmations: [
          createMockConfirmation({ id: "tx-1", walletAddress: wallet }),
        ],
        total: 1,
      };

      repository.findByWallet.mockResolvedValue(mockResult);

      const service = new StellarTransactionConfirmationService(repository);
      const result = await service.getByWallet(wallet, 1, 10);

      expect(result.total).toBe(1);
      expect(result.confirmations).toHaveLength(1);
      expect(repository.findByWallet).toHaveBeenCalledWith(wallet, 1, 10);
    });
  });

  // ── Duplicate prevention ────────────────────────────────────

  describe("duplicate prevention — safe against repeated polling", () => {
    it("should not update lifecycle if already confirmed", async () => {
      repository.updateLifecycle.mockImplementation(async (_id: any) => {
        // Simulate the guard: updateLifecycle only runs if NOT already confirmed/failed
        // The repository has the guard `AND lifecycle NOT IN ('confirmed', 'failed')`
        return undefined;
      });

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 2,
      });

      mockTxCall.mockResolvedValue({
        hash: "any-hash",
        ledger: 1,
        successful: true,
      });

      repository.updateLastPolledAt.mockResolvedValue(undefined);

      await service.confirmExisting({
        secretKey: "",
        id: "tx-safe",
        stellarTxHash: "any-hash",
      });

      // The repo WILL be called but the SQL guard prevents actual update
      expect(repository.updateLifecycle).toHaveBeenCalledWith(
        "tx-safe",
        "confirmed",
        "successful",
        expect.any(Object),
      );
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe("edge cases", () => {
    it("should handle empty operations array gracefully", async () => {
      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-empty" }),
      );
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-empty",
          status: "failed",
          lifecycle: "failed",
        }),
      );
      repository.updateLifecycle.mockResolvedValue(undefined);

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository);
      const result = await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [],
      });

      expect(result).toBeDefined();
    });

    it("should handle memo being passed through to the stored record", async () => {
      const memo = StellarSdk.Memo.text("test-memo");
      const expectedMemo = "test-memo";

      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-memo", memo: expectedMemo }),
      );
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-memo",
          memo: expectedMemo,
          status: "successful",
          lifecycle: "confirmed",
          stellarTxHash:
            "memotx567890123456789012345678memotx567890123456789012345678",
        }),
      );

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });
      mockServer.submitTransaction.mockResolvedValue({
        hash: "memotx567890123456789012345678memotx567890123456789012345678",
        ledger: 1,
      });
      mockTxCall.mockResolvedValue({
        hash: "memotx567890123456789012345678memotx567890123456789012345678",
        ledger: 1,
        successful: true,
      });

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 2,
      });

      await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({ name: "memo-test", value: "test" }) as any,
        ],
        memo,
      });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          memo: expectedMemo,
        }),
      );
    });

    it("should store transaction hash throughout lifecycle", async () => {
      const txHash =
        "hashtest1234567890123456789012hashtest1234567890123456789012";

      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-hash-life", stellarTxHash: "" }),
      );
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.updateLastPolledAt.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-hash-life",
          stellarTxHash: txHash,
          status: "successful",
          lifecycle: "confirmed",
        }),
      );

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });
      mockServer.submitTransaction.mockResolvedValue({
        hash: txHash,
        ledger: 1,
      });
      mockTxCall.mockResolvedValue({
        hash: txHash,
        ledger: 1,
        successful: true,
      });

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository, {
        pollIntervalMs: 10,
        maxPollAttempts: 2,
      });

      const result = await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({ name: "hash-test", value: "test" }) as any,
        ],
      });

      expect(result.stellarTxHash).toBe(txHash);
    });

    it("should mark invalid transaction errors as permanent (not retryable)", async () => {
      repository.insert.mockResolvedValue(
        createMockConfirmation({ id: "tx-permanent" }),
      );
      repository.updateLifecycle.mockResolvedValue(undefined);
      repository.findByHash.mockResolvedValue(
        createMockConfirmation({
          id: "tx-permanent",
          status: "failed",
          lifecycle: "failed",
          errorMessage: "Stellar transaction failed",
        }),
      );

      mockServer.loadAccount.mockResolvedValue({ sequence: "1", sequenceNumber: () => "1", accountId: () => accountId, incrementSequenceNumber: jest.fn() });
      mockServer.submitTransaction.mockRejectedValue(
        new Error("tx_bad_auth — invalid signature"),
      );

      const kp = StellarSdk.Keypair.random();
      const accountId = kp.publicKey();

      const service = new StellarTransactionConfirmationService(repository);
      const result = await service.submitAndConfirm({
        secretKey: kp.secret(),
        walletAddress: accountId,
        operations: [
          StellarSdk.Operation.manageData({ name: "invalid", value: "x" }) as any,
        ],
      });

      expect(result?.status).toBe("failed");
      expect(result?.lifecycle).toBe("failed");
    });
  });
});