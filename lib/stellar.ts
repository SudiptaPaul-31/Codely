
import crypto from "crypto";

import * as StellarSdk from "stellar-sdk";
import { StrKey } from "stellar-sdk";
import {
  StellarTransactionConfirmationService,
} from "@/lib/transaction-confirmation.service";
import { appendActivityLog } from "@/lib/activity-logger";
import {
  buildBatchSnippetMemo,
  buildSnippetMemo,
  generateSnippetMemoRef,
} from "@/lib/snippet-memo";
import { validateStellarAddress } from "@/lib/stellar-wallet-validation";

const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
const STELLAR_SECRET_KEY = process.env.STELLAR_SECRET_KEY || "";

const HORIZON_URL =
  STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

// ─── Fee Estimation ────────────────────────────────────────────────────────

export type FeeStatus =
  | "estimating"
  | "estimated"
  | "updated"
  | "insufficient_balance"
  | "unable_to_estimate"
  | "ready_for_submission";

export interface FeeEstimate {
  estimatedFee: string;
  asset: string;
  network: string;
  feeStatus: FeeStatus;
  estimatedAt: string;
  balanceSufficient: boolean;
  /** Total required = transaction amount + estimated fee, in stroops (string). */
  totalRequired?: string;
  /** Available balance in stroops (string), when known. */
  availableBalance?: string;
  /** Base fee per operation (stroops) used for the estimate. */
  baseFee?: string;
  /** Number of operations included in the estimate. */
  operationCount?: number;
  /** Error message when feeStatus is "unable_to_estimate". */
  error?: string;
  /** Whether the estimate came from cache. */
  cached?: boolean;
}

/** Wire-format response shape returned by /api/stellar/estimate-fee. */
export interface FeeEstimateResponse {
  estimatedFee: string;
  asset: string;
  network: string;
  feeStatus: FeeStatus;
  estimatedAt: string;
  balanceSufficient: boolean;
  totalRequired?: string;
  availableBalance?: string;
}

export interface FeeEstimateOptions {
  /** Wallet address whose balance should be validated. */
  walletAddress?: string;
  /** Transaction amount in stroops (string or number). */
  amount?: string | number;
  /** Number of operations in the transaction (default 1). */
  operationCount?: number;
  /** Override the network (defaults to configured network). */
  network?: string;
  /** Skip balance validation (useful for pure fee lookups). */
  skipBalanceCheck?: boolean;
  /** Bypass the cache and force a fresh Horizon lookup. */
  forceRefresh?: boolean;
}

export interface FeeValidationResult {
  valid: boolean;
  feeStatus: FeeStatus;
  estimate?: FeeEstimate;
  error?: string;
  /** True when the fee changed materially since the prior estimate. */
  feeChanged?: boolean;
  previousFee?: string;
  currentFee?: string;
  requiresReapproval?: boolean;
}

const STROOPS_PER_XLM = 10_000_000n;
const FEE_CACHE_TTL_MS = 30_000;
const FEE_CHANGE_THRESHOLD_STROOPS = 1n;

interface FeeCacheEntry {
  baseFee: string;
  fetchedAt: number;
}

const feeCache = new Map<string, FeeCacheEntry>();

function getHorizonUrlForNetwork(network: string): string {
  return network === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
}

function getNetworkPassphraseForNetwork(network: string): string {
  return network === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
}

function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

function toStroops(value: string | number | bigint | undefined | null): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.round(value));
  }
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  if (/^-?\d+$/.test(trimmed)) return BigInt(trimmed);
  // Treat as XLM decimal
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * STROOPS_PER_XLM + BigInt(fracPadded || "0");
}

/**
 * Fetch the current network base fee (in stroops) from Horizon.
 * Results are cached briefly to keep repeated estimation calls idempotent
 * and to tolerate transient Horizon interruptions.
 */
export async function getNetworkBaseFee(
  network: string = STELLAR_NETWORK,
  forceRefresh = false,
): Promise<{ baseFee: string; cached: boolean }> {
  const now = Date.now();
  const cached = feeCache.get(network);
  if (!forceRefresh && cached && now - cached.fetchedAt < FEE_CACHE_TTL_MS) {
    return { baseFee: cached.baseFee, cached: true };
  }

  const server = new StellarSdk.Horizon.Server(getHorizonUrlForNetwork(network));
  const response = await server.feeStats();
  const baseFee = String(response.last_ledger_base_fee ?? StellarSdk.BASE_FEE);

  feeCache.set(network, { baseFee, fetchedAt: now });
  return { baseFee, cached: false };
}

