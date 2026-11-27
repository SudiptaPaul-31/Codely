import * as StellarSdk from "stellar-sdk";
import crypto from "crypto";
import type {
  BlockchainStellarNetwork,
  BlockchainVerificationRecord,
  BlockchainVerificationRepositoryLike,
  CreateVerificationParams,
  UpdateVerificationParams,
} from "./blockchain-verification.model";
import type {
  BlockchainVerificationStatus,
  canTransition,
  isPermanentFailureReason,
  isRecoverableFailureReason,
} from "./blockchain-verification.types";
import {
  BLOCKCHAIN_VERIFICATION_STATUS_SET,
  canTransition as canTransitionValue,
  isPermanentFailureReason as isPermanentFailureReasonValue,
  isRecoverableFailureReason as isRecoverableFailureReasonValue,
} from "./blockchain-verification.types";
import { appendActivityLog } from "./activity-logger";

const HORIZON_URL_MAP: ReadonlyMap<BlockchainStellarNetwork, string> = new Map([
  ["mainnet", "https://horizon.stellar.org"],
  ["testnet", "https://horizon-testnet.stellar.org"],
]);

const NETWORK_PASSPHRASE_MAP: ReadonlyMap<BlockchainStellarNetwork, string> = new Map([
  ["mainnet", StellarSdk.Networks.PUBLIC],
  ["testnet", StellarSdk.Networks.TESTNET],
]);

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_CAP_MS = 86_400_000; // 24 hours

export class BlockchainVerificationService {
  constructor(
    private readonly repository: BlockchainVerificationRepositoryLike = new (
      require("./blockchain-verification.repository").BlockchainVerificationRepository
    )(),
  ) {}

  /**
   * Request verification for a blockchain-linked snippet.
   *
   * This endpoint does not trust any client-supplied outcome. It resolves the
   * snippet, creates or reuses a verification record, and performs an
   * authoritative verification pass against the configured Stellar network.
   */
  async requestVerification(params: {
    snippetId: string;
    transactionHash?: string | null;
    expectedOperationMeta?: string | null;
    requesterWallet?: string | null;
  }): Promise<BlockchainVerificationRecord> {
    const { snippetId, transactionHash, expectedOperationMeta, requesterWallet } = params;

    const exists = await this.repository.snippetExists(snippetId);
    if (!exists) {
      throw new Error(`Snippet not found: ${snippetId}`);
    }

    const network = this.resolveNetworkForSnippet(snippetId);

    const record = await this.findOrCreateRecord({
      snippetId,
      transactionHash,
      stellarNetwork: network,
      expectedOperationMeta,
    });

    await this.verifyRecord(record, requesterWallet);

    return this.repository.findById(record.id) ?? record;
  }

