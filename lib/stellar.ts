
import crypto from "crypto";

import * as StellarSdk from "stellar-sdk";
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