/**
 * Estimate the fee for a Stellar transaction and (optionally) validate
 * that the sender wallet has sufficient balance to cover amount + fee.
 *
 * This utility is reusable across all Stellar transaction workflows
 * (wallet ops, escrow, milestones, refunds, disputes, ownership proofs,
 * snippet attestations).
 */
export async function estimateStellarFee(
  options: FeeEstimateOptions = {},
): Promise<FeeEstimate> {
  const network = options.network || STELLAR_NETWORK;
  const operationCount = Math.max(1, options.operationCount ?? 1);
  const estimatedAt = new Date().toISOString();

  let baseFee: string;
  let cached = false;
  try {
    const result = await getNetworkBaseFee(network, options.forceRefresh);
    baseFee = result.baseFee;
    cached = result.cached;
  } catch (error: any) {
    return {
      estimatedFee: "0",
      asset: "XLM",
      network,
      feeStatus: "unable_to_estimate",
      estimatedAt,
      balanceSufficient: false,
      error: `Unable to retrieve network fees: ${error?.message ?? "unknown error"}`,
    };
  }

  const baseFeeStroops = toStroops(baseFee);
  const totalFeeStroops = baseFeeStroops * BigInt(operationCount);
  const amountStroops = toStroops(options.amount);
  const totalRequiredStroops = amountStroops + totalFeeStroops;

  let balanceSufficient = true;
  let availableBalance: string | undefined;

  if (!options.skipBalanceCheck && options.walletAddress) {
    try {
      const server = new StellarSdk.Horizon.Server(getHorizonUrlForNetwork(network));
      const account = await server.loadAccount(options.walletAddress);
      const native = account.balances.find((b: any) => b.asset_type === "native");
      const availableStroops = toStroops(native?.balance ?? "0");
      availableBalance = availableStroops.toString();
      balanceSufficient = availableStroops >= totalRequiredStroops;
    } catch (error: any) {
      return {
        estimatedFee: stroopsToXlm(totalFeeStroops),
        asset: "XLM",
        network,
        feeStatus: "unable_to_estimate",
        estimatedAt,
        balanceSufficient: false,
        baseFee,
        operationCount,
        cached,
        error: `Unable to load wallet balance: ${error?.message ?? "unknown error"}`,
      };
    }
  }

  return {
    estimatedFee: stroopsToXlm(totalFeeStroops),
    asset: "XLM",
    network,
    feeStatus: balanceSufficient ? "estimated" : "insufficient_balance",
    estimatedAt,
    balanceSufficient,
    totalRequired: totalRequiredStroops.toString(),
    availableBalance,
    baseFee,
    operationCount,
    cached,
  };
}

/**
 * Revalidate a previously produced fee estimate immediately before
 * signing/submission. Detects material fee changes and insufficient
 * balances, and signals whether the user must re-approve.
 */
export async function validateFeeBeforeSubmission(
  previousEstimate: FeeEstimate | undefined,
  options: FeeEstimateOptions = {},
): Promise<FeeValidationResult> {
  const current = await estimateStellarFee({ ...options, forceRefresh: true });

  if (current.feeStatus === "unable_to_estimate") {
    return {
      valid: false,
      feeStatus: current.feeStatus,
      estimate: current,
      error: current.error,
    };
  }

  if (!current.balanceSufficient) {
    return {
      valid: false,
      feeStatus: "insufficient_balance",
      estimate: current,
      error: "Insufficient balance to cover transaction amount and network fee.",
    };
  }

  if (previousEstimate) {
    const prevStroops = toStroops(previousEstimate.estimatedFee);
    const currStroops = toStroops(current.estimatedFee);
    const diff = currStroops > prevStroops
      ? currStroops - prevStroops
      : prevStroops - currStroops;

    if (diff >= FEE_CHANGE_THRESHOLD_STROOPS) {
      return {
        valid: true,
        feeStatus: "updated",
        estimate: { ...current, feeStatus: "updated" },
        feeChanged: true,
        previousFee: previousEstimate.estimatedFee,
        currentFee: current.estimatedFee,
        requiresReapproval: true,
      };
    }
  }

  return {
    valid: true,
    feeStatus: "ready_for_submission",
    estimate: { ...current, feeStatus: "ready_for_submission" },
  };
}