  /**
   * Authoritative verification pass for an existing record.
   *
   * This is the core rule set for issue #221:
   *  1. A transaction hash alone is never proof of success.
   *  2. A missing transaction must never become confirmed.
   *  3. A failed transaction must never become confirmed.
   *  4. A temporary network failure must not be misclassified as a permanent
   *     transaction failure.
   *  5. Only validated authoritative Stellar data can produce confirmed.
   */
  async verifyRecord(
    record: BlockchainVerificationRecord,
    requesterWallet?: string | null,
  ): Promise<BlockchainVerificationRecord> {
    const before = await this.repository.findById(record.id);
    if (!before) {
      throw new Error(`Verification record not found: ${record.id}`);
    }

    const lastCheckedAt = new Date().toISOString();

    if (!before.transactionHash) {
      return this.completeTransition(before, {
        status: "unverifiable",
        failureReason: "transaction_hash_missing",
        lastCheckedAt,
      });
    }

    const lookup = await this.lookupTransaction(before.transactionHash, before.stellarNetwork);
    if (lookup.error) {
      if (lookup.error === "transaction_not_found") {
        return this.completeTransition(before, {
          status: "failed",
          failureReason: "transaction_missing",
          lastCheckedAt,
        });
      }

      if (isRecoverableFailureReasonValue(lookup.error)) {
        return this.scheduleRetryIfEligible(before, {
          status: "retry_scheduled",
          failureReason: lookup.error,
          lastCheckedAt,
        });
      }

      return this.completeTransition(before, {
        status: "unverifiable",
        failureReason: lookup.error,
        lastCheckedAt,
      });
    }

    const tx = lookup.transaction!;

    if (!tx.successful) {
      return this.completeTransition(before, {
        status: "failed",
        failureReason: "transaction_failed",
        ledgerReference: tx.ledger,
        lastCheckedAt,
      });
    }

    if (tx.network !== before.stellarNetwork) {
      return this.completeTransition(before, {
        status: "failed",
        failureReason: "wrong_network",
        ledgerReference: tx.ledger,
        lastCheckedAt,
      });
    }

    if (before.expectedOperationMeta) {
      const operationMatch = this.matchesExpectedOperation({
        transaction: tx,
        network: before.stellarNetwork,
        expectedOperationMeta: before.expectedOperationMeta,
        snippetId: before.snippetId,
      });

      if (!operationMatch.match) {
        return this.completeTransition(before, {
          status: "failed",
          failureReason: operationMatch.reason ?? "operation_mismatch",
          ledgerReference: tx.ledger,
          lastCheckedAt,
        });
      }
    } else {
      // Without trusted expected-operation metadata we cannot assert the
      // snippet-related operation. We record the authoritative facts but do
      // not escalate to confirmed.
      return this.completeTransition(before, {
        status: "unverifiable",
        failureReason: "expected_operation_unestablished",
        ledgerReference: tx.ledger,
        lastCheckedAt,
      });
    }

    return this.completeTransition(before, {
      status: "confirmed",
      ledgerReference: tx.ledger,
      verificationTimestamp: tx.timestamp ?? lastCheckedAt,
      lastCheckedAt,
    });
  }

  async getVerificationStatus(snippetId: string): Promise<{
    snippetId: string;
    verification: BlockchainVerificationRecord | null;
  }> {
    const exists = await this.repository.snippetExists(snippetId);
    if (!exists) {
      throw new Error(`Snippet not found: ${snippetId}`);
    }

    const record = await this.repository.findLatestBySnippetId(snippetId);
    return { snippetId, verification: record };
  }

  async requireAuthorization(
    record: BlockchainVerificationRecord,
    requesterWallet: string | null,
  ): Promise<void> {
    if (!record) {
      return;
    }

    const owner = await this.repository.snippetOwner(record.snippetId);
    if (!owner) {
      return;
    }

    if (requesterWallet && requesterWallet.toUpperCase() !== owner.toUpperCase()) {
      throw new Error("Forbidden");
    }
  }

  async retryVerification(
    verificationId: string,
    requesterWallet?: string | null,
  ): Promise<BlockchainVerificationRecord> {
    const before = await this.repository.findById(verificationId);
    if (!before) {
      throw new Error(`Verification record not found: ${verificationId}`);
    }

    if (!canTransitionValue(before.status, "retry_scheduled") &&
        before.status !== "retry_scheduled" &&
        before.status !== "failed" &&
        before.status !== "unverifiable") {
      throw new Error(`Retry not allowed from status: ${before.status}`);
    }

    await this.requireAuthorization(before, requesterWallet);

    const existingNext = before.nextRetryAt;
    if (existingNext && new Date(existingNext).getTime() > Date.now() && before.status === "retry_scheduled") {
      return before;
    }

    const scheduledAt = new Date();
    const delayMs = this.computeRetryDelay(before.retryCount + 1);
    const nextRetryAt = new Date(scheduledAt.getTime() + delayMs).toISOString();

    const after = await this.repository.update({
      id: before.id,
      status: "retry_scheduled",
      retryCount: before.retryCount + 1,
      nextRetryAt,
      failureReason: isPermanentFailureReasonValue(before.failureReason)
        ? before.failureReason
        : before.failureReason ?? "retry_scheduled",
    });

    if (!after) {
      throw new Error("Failed to schedule retry");
    }

    await appendActivityLog("verification.retry_scheduled", "snippet", {
      resourceId: after.snippetId,
      metadata: {
        verificationId: after.id,
        transactionHash: after.transactionHash,
        status: after.status,
        retryCount: after.retryCount,
        failureReason: after.failureReason,
        nextRetryAt,
      },
    });

    return after;
  }

