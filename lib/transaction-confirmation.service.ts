import crypto from "crypto";
import * as StellarSdk from "stellar-sdk";
import type {
  PollingConfig,
  StellarTxResponse,
  TransactionConfirmation,
  TransactionLifecycle,
  TransactionStatus,
} from "@/lib/transaction-confirmation.types";
import type { TransactionConfirmationRepositoryLike } from "@/lib/transaction-confirmation.repository";
import { TransactionConfirmationRepository } from "@/lib/transaction-confirmation.repository";

const DEFAULT_POLLING_CONFIG: PollingConfig = {
  pollIntervalMs: 3_000,
  maxPollAttempts: 20,
  maxRetries: 3,
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 30_000,
};

const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
const HORIZON_URL =
  STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

export interface TransactionConfirmationServiceLike {
  submitAndConfirm(params: {
    secretKey: string;
    walletAddress: string;
    operations: any[];
    memo?: StellarSdk.Memo;
    metadata?: Record<string, unknown>;
  }): Promise<TransactionConfirmation>;
  confirmExisting(params: {
    secretKey: string;
    id: string;
    stellarTxHash: string;
  }): Promise<TransactionConfirmation>;
  getStatusByHash(stellarTxHash: string): Promise<TransactionConfirmation | null>;
  pollPending(): Promise<TransactionConfirmation[]>;
  getByWallet(
    walletAddress: string,
    page?: number,
    pageSize?: number,
  ): Promise<{ confirmations: TransactionConfirmation[]; total: number }>;
}