/**
 * Clear the in-memory fee cache. Useful for tests and for forcing a
 * fresh lookup after a known network event.
 */
export function clearFeeCache(): void {
  feeCache.clear();
}

export interface StellarSubmitResult {
  success: boolean;
  transactionHash?: string;
  ledger?: number;
  timestamp?: string;
  memo?: string;
  /** Snippet memo reference attached to the transaction memo, when applicable. */
  memoRef?: string;
  error?: string;
  /** Added by confirmation flow integration */
  lifecycle?: string;
  confirmedAt?: string;
}

/**
 * Submit a Stellar transaction with full confirmation lifecycle tracking.
 *
 * Uses the StellarTransactionConfirmationService to:
 *  1. Build/sign/submit the transaction
 *  2. Poll Horizon until confirmation
 *  3. Persist the lifecycle (preparing → submitted → confirming → confirmed/failed)
 *  4. Emit activity log events for auditability
 */
export async function submitTransactionWithConfirmation({
  secretKey,
  walletAddress,
  operations,
  memo,
  metadata,
}: {
  secretKey: string;
  walletAddress: string;
  operations: any[];
  memo?: StellarSdk.Memo;
  metadata?: Record<string, unknown>;
}): Promise<StellarSubmitResult> {
  // Validate the wallet address
  try {
    validateStellarAddress(walletAddress);
  } catch (error: any) {
    return {
      success: false,
      error: `Invalid Stellar wallet address: ${error.message}`,
    };
  }

  const key = secretKey || STELLAR_SECRET_KEY;

  if (!key) {
    const timestamp = new Date().toISOString();
    const txHash = crypto
      .createHash("sha256")
      .update(`${walletAddress}:${timestamp}:${crypto.randomUUID()}`)
      .digest("hex");

    console.warn(
      "[Stellar] Transaction confirmation: no secret key configured — using deterministic mock.",
    );

    return {
      success: true,
      transactionHash: txHash,
      timestamp,
      lifecycle: "confirmed",
      confirmedAt: timestamp,
    };
  }

  let confirmationService: StellarTransactionConfirmationService | null = null;
  try {
    confirmationService = new StellarTransactionConfirmationService();
    const confirmation = await confirmationService.submitAndConfirm({
      secretKey: key,
      walletAddress,
      operations: operations as StellarSdk.Operation[],
      memo,
      metadata,
    });

    // Emit audit log
    await appendActivityLog(
      "snippet.updated",
      "wallet",
      {
        actorWallet: walletAddress,
        metadata: {
          txHash: confirmation.stellarTxHash,
          lifecycle: confirmation.lifecycle,
          status: confirmation.status,
          ledger: confirmation.ledger,
          ...metadata,
        },
      },
    );

    return {
      success: confirmation.status === "successful",
      transactionHash: confirmation.stellarTxHash,
      ledger: confirmation.ledger ?? undefined,
      timestamp: confirmation.confirmedAt ?? confirmation.createdAt,
      memo: confirmation.memo ?? undefined,
      lifecycle: confirmation.lifecycle,
      confirmedAt: confirmation.confirmedAt ?? undefined,
      error: confirmation.errorMessage ?? undefined,
    };
  } catch (error: any) {
    console.error("[Stellar] Transaction confirmation failed:", error?.message);

    await appendActivityLog(
      "snippet.owner_transfer_failed",
      "wallet",
      {
        actorWallet: walletAddress,
        metadata: {
          error: error?.message,
          ...metadata,
        },
      },
    );

    return {
      success: false,
      error: `Stellar transaction confirmation failed: ${error?.message}`,
    };
  }
}


/**
 * Submit an immutable ownership-transfer memo/proof on Stellar.
 * The memo carries the unique snippet reference (`snip:<ref>`); the owner
 * pair travels in the manageData entry so the memo stays inside Stellar's
 * 28-byte memo_text limit without truncation.
 */