  private async findOrCreateRecord(params: {
    snippetId: string;
    transactionHash?: string | null;
    stellarNetwork: BlockchainStellarNetwork;
    expectedOperationMeta?: string | null;
  }): Promise<BlockchainVerificationRecord> {
    const { snippetId, transactionHash, stellarNetwork, expectedOperationMeta } = params;

    if (transactionHash) {
      const existing = await this.repository.findBySnippetIdAndTransactionHash(
        snippetId,
        transactionHash,
      );
      if (existing) {
        return existing;
      }
    }

    const id = crypto.randomUUID();
    const created = await this.repository.create({
      id,
      snippetId,
      transactionHash: transactionHash ?? null,
      stellarNetwork,
      status: "pending",
      expectedOperationMeta: expectedOperationMeta ?? null,
    });

    await appendActivityLog("verification.created", "snippet", {
      resourceId: snippetId,
      metadata: {
        verificationId: created.id,
        transactionHash: created.transactionHash,
        stellarNetwork,
        status: created.status,
      },
    });

    return created;
  }

  private async verifyRecordInternal(
    record: BlockchainVerificationRecord,
    lastCheckedAt: string,
  ): Promise<BlockchainVerificationRecord> {
    return this.verifyRecord(record, undefined);
  }

  private async completeTransition(
    before: BlockchainVerificationRecord,
    updates: UpdateVerificationParams,
  ): Promise<BlockchainVerificationRecord> {
    const afterStatus = updates.status;
    if (!canTransitionValue(before.status, afterStatus)) {
      throw new Error(
        `Invalid state transition for verification ${before.id}: ${before.status} -> ${afterStatus}`,
      );
    }

    const safeUpdates: UpdateVerificationParams = { id: before.id, lastCheckedAt };

    if (updates.status !== undefined) {
      safeUpdates.status = updates.status;
    }
    if (updates.ledgerReference !== undefined) {
      safeUpdates.ledgerReference = updates.ledgerReference;
    }
    if (updates.verificationTimestamp !== undefined) {
      safeUpdates.verificationTimestamp = updates.verificationTimestamp;
    }

    // Failure reasons are only recorded; confirmation timestamps and ledger
    // references are never cleared by a later failure.
    if (
      afterStatus === "failed" ||
      afterStatus === "unverifiable" ||
      afterStatus === "retry_scheduled"
    ) {
      safeUpdates.failureReason = updates.failureReason ?? before.failureReason ?? null;
    }

    const after = await this.repository.update(safeUpdates);
    if (!after) {
      throw new Error(`Failed to persist verification transition: ${before.id}`);
    }

    await appendActivityLog("verification.status_changed", "snippet", {
      resourceId: after.snippetId,
      metadata: {
        verificationId: after.id,
        previousStatus: before.status,
        status: after.status,
        transactionHash: after.transactionHash,
        ledgerReference: after.ledgerReference,
        failureReason: after.failureReason,
      },
    });

    return after;
  }

  private async scheduleRetryIfEligible(
    before: BlockchainVerificationRecord,
    updates: UpdateVerificationParams,
  ): Promise<BlockchainVerificationRecord> {
    if (before.retryCount >= DEFAULT_MAX_RETRIES) {
      const final = await this.completeTransition(before, {
        status: "failed",
        failureReason:
          before.failureReason ??
          "retry_exhausted",
        lastCheckedAt: updates.lastCheckedAt,
      });
      return final;
    }

    const scheduledAt = new Date();
    const delayMs = this.computeRetryDelay(before.retryCount + 1);
    const nextRetryAt = new Date(scheduledAt.getTime() + delayMs).toISOString();

    const retryUpdate: UpdateVerificationParams = {
      id: before.id,
      status: "retry_scheduled",
      retryCount: before.retryCount + 1,
      nextRetryAt,
      lastCheckedAt: updates.lastCheckedAt,
    };

    if (updates.failureReason !== undefined) {
      retryUpdate.failureReason = updates.failureReason;
    }

    const after = await this.repository.update(retryUpdate);
    if (!after) {
      throw new Error(`Failed to schedule retry: ${before.id}`);
    }

    await appendActivityLog("verification.retry_scheduled", "snippet", {
      resourceId: after.snippetId,
      metadata: {
        verificationId: after.id,
        transactionHash: after.transactionHash,
        status: after.status,
        retryCount: after.retryCount,
        failureReason: after.failureReason,
        nextRetryAt,
      },
    });

    return after;
  }