export class StellarTransactionConfirmationService
  implements TransactionConfirmationServiceLike
{
  private readonly pollingConfig: PollingConfig;

  constructor(
    private readonly repository: TransactionConfirmationRepositoryLike = new TransactionConfirmationRepository(),
    pollingConfig?: Partial<PollingConfig>,
  ) {
    this.pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...pollingConfig };
  }

  /**
   * Build, sign, submit, and monitor a Stellar transaction through to confirmation.
   *
   * Lifecycle: preparing → submitted → confirming → confirmed
   *                                    → failed
   */
  async submitAndConfirm(params: {
    secretKey: string;
    walletAddress: string;
    operations: any[];
    memo?: StellarSdk.Memo;
    metadata?: Record<string, unknown>;
  }): Promise<TransactionConfirmation> {
    const id = crypto.randomUUID();
    const keypair = StellarSdk.Keypair.fromSecret(params.secretKey);

    // ── preparing ──────────────────────────────────────────
    let confirmation = await this.repository.insert({
      id,
      stellarTxHash: "", // placeholder; will be updated after submission
      walletAddress: params.walletAddress,
      memo: params.memo ? memoToString(params.memo) : null,
      metadata: params.metadata ?? null,
      maxRetries: this.pollingConfig.maxRetries,
    });

    try {
      const server = new StellarSdk.Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(keypair.publicKey());

      const builder = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      for (const op of params.operations) {
        builder.addOperation(op);
      }

      if (params.memo) {
        builder.addMemo(params.memo);
      }

      const transaction = builder.setTimeout(60).build();
      transaction.sign(keypair);

      // ── submitted ─────────────────────────────────────────
      const response = await server.submitTransaction(transaction);
      const stellarTxHash = response.hash;

      await this.repository.updateLifecycle(id, "submitted", "pending");
      confirmation = { ...confirmation, lifecycle: "submitted", stellarTxHash };

      // ── confirming → confirmed ────────────────────────────
      return this.confirmExisting({
        secretKey: params.secretKey,
        id,
        stellarTxHash,
      });
    } catch (error: any) {
      const errorMessage = extractStellarError(error);
      console.error("[TxConfirmation] Submission failed:", errorMessage);

      await this.repository.updateLifecycle(id, "failed", "failed", {
        errorMessage,
        failedAt: new Date().toISOString(),
      });

      return this.getStatusByHash(confirmation.stellarTxHash || "") as Promise<TransactionConfirmation>;
    }
  }

  /**
   * Monitor an already-submitted transaction until confirmation.
   */
  async confirmExisting(params: {
    secretKey: string;
    id: string;
    stellarTxHash: string;
  }): Promise<TransactionConfirmation> {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);

    await this.repository.updateLifecycle(params.id, "confirming", "pending");

    for (let attempt = 1; attempt <= this.pollingConfig.maxPollAttempts; attempt++) {
      try {
        await this.repository.updateLastPolledAt(params.id);

        const txResponse = await server.transactions().transaction(params.stellarTxHash).call() as unknown as StellarTxResponse;

        const normalized: StellarTxResponse = {
          hash: (txResponse as any).hash || params.stellarTxHash,
          ledger: (txResponse as any).ledger,
          successful: true,
          result_xdr: (txResponse as any).result_xdr,
          result_meta_xdr: (txResponse as any).result_meta_xdr,
        };

        if (normalized.successful) {
          await this.repository.updateLifecycle(
            params.id,
            "confirmed",
            "successful",
            {
              ledger: normalized.ledger,
              confirmedAt: new Date().toISOString(),
            },
          );
          return (await this.repository.findByHash(params.stellarTxHash))!;
        }
      } catch (error: any) {
        const status = error?.response?.status;
        const errorMessage = extractStellarError(error);

        // Transaction not found yet on Horizon — keep polling
        if (status === 404) {
          console.warn(
            `[TxConfirmation] Transaction ${params.stellarTxHash} not yet on ledger (attempt ${attempt}/${this.pollingConfig.maxPollAttempts})`,
          );
        } else {
          console.error(
            `[TxConfirmation] Poll attempt ${attempt} failed for ${params.stellarTxHash}:`,
            errorMessage,
          );

          // Network errors — retry with backoff
          if (isTransientError(error) && attempt < this.pollingConfig.maxPollAttempts) {
            await this.repository.incrementRetry(params.id, errorMessage);
          }
        }
      }

      // Wait before next poll
      await sleep(this.pollingConfig.pollIntervalMs);
    }

    // Max poll attempts exhausted — mark as failed
    const errorMsg = `Transaction confirmation timed out after ${this.pollingConfig.maxPollAttempts} attempts`;
    await this.repository.updateLifecycle(params.id, "failed", "failed", {
      errorMessage: errorMsg,
      failedAt: new Date().toISOString(),
    });

    throw new Error(errorMsg);
  }

  /**
   * Submit a pre-built transaction signed externally (e.g., via Freighter/Albedo).
   *
   * Lifecycle: preparing → submitted → confirming → confirmed/failed
   */
  async submitSignedTransaction(params: {
    stellarTxHash: string;
    walletAddress: string;
    memo?: string | null;
    metadata?: Record<string, unknown>;
    signedXdr: string;
  }): Promise<TransactionConfirmation> {
    const id = crypto.randomUUID();
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);

    // ── preparing ──
    let confirmation = await this.repository.insert({
      id,
      stellarTxHash: params.stellarTxHash,
      walletAddress: params.walletAddress,
      memo: params.memo ?? null,
      metadata: params.metadata ?? null,
      maxRetries: this.pollingConfig.maxRetries,
    });

    try {
      const transaction = new StellarSdk.Transaction(
        params.signedXdr,
        NETWORK_PASSPHRASE,
      );

      // ── submitted ──
      await server.submitTransaction(transaction);

      // We already have the hash; update lifecycle
      await this.repository.updateLifecycle(id, "submitted", "pending");
      confirmation = {
        ...confirmation,
        lifecycle: "submitted",
        stellarTxHash: params.stellarTxHash,
      };

      // ── confirming → confirmed ──
      return this.confirmExisting({
        secretKey: "",
        id,
        stellarTxHash: params.stellarTxHash,
      });
    } catch (error: any) {
      const errorMessage = extractStellarError(error);
      console.error("[TxConfirmation] Submission of signed tx failed:", errorMessage);

      await this.repository.updateLifecycle(id, "failed", "failed", {
        errorMessage,
        failedAt: new Date().toISOString(),
      });

      return (await this.repository.findByHash(params.stellarTxHash))!;
    }
  }

  /**
   * Look up transaction status by Stellar transaction hash.
   */
  async getStatusByHash(
    stellarTxHash: string,
  ): Promise<TransactionConfirmation | null> {
    return this.repository.findByHash(stellarTxHash);
  }

  /**
   * Get paginated transaction confirmations for a wallet.
   */
  async getByWallet(
    walletAddress: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ confirmations: TransactionConfirmation[]; total: number }> {
    return this.repository.findByWallet(walletAddress, page, pageSize);
  }

  /**
   * Poll pending transactions and try to confirm them.
   * Intended to be called periodically (e.g., via cron/background job).
   */
  async pollPending(): Promise<TransactionConfirmation[]> {
    const pending = await this.repository.findPendingForPolling();
    const results: TransactionConfirmation[] = [];

    for (const tx of pending) {
      if (tx.retryCount >= tx.maxRetries) {
        const msg = `Max retries (${tx.maxRetries}) exceeded`;
        await this.repository.updateLifecycle(tx.id, "failed", "failed", {
          errorMessage: msg,
          failedAt: new Date().toISOString(),
        });
        results.push({ ...tx, lifecycle: "failed", status: "failed", errorMessage: msg });
        continue;
      }

      try {
        const confirmed = await this.confirmExisting({
          secretKey: "", // Not needed for polling existing txns
          id: tx.id,
          stellarTxHash: tx.stellarTxHash,
        });
        results.push(confirmed);
      } catch (error: any) {
        const errorMessage = extractStellarError(error);
        await this.repository.incrementRetry(tx.id, errorMessage);

        // If permanent error (invalid tx, etc.), don't retry
        if (isPermanentError(error, tx)) {
          await this.repository.updateLifecycle(tx.id, "failed", "failed", {
            errorMessage,
            failedAt: new Date().toISOString(),
          });
        }

        results.push({
          ...tx,
          retryCount: tx.retryCount + 1,
          errorMessage,
        });
      }
    }

    return results;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function memoToString(memo: StellarSdk.Memo): string {
  if (memo.type === StellarSdk.MemoText) {
    return (memo as any).value?.toString() ?? "";
  }
  return memo.type.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStellarError(error: any): string {
  if (error?.response?.data?.extras?.result_codes) {
    return JSON.stringify(error.response.data.extras.result_codes);
  }
  return error?.message ?? String(error);
}

/**
 * Returns true for temporary/transient errors that should be retried
 * (network interruptions, timeouts, Horizon 5xx, rate limits).
 */
function isTransientError(error: any): boolean {
  const status = error?.response?.status;
  if (status && (status === 429 || (status >= 500 && status < 600))) {
    return true;
  }
  const code = error?.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return true;
  }
  const message = String(error?.message ?? "").toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("temporarily")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true for errors that should not be retried
 * (invalid transactions, rejected signatures, insufficient funds).
 */
function isPermanentError(error: any, tx: TransactionConfirmation): boolean {
  const status = error?.response?.status;
  // Client errors (4xx) except 429, 404
  if (status && status >= 400 && status < 500 && status !== 429 && status !== 404) {
    return true;
  }
  const message = String(error?.message ?? "").toLowerCase();
  if (
    message.includes("invalid") ||
    message.includes("signature") ||
    message.includes("rejected") ||
    message.includes("insufficient") ||
    message.includes("malformed")
  ) {
    return true;
  }
  // If max retries would be exceeded, treat as permanent
  if (tx.retryCount >= tx.maxRetries) {
    return true;
  }
  return false;
}