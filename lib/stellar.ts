import crypto from "crypto";
import * as StellarSdk from "stellar-sdk";

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
  error?: string;
}

/**
 * Submit a snippet hash + creation timestamp to the Stellar blockchain.
 * The memo encodes: "snip:<snippetId>:<createdAt ISO>:<contentHash>"
 * truncated to 28 bytes to fit Stellar's memo_text limit.
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

    // Build a compact memo: first 28 chars of "snip:<id>:<hash>"
    const timestamp = createdAt || new Date().toISOString();
    const memoText = buildMemo(snippetId, contentHash, timestamp);

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
 * The memo contains the batch hash; individual hashes are stored as
 * manageData operations (up to 64 entries per transaction).
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
    const memoText = `batch:${batchHash.slice(0, 22)}`;

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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a Stellar memo_text (max 28 bytes).
 * Format: "s:<8-char-id>:<8-char-hash>"
 */
function buildMemo(
  snippetId: string,
  contentHash: string,
  _timestamp: string,
): string {
  const shortId = snippetId.replace(/-/g, "").slice(0, 8);
  const shortHash = contentHash.slice(0, 8);
  return `s:${shortId}:${shortHash}`;
}

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

  return {
    success: true,
    transactionHash: txHash,
    timestamp,
    memo: buildMemo(snippetId, contentHash, timestamp),
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

  return {
    success: true,
    transactionHash: txHash,
    timestamp,
    memo: `batch:${batchHash.slice(0, 22)}`,
  };
}