  private async lookupTransaction(
    transactionHash: string,
    network: BlockchainStellarNetwork,
  ): Promise<{ transaction: VerifiedStellarTransaction; error?: never } | { error: string }> {
    const horizonUrl = HORIZON_URL_MAP.get(network);
    if (!horizonUrl) {
      return { error: "unsupported_tx_type" };
    }

    const server = new StellarSdk.Horizon.Server(horizonUrl);
    try {
      const response = await server.transactions().hash(transactionHash).call();
      if (!response) {
        return { error: "transaction_not_found" };
      }
      return {
        transaction: {
          hash: transactionHash,
          ledger: response.ledger,
          successful: response.successful,
          network,
          timestamp: response.created_at ?? null,
          memo: response.memo ?? null,
          transactionMemo: response.transaction?.memo ?? null,
          sourceAccount: response.source ?? null,
          operations: response.operations ?? [],
          feeCharged: response.fee_charged ?? null,
          resultXdr: response.result_xdr ?? null,
          resultMetaXdr: response.result_meta_xdr ?? null,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("econnreset") ||
        message.toLowerCase().includes("econnrefused") ||
        message.toLowerCase().includes("network")
      ) {
        return { error: "network_timeout" };
      }
      if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
        return { error: "rate_limited" };
      }
      if (
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.toLowerCase().includes("temporarily unavailable")
      ) {
        return { error: "horizon_unavailable" };
      }
      if (message.includes("404")) {
        return { error: "transaction_not_found" };
      }
      return { error: "horizon_timeout" };
    }
  }

  private resolveNetworkForSnippet(snippetId: string): BlockchainStellarNetwork {
    const configured =
      process.env.NEXT_PUBLIC_STELLAR_NETWORK?.trim().toLowerCase() ??
      process.env.STELLAR_NETWORK?.trim().toLowerCase() ??
      "testnet";

    if (configured === "mainnet") {
      return "mainnet";
    }
    return "testnet";
  }

  private matchesExpectedOperation(params: {
    transaction: VerifiedStellarTransaction;
    network: BlockchainStellarNetwork;
    expectedOperationMeta: string;
    snippetId: string;
  }): { match: boolean; reason?: string } {
    const parsed = safeParseExpectedOperationMeta(params.expectedOperationMeta);
    if (!parsed) {
      return { match: false, reason: "expected_operation_unestablished" };
    }

    if (params.transaction.network !== params.network) {
      return { match: false, reason: "wrong_network" };
    }

    if (!params.transaction.successful) {
      return { match: false, reason: "transaction_failed" };
    }

    if (parsed.operationType === "hash_anchoring") {
      return this.matchHashAnchoring(params, parsed);
    }

    if (parsed.operationType === "ownership_transfer") {
      return this.matchOwnershipTransfer(params, parsed);
    }

    if (parsed.operationType === "license_mint") {
      return this.matchLicenseMint(params, parsed);
    }

    return { match: false, reason: "unsupported_tx_type" };
  }

  private matchHashAnchoring(
    params: {
      transaction: VerifiedStellarTransaction;
      network: BlockchainStellarNetwork;
      expectedOperationMeta: string;
      snippetId: string;
    },
    parsed: ParsedExpectedOperationMeta,
  ): { match: boolean; reason?: string } {
    const memo = extractMemoText(params.transaction);

    const expectedRef = extractSnippetMemoRef(params.snippetId);
    if (!memo || !memo.includes(expectedRef)) {
      return { match: false, reason: "operation_mismatch" };
    }

    if (parsed.contentHash && params.transaction.transactionMemo) {
      const hashSuffix =
        params.transaction.transactionMemo.split(":").pop()?.slice(0, 8) ?? "";
      if (hashSuffix.toLowerCase() !== parsed.contentHash.toLowerCase()) {
        return { match: false, reason: "operation_mismatch" };
      }
    }

    return { match: true };
  }