export async function submitOwnershipTransferMemoToStellar({
  secretKey,
  snippetId,
  oldOwnerWalletAddress,
  newOwnerWalletAddress,
}: {
  secretKey?: string;
  snippetId: string;
  oldOwnerWalletAddress: string;
  newOwnerWalletAddress: string;
}): Promise<StellarSubmitResult> {
  try {
    validateStellarAddress(oldOwnerWalletAddress);
    validateStellarAddress(newOwnerWalletAddress);
  } catch (error: any) {
    return {
      success: false,
      error: `Invalid Stellar wallet address: ${error.message}`,
    };
  }

  const key = secretKey || STELLAR_SECRET_KEY;

  // Fall back to deterministic mock when no key configured.
  if (!key) {
    const timestamp = new Date().toISOString();
    const memo = buildSnippetMemo(snippetId);
    const txHash = crypto
      .createHash("sha256")
      .update(`${snippetId}:${oldOwnerWalletAddress}:${newOwnerWalletAddress}:${timestamp}`)
      .digest("hex");

    console.warn(
      "[Stellar] Ownership transfer proof: no secret key configured — using deterministic mock.",
    );

    return {
      success: true,
      transactionHash: txHash,
      timestamp,
      memo,
      memoRef: generateSnippetMemoRef(snippetId),
    };
  }

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const keypair = StellarSdk.Keypair.fromSecret(key);
    const account = await server.loadAccount(keypair.publicKey());

    const timestamp = new Date().toISOString();
    const memoText = buildSnippetMemo(snippetId);

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.manageData({
          name: `own:${snippetId.slice(0, 20)}`,
          value: `${oldOwnerWalletAddress.slice(0, 12)}->${newOwnerWalletAddress.slice(0, 12)}`,
        }),
      )
      .addMemo(StellarSdk.Memo.text(memoText))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    const response = await server.submitTransaction(transaction);

    return {
      success: true,
      transactionHash: response.hash,
      ledger: response.ledger,
      timestamp,
      memo: memoText,
      memoRef: generateSnippetMemoRef(snippetId),
    };
  } catch (error: any) {
    console.error("[Stellar] Ownership transfer submission failed:", error?.message);
    const resultCodes = error?.response?.data?.extras?.result_codes;
    const details = resultCodes ? JSON.stringify(resultCodes) : error?.message;
    return {
      success: false,
      error: `Stellar ownership transfer failed: ${details}`,
    };
  }
}

/**
 * Submit a snippet hash + creation timestamp to the Stellar blockchain.
 * The memo carries the snippet reference: "snip:<ref>:<hash8>" (26 bytes
 * max), validated against Stellar's 28-byte memo_text limit — never
 * truncated.
 *
 * Immutability guarantee: once the transaction is confirmed on-chain,
 * the hash and timestamp are permanently anchored and cannot be altered.
 */
export async function submitHashToStellar(
  secretKey: string,
  contentHash: string,
  snippetId: string,
  createdAt?: string,
): Promise<StellarSubmitResult> {
  const key = secretKey || STELLAR_SECRET_KEY;

  // Fall back to a deterministic mock when no key is configured
  if (!key) {
    return mockStellarSubmit(contentHash, snippetId, createdAt);
  }

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const keypair = StellarSdk.Keypair.fromSecret(key);
    const account = await server.loadAccount(keypair.publicKey());

    const timestamp = createdAt || new Date().toISOString();
    const memoText = buildSnippetMemo(snippetId, contentHash);

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.manageData({
          name: `snip:${snippetId.slice(0, 20)}`,
          value: contentHash.slice(0, 64), // store first 64 chars of hash as data entry
        }),
      )
      .addMemo(StellarSdk.Memo.text(memoText))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    const response = await server.submitTransaction(transaction);

    return {
      success: true,
      transactionHash: response.hash,
      ledger: response.ledger,
      timestamp,
      memo: memoText,
      memoRef: generateSnippetMemoRef(snippetId),
    };
  } catch (error: any) {
    console.error("[Stellar] Transaction submission failed:", error?.message);

    // Surface Stellar-specific result codes when available
    const resultCodes =
      error?.response?.data?.extras?.result_codes;
    const details = resultCodes
      ? JSON.stringify(resultCodes)
      : error?.message;

    return {
      success: false,
      error: `Stellar transaction failed: ${details}`,
    };
  }
}

/**
 * Submit a batch of snippet hashes in a single Stellar transaction.
 * The memo carries a unique batch reference (`snipb:<ref>`) that links every
 * snippet in the batch; individual hashes are stored as manageData
 * operations (up to 64 entries per transaction).
 */
export async function submitBatchHashToStellar(
  secretKey: string,
  snippets: Array<{ id: string; hash: string }>,
): Promise<StellarSubmitResult> {
  const key = secretKey || STELLAR_SECRET_KEY;

  if (!key) {
    return mockBatchStellarSubmit(snippets);
  }

  if (snippets.length === 0) {
    return { success: false, error: "No snippets provided" };
  }

  // Stellar allows max 100 operations per transaction; cap at 64 for safety
  const batch = snippets.slice(0, 64);

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const keypair = StellarSdk.Keypair.fromSecret(key);
    const account = await server.loadAccount(keypair.publicKey());

    const batchHash = generateBatchHash(batch.map((s) => s.hash));
    const timestamp = new Date().toISOString();
    const memoText = buildBatchSnippetMemo(batchHash);

    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addMemo(StellarSdk.Memo.text(memoText));

    for (const snippet of batch) {
      builder.addOperation(
        StellarSdk.Operation.manageData({
          name: `snip:${snippet.id.slice(0, 20)}`,
          value: snippet.hash.slice(0, 64),
        }),
      );
    }

    const transaction = builder.setTimeout(30).build();
    transaction.sign(keypair);

    const response = await server.submitTransaction(transaction);

    return {
      success: true,
      transactionHash: response.hash,
      ledger: response.ledger,
      timestamp,
      memo: memoText,
      memoRef: memoText,
    };
  } catch (error: any) {
    console.error("[Stellar] Batch submission failed:", error?.message);
    const resultCodes =
      error?.response?.data?.extras?.result_codes;
    const details = resultCodes
      ? JSON.stringify(resultCodes)
      : error?.message;

    return {
      success: false,
      error: `Stellar batch transaction failed: ${details}`,
    };
  }
}

/**
 * Mint a snippet as an NFT on Stellar (existing functionality, preserved).
 */
export async function mintSnippetNFT({
  title,
  language,
  code,
}: {
  title: string;
  language: string;
  code: string;
}) {
  const snippetHash = crypto.createHash("sha256").update(code).digest("hex");
  const txHash = crypto.randomBytes(32).toString("hex");

  return {
    success: true,
    txHash,
    metadata: {
      title,
      language,
      snippetHash,
      createdAt: new Date().toISOString(),
    },
  };
}

// ─── Error Classification ──────────────────────────────────────────────────

const RETRYABLE_RESULT_CODES = new Set([
  "tx_bad_seq",
  "tx_too_late",
  "tx_no_source_account",
]);

export function classifyStellarError(error: string): {
  retryable: boolean;
  reason: string;
} {
  const lower = error.toLowerCase();

  if (lower.includes("timeout") || lower.includes("econnreset") || lower.includes("econnrefused")) {
    return { retryable: true, reason: "network_timeout" };
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return { retryable: true, reason: "rate_limited" };
  }

  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) {
    return { retryable: true, reason: "horizon_server_error" };
  }

  if (lower.includes("tx_bad_seq")) {
    return { retryable: true, reason: "tx_bad_seq" };
  }

  if (lower.includes("tx_too_late")) {
    return { retryable: true, reason: "tx_too_late" };
  }

  if (lower.includes("tx_already_exists")) {
    return { retryable: false, reason: "tx_already_exists" };
  }

  if (lower.includes("tx_failed")) {
    return { retryable: false, reason: "tx_failed" };
  }

  if (lower.includes("tx_bad_auth")) {
    return { retryable: false, reason: "tx_bad_auth" };
  }

  return { retryable: false, reason: "unknown_error" };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateBatchHash(hashes: string[]): string {
  const combined = [...hashes].sort().join("|");
  return crypto.createHash("sha256").update(combined).digest("hex");
}


// ─── Mock fallbacks (no secret key configured) ──────────────────────────────

function mockStellarSubmit(
  contentHash: string,
  snippetId: string,
  createdAt?: string,
): StellarSubmitResult {
  const timestamp = createdAt || new Date().toISOString();
  const txHash = crypto
    .createHash("sha256")
    .update(`${snippetId}:${contentHash}:${timestamp}`)
    .digest("hex");

  console.warn(
    "[Stellar] No secret key configured — using deterministic mock transaction.",
  );

  const memo = buildSnippetMemo(snippetId, contentHash);

  return {
    success: true,
    transactionHash: txHash,
    timestamp,
    memo,
    memoRef: generateSnippetMemoRef(snippetId),
  };
}