  private matchOwnershipTransfer(
    params: {
      transaction: VerifiedStellarTransaction;
      network: BlockchainStellarNetwork;
      expectedOperationMeta: string;
      snippetId: string;
    },
    parsed: ParsedExpectedOperationMeta,
  ): { match: boolean; reason?: string } {
    const memo = extractMemoText(params.transaction);
    const expectedRef = extractSnippetMemoRef(params.snippetId);
    if (!memo || !memo.includes(expectedRef)) {
      return { match: false, reason: "operation_mismatch" };
    }

    const meta = parsed.metadata as Record<string, unknown> | undefined;
    if (meta?.oldOwnerWalletAddress && meta?.newOwnerWalletAddress) {
      const expected =
        `${String(meta.oldOwnerWalletAddress).slice(0, 12)}->${String(meta.newOwnerWalletAddress).slice(0, 12)}`;
      if (!memo.includes(expected)) {
        return { match: false, reason: "operation_mismatch" };
      }
    }

    return { match: true };
  }

  private matchLicenseMint(
    params: {
      transaction: VerifiedStellarTransaction;
      network: BlockchainStellarNetwork;
      expectedOperationMeta: string;
      snippetId: string;
    },
    parsed: ParsedExpectedOperationMeta,
  ): { match: boolean; reason?: string } {
    const memo = extractMemoText(params.transaction);
    const expectedRef = extractSnippetMemoRef(params.snippetId);
    if (!memo || !memo.includes(expectedRef)) {
      return { match: false, reason: "operation_mismatch" };
    }

    const meta = parsed.metadata as Record<string, unknown> | undefined;
    if (meta?.licenseType) {
      const expectedName = `lic:${String(params.snippetId).slice(0, 20)}`;
      const op = params.transaction.operations.find(
        (op) =>
          op.type === "manageData" &&
          String(op.name || "").toLowerCase() === expectedName.toLowerCase(),
      );
      if (!op) {
        return { match: false, reason: "operation_mismatch" };
      }
      if (
        String(op.value || "").slice(0, String(meta.licenseType).length) !==
        String(meta.licenseType)
      ) {
        return { match: false, reason: "operation_mismatch" };
      }
    }

    return { match: true };
  }

  private computeRetryDelay(attempt: number): number {
    const backoffMs = Math.min(2 ** attempt * 30_000, 900_000);
    return Math.min(backoffMs, DEFAULT_RETRY_CAP_MS);
  }
}

function safeParseExpectedOperationMeta(
  meta: string,
): ParsedExpectedOperationMeta | null {
  try {
    const parsed = JSON.parse(meta) as Record<string, unknown>;
    if (typeof parsed.operationType !== "string") {
      return null;
    }
    return {
      operationType: parsed.operationType as "hash_anchoring" | "ownership_transfer" | "license_mint" | string,
      contentHash: typeof parsed.contentHash === "string" ? parsed.contentHash : null,
      metadata: parsed.metadata ?? null,
    };
  } catch {
    return null;
  }
}

function extractMemoText(tx: VerifiedStellarTransaction): string | null {
  return (
    tx.memo ??
    tx.transactionMemo ??
    null
  );
}

function extractSnippetMemoRef(snippetId: string): string {
  const crypto = require("crypto");
  const digest = crypto.createHash("sha256").update(snippetId).digest("hex");
  return `snip:${digest.slice(0, 12)}`;
}

export interface VerifiedStellarTransaction {
  hash: string;
  ledger: number;
  successful: boolean;
  network: BlockchainStellarNetwork;
  timestamp: string | null;
  memo: string | null;
  transactionMemo: string | null;
  sourceAccount: string | null;
  operations: Array<{
    type: string;
    name?: string | null;
    value?: string | null;
  }>;
  feeCharged: number | null;
  resultXdr: string | null;
  resultMetaXdr: string | null;
}

interface ParsedExpectedOperationMeta {
  operationType: string;
  contentHash: string | null;
  metadata: Record<string, unknown> | null;
}

export class BlockchainVerificationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockchainVerificationServiceError";
  }
}