function mockBatchStellarSubmit(
  snippets: Array<{ id: string; hash: string }>,
): StellarSubmitResult {
  const combined = snippets.map((s) => `${s.id}:${s.hash}`).join("|");
  const txHash = crypto.createHash("sha256").update(combined).digest("hex");
  const batchHash = generateBatchHash(snippets.map((s) => s.hash));
  const timestamp = new Date().toISOString();

  console.warn(
    "[Stellar] No secret key configured — using deterministic mock batch transaction.",
  );

  const memo = buildBatchSnippetMemo(batchHash);

  return {
    success: true,
    transactionHash: txHash,
    timestamp,
    memo,
    memoRef: memo,
  };
}

/**
 * Submit snippet license metadata to the Stellar blockchain.
 */
export async function mintSnippetLicenseOnStellar({
  secretKey,
  snippetId,
  licenseType,
  ownerWalletAddress,
}: {
  secretKey?: string;
  snippetId: string;
  licenseType: string;
  ownerWalletAddress: string;
}): Promise<StellarSubmitResult> {
  const key = secretKey || STELLAR_SECRET_KEY;

  if (!key) {
    const timestamp = new Date().toISOString();
    const memo = buildSnippetMemo(snippetId);
    const txHash = crypto
      .createHash("sha256")
      .update(`${snippetId}:${licenseType}:${ownerWalletAddress}:${timestamp}`)
      .digest("hex");

    console.warn(
      "[Stellar] License minting: no secret key configured — using deterministic mock.",
    );

    return {
      success: true,
      transactionHash: txHash,
      timestamp,
      memo,
      memoRef: generateSnippetMemoRef(snippetId),
    };
  }

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const keypair = StellarSdk.Keypair.fromSecret(key);
    const account = await server.loadAccount(keypair.publicKey());

    const timestamp = new Date().toISOString();
    const memoText = buildSnippetMemo(snippetId);

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.manageData({
          name: `lic:${snippetId.slice(0, 20)}`,
          value: licenseType.slice(0, 64),
        }),
      )
      .addMemo(StellarSdk.Memo.text(memoText))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    const response = await server.submitTransaction(transaction);

    return {
      success: true,
      transactionHash: response.hash,
      ledger: response.ledger,
      timestamp,
      memo: memoText,
      memoRef: generateSnippetMemoRef(snippetId),
    };
  } catch (error: any) {
    console.error("[Stellar] License minting failed:", error?.message);
    const resultCodes = error?.response?.data?.extras?.result_codes;
    const details = resultCodes ? JSON.stringify(resultCodes) : error?.message;
    return {
      success: false,
      error: `Stellar license minting failed: ${details}`,
    };
  }
}

/**
 * Submit collection anchor to the Stellar blockchain.
 */
export async function submitCollectionToStellar(
  secretKey: string,
  collectionId: string,
  ownerWallet: string,
  title: string,
  description: string,
  tags: string[],
): Promise<{
  success: boolean;
  transactionHash?: string;
  ledger?: number;
  anchor?: string;
  error?: string;
}> {
  const key = secretKey || STELLAR_SECRET_KEY;
  const content = `${collectionId}:${ownerWallet}:${title}:${description}:${tags.join(",")}`;
  const anchor = crypto.createHash("sha256").update(content).digest("hex");

  if (!key) {
    const txHash = crypto
      .createHash("sha256")
      .update(`${anchor}:${new Date().toISOString()}`)
      .digest("hex");

    console.warn(
      "[Stellar] Collection anchor: no secret key configured — using deterministic mock.",
    );

    return {
      success: true,
      transactionHash: txHash,
      ledger: 1,
      anchor,
    };
  }

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const keypair = StellarSdk.Keypair.fromSecret(key);
    const account = await server.loadAccount(keypair.publicKey());

    const memoText = `col:${anchor.slice(0, 22)}`;

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.manageData({
          name: `col:${anchor.slice(0, 20)}`,
          value: anchor.slice(0, 64),
        }),
      )
      .addMemo(StellarSdk.Memo.text(memoText))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);
    const response = await server.submitTransaction(transaction);

    return {
      success: true,
      transactionHash: response.hash,
      ledger: response.ledger,
      anchor,
    };
  } catch (error: any) {
    console.error("[Stellar] Collection anchor failed:", error?.message);
    return {
      success: false,
      error: `Stellar collection anchor failed: ${error?.message}`,
    };
  }
}

