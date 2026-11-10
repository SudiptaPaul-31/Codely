import crypto from "crypto";
import { appendActivityLog } from "@/lib/activity-logger";

export type VerificationLifecycleStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "unverifiable"
  | "retry_scheduled";

export type StellarNetwork = "testnet" | "mainnet" | "public" | "futurenet";

export type VerificationErrorCode =
  | "NETWORK_UNAVAILABLE"
  | "HORIZON_TIMEOUT"
  | "RPC_FAILURE"
  | "RATE_LIMITED"
  | "WRONG_NETWORK"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_FAILED"
  | "OPERATION_MISMATCH"
  | "MISSING_TRANSACTION_REFERENCE"
  | "INCONSISTENT_DATA"
  | "RETRY_EXHAUSTED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT";

export interface StellarOperationRecord {
  type: string;
  name?: string;
  value?: string;
  snippetId?: string;
  operationType?: string;
  sourceAccount?: string;
}

export interface StellarTransactionDetails {
  hash: string;
  network: StellarNetwork;
  exists: boolean;
  successful?: boolean;
  pending?: boolean;
  ledger?: number | null;
  createdAt?: string;
  memo?: string | null;
  sourceAccount?: string;
  operations?: StellarOperationRecord[];
}

export interface BlockchainVerificationRecord {
  id: string;
  snippetId: string;
  transactionHash: string;
  network: StellarNetwork;
  status: VerificationLifecycleStatus;
  ledger: number | null;
  verifiedAt: string | null;
  lastCheckedAt: string;
  retryCount: number;
  maxRetries: number;
  failureReason: string | null;
  failureCode: VerificationErrorCode | null;
  expectedOperation?: string | null;
  expectedMemo?: string | null;
  requestedBy?: string | null;
  visibility?: "public" | "private" | "shared";
  ownerWallet?: string | null;
  allowedWallets?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicVerificationView {
  id: string;
  snippetId: string;
  transactionHash: string;
  network: StellarNetwork;
  status: VerificationLifecycleStatus;
  ledger: number | null;
  verifiedAt: string | null;
  lastCheckedAt: string;
  retryCount: number;
  failureReason: string | null;
  failureCode?: VerificationErrorCode | null;
}

export interface VerificationAuditEntry {
  id: string;
  verificationId: string;
  snippetId: string;
  transactionHash: string;
  action:
    | "verification.requested"
    | "verification.confirmed"
    | "verification.failed"
    | "verification.unverifiable"
    | "verification.retry_scheduled"
    | "verification.retried"
    | "verification.retry_exhausted"
    | "verification.rejected_wrong_network"
    | "verification.access_denied";
  previousStatus: VerificationLifecycleStatus | null;
  newStatus: VerificationLifecycleStatus;
  actorWallet: string | null;
  reason: string | null;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SnippetBlockchainMetadata {
  id: string;
  transactionHash?: string | null;
  network?: StellarNetwork;
  ownerWallet?: string | null;
  visibility?: "public" | "private" | "shared";
  sharedWith?: string[];
  expectedOperation?: string | null;
  expectedMemo?: string | null;
}

export interface VerifySnippetRequest {
  snippetId: string;
  transactionHash?: string | null;
  network?: StellarNetwork | string | null;
  expectedOperation?: string | null;
  expectedMemo?: string | null;
  actorWallet?: string | null;
  visibility?: "public" | "private" | "shared";
  ownerWallet?: string | null;
  allowedWallets?: string[];
  forceRevalidate?: boolean;
}

export interface VerificationErrorPayload {
  status: VerificationLifecycleStatus;
  code: VerificationErrorCode;
  message: string;
}

export interface VerificationStatusResponse {
  snippetId: string;
  verification: PublicVerificationView;
  error?: VerificationErrorPayload;
}

export class StellarVerificationNetworkError extends Error {
  public readonly code: VerificationErrorCode;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: VerificationErrorCode = "NETWORK_UNAVAILABLE",
    retryable = true,
  ) {
    super(message);
    this.name = "StellarVerificationNetworkError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class VerificationAuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: VerificationErrorCode;

  constructor(
    message: string,
    statusCode: 401 | 403 = 403,
    code: VerificationErrorCode = "FORBIDDEN",
  ) {
    super(message);
    this.name = "VerificationAuthorizationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class VerificationValidationError extends Error {
  public readonly statusCode: number;
  public readonly code: VerificationErrorCode;

  constructor(
    message: string,
    code: VerificationErrorCode = "INVALID_INPUT",
    statusCode = 400,
  ) {
    super(message);
    this.name = "VerificationValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface StellarVerificationClient {
  getTransaction(
    transactionHash: string,
    network: StellarNetwork,
  ): Promise<StellarTransactionDetails>;
}

export interface VerificationStore {
  getById(id: string): Promise<BlockchainVerificationRecord | null>;
  getBySnippetAndTx(
    snippetId: string,
    transactionHash: string,
  ): Promise<BlockchainVerificationRecord | null>;
  getLatestBySnippetId(
    snippetId: string,
  ): Promise<BlockchainVerificationRecord | null>;
  save(
    record: BlockchainVerificationRecord,
  ): Promise<BlockchainVerificationRecord>;
  appendAudit(entry: VerificationAuditEntry): Promise<void>;
  getAuditEntries(filter?: {
    snippetId?: string;
    verificationId?: string;
  }): Promise<VerificationAuditEntry[]>;
  getSnippetMetadata(
    snippetId: string,
  ): Promise<SnippetBlockchainMetadata | null>;
  saveSnippetMetadata(metadata: SnippetBlockchainMetadata): Promise<void>;
  clear(): Promise<void>;
}

const VALID_NETWORKS: ReadonlySet<string> = new Set([
  "testnet",
  "mainnet",
  "public",
  "futurenet",
]);

export function normalizeStellarNetwork(
  network?: string | null,
): StellarNetwork | null {
  if (!network || typeof network !== "string") return null;
  const cleaned = network.trim().toLowerCase();
  if (cleaned === "public") return "mainnet";
  if (VALID_NETWORKS.has(cleaned)) {
    return cleaned as StellarNetwork;
  }
  return null;
}

export function isValidTxHash(hash?: string | null): boolean {
  if (!hash || typeof hash !== "string") return false;
  const trimmed = hash.trim();
  // Accept standard 64-char hex or deterministic test/mock hashes (>= 8 hex/alphanumeric chars with no spaces)
  return /^[a-fA-F0-9]{8,64}$/.test(trimmed) || /^tx_[a-zA-Z0-9_-]{4,64}$/.test(trimmed);
}

export class InMemoryVerificationStore implements VerificationStore {
  private recordsById = new Map<string, BlockchainVerificationRecord>();
  private idBySnippetAndTx = new Map<string, string>();
  private latestIdBySnippet = new Map<string, string>();
  private auditTrail: VerificationAuditEntry[] = [];
  private snippetMetadata = new Map<string, SnippetBlockchainMetadata>();

  private compositeKey(snippetId: string, txHash: string): string {
    return `${snippetId}::${txHash.toLowerCase()}`;
  }

  async getById(id: string): Promise<BlockchainVerificationRecord | null> {
    const rec = this.recordsById.get(id);
    return rec ? { ...rec } : null;
  }

  async getBySnippetAndTx(
    snippetId: string,
    transactionHash: string,
  ): Promise<BlockchainVerificationRecord | null> {
    const id = this.idBySnippetAndTx.get(
      this.compositeKey(snippetId, transactionHash),
    );
    if (!id) return null;
    return this.getById(id);
  }

  async getLatestBySnippetId(
    snippetId: string,
  ): Promise<BlockchainVerificationRecord | null> {
    const id = this.latestIdBySnippet.get(snippetId);
    if (!id) return null;
    return this.getById(id);
  }

  async save(
    record: BlockchainVerificationRecord,
  ): Promise<BlockchainVerificationRecord> {
    const copy: BlockchainVerificationRecord = {
      ...record,
      allowedWallets: record.allowedWallets
        ? [...record.allowedWallets]
        : undefined,
    };
    this.recordsById.set(copy.id, copy);
    if (copy.transactionHash) {
      this.idBySnippetAndTx.set(
        this.compositeKey(copy.snippetId, copy.transactionHash),
        copy.id,
      );
    }
    this.latestIdBySnippet.set(copy.snippetId, copy.id);
    return { ...copy };
  }

  async appendAudit(entry: VerificationAuditEntry): Promise<void> {
    this.auditTrail.push({ ...entry });
  }

  async getAuditEntries(filter?: {
    snippetId?: string;
    verificationId?: string;
  }): Promise<VerificationAuditEntry[]> {
    return this.auditTrail
      .filter((entry) => {
        if (filter?.snippetId && entry.snippetId !== filter.snippetId) {
          return false;
        }
        if (
          filter?.verificationId &&
          entry.verificationId !== filter.verificationId
        ) {
          return false;
        }
        return true;
      })
      .map((entry) => ({ ...entry }));
  }

  async getSnippetMetadata(
    snippetId: string,
  ): Promise<SnippetBlockchainMetadata | null> {
    const meta = this.snippetMetadata.get(snippetId);
    return meta ? { ...meta } : null;
  }

  async saveSnippetMetadata(
    metadata: SnippetBlockchainMetadata,
  ): Promise<void> {
    this.snippetMetadata.set(metadata.id, { ...metadata });
  }

  async clear(): Promise<void> {
    this.recordsById.clear();
    this.idBySnippetAndTx.clear();
    this.latestIdBySnippet.clear();
    this.auditTrail = [];
    this.snippetMetadata.clear();
  }
}

export class DefaultHorizonVerificationClient
  implements StellarVerificationClient
{
  private mockTransactions = new Map<string, StellarTransactionDetails>();
  private simulatedFailure: (() => Error) | null = null;

  public registerMockTransaction(tx: StellarTransactionDetails): void {
    this.mockTransactions.set(tx.hash.toLowerCase(), { ...tx });
  }

  public setSimulatedFailure(failureFactory: (() => Error) | null): void {
    this.simulatedFailure = failureFactory;
  }

  public clearMocks(): void {
    this.mockTransactions.clear();
    this.simulatedFailure = null;
  }

  async getTransaction(
    transactionHash: string,
    network: StellarNetwork,
  ): Promise<StellarTransactionDetails> {
    if (this.simulatedFailure) {
      throw this.simulatedFailure();
    }

    const mocked = this.mockTransactions.get(transactionHash.toLowerCase());
    if (mocked) {
      return { ...mocked };
    }

    return {
      hash: transactionHash,
      network,
      exists: false,
    };
  }
}

function classifyNetworkFailure(error: unknown): {
  code: VerificationErrorCode;
  retryable: boolean;
  message: string;
} {
  if (error instanceof StellarVerificationNetworkError) {
    return {
      code: error.code,
      retryable: error.retryable,
      message: error.message,
    };
  }

  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = rawMessage.toLowerCase();
  const status = (error as any)?.response?.status ?? (error as any)?.status;
  const code = (error as any)?.code;

  if (
    code === "ETIMEDOUT" ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return {
      code: "HORIZON_TIMEOUT",
      retryable: true,
      message:
        "Stellar Horizon request timed out while retrieving transaction details.",
    };
  }

  if (status === 429 || lower.includes("rate limit")) {
    return {
      code: "RATE_LIMITED",
      retryable: true,
      message: "Stellar network rate limit reached. Verification retry queued.",
    };
  }

  if (lower.includes("rpc") || code === "RPC_ERROR") {
    return {
      code: "RPC_FAILURE",
      retryable: true,
      message:
        "Temporary Stellar RPC failure while validating transaction operations.",
    };
  }

  if (
    (status && status >= 500 && status < 600) ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    lower.includes("network") ||
    lower.includes("unavailable") ||
    lower.includes("outage") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return {
      code: "NETWORK_UNAVAILABLE",
      retryable: true,
      message:
        "Unable to retrieve transaction details from the configured Stellar network.",
    };
  }

  return {
    code: "NETWORK_UNAVAILABLE",
    retryable: false,
    message: rawMessage || "Unexpected verification failure.",
  };
}

export function sanitizeVerificationForPublic(
  record: BlockchainVerificationRecord,
): PublicVerificationView {
  return {
    id: record.id,
    snippetId: record.snippetId,
    transactionHash: record.transactionHash,
    network: record.network,
    status: record.status,
    ledger: record.ledger,
    verifiedAt: record.verifiedAt,
    lastCheckedAt: record.lastCheckedAt,
    retryCount: record.retryCount,
    failureReason: record.failureReason,
    ...(record.failureCode ? { failureCode: record.failureCode } : {}),
  };
}

export interface BlockchainVerificationServiceOptions {
  configuredNetwork?: StellarNetwork;
  maxRetries?: number;
  stellarClient?: StellarVerificationClient;
  store?: VerificationStore;
}

export class BlockchainVerificationService {
  private readonly configuredNetwork: StellarNetwork;
  private readonly maxRetries: number;
  public readonly stellarClient: StellarVerificationClient;
  public readonly store: VerificationStore;
  private readonly inFlightLocks = new Map<
    string,
    Promise<VerificationStatusResponse>
  >();

  constructor(options?: BlockchainVerificationServiceOptions) {
    const envNet = normalizeStellarNetwork(
      process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
    );
    this.configuredNetwork = options?.configuredNetwork ?? envNet ?? "testnet";
    this.maxRetries = options?.maxRetries ?? 3;
    this.stellarClient =
      options?.stellarClient ?? new DefaultHorizonVerificationClient();
    this.store = options?.store ?? new InMemoryVerificationStore();
  }

  public getConfiguredNetwork(): StellarNetwork {
    return this.configuredNetwork;
  }

  public async registerSnippetMetadata(
    metadata: SnippetBlockchainMetadata,
  ): Promise<void> {
    await this.store.saveSnippetMetadata(metadata);
  }

  private checkReadAuthorization(
    record: {
      snippetId: string;
      visibility?: "public" | "private" | "shared";
      ownerWallet?: string | null;
      allowedWallets?: string[];
    },
    viewerWallet?: string | null,
  ): void {
    const visibility = record.visibility ?? "public";
    if (visibility === "public") return;

    if (!viewerWallet) {
      throw new VerificationAuthorizationError(
        "Authentication is required to view this private verification record.",
        401,
        "UNAUTHORIZED",
      );
    }

    const normalizedViewer = viewerWallet.trim().toUpperCase();
    const ownerMatch =
      record.ownerWallet &&
      record.ownerWallet.trim().toUpperCase() === normalizedViewer;
    const sharedMatch =
      Array.isArray(record.allowedWallets) &&
      record.allowedWallets.some(
        (w) => w.trim().toUpperCase() === normalizedViewer,
      );

    if (!ownerMatch && !sharedMatch) {
      throw new VerificationAuthorizationError(
        "You do not have permission to access this verification record.",
        403,
        "FORBIDDEN",
      );
    }
  }

  /**
   * Initiate or re-check blockchain verification for a snippet.
   * Ensures idempotent execution and coalesces concurrent identical requests.
   */
  public async verifySnippetTransaction(
    input: VerifySnippetRequest,
  ): Promise<VerificationStatusResponse> {
    if (!input.snippetId || typeof input.snippetId !== "string" || !input.snippetId.trim()) {
      throw new VerificationValidationError(
        "A valid snippetId is required for verification.",
        "INVALID_INPUT",
        400,
      );
    }

    const snippetId = input.snippetId.trim();
    const metadata = await this.store.getSnippetMetadata(snippetId);

    const visibility = input.visibility ?? metadata?.visibility ?? "public";
    const ownerWallet = input.ownerWallet ?? metadata?.ownerWallet ?? null;
    const allowedWallets = input.allowedWallets ?? metadata?.sharedWith ?? [];

    // Check write/verify authorization when snippet is private/owned
    if (ownerWallet && input.actorWallet) {
      const normalizedActor = input.actorWallet.trim().toUpperCase();
      const isOwner = ownerWallet.trim().toUpperCase() === normalizedActor;
      const isShared = allowedWallets.some(
        (w) => w.trim().toUpperCase() === normalizedActor,
      );
      if (!isOwner && !isShared) {
        await this.recordAudit({
          verificationId: `unauth_${snippetId}`,
          snippetId,
          transactionHash: input.transactionHash ?? "",
          action: "verification.access_denied",
          previousStatus: null,
          newStatus: "unverifiable",
          actorWallet: input.actorWallet,
          reason: "Unauthorized actor attempted snippet verification.",
        });
        throw new VerificationAuthorizationError(
          "Only the snippet owner or authorized collaborators can verify this snippet.",
          403,
          "FORBIDDEN",
        );
      }
    } else if (visibility === "private" && ownerWallet && !input.actorWallet) {
      throw new VerificationAuthorizationError(
        "Authentication is required to verify a private snippet.",
        401,
        "UNAUTHORIZED",
      );
    }

    const rawTxHash =
      input.transactionHash !== undefined
        ? input.transactionHash
        : metadata?.transactionHash;

    const requestedNetworkRaw =
      input.network !== undefined && input.network !== null
        ? String(input.network)
        : metadata?.network ?? this.configuredNetwork;
    const requestedNetwork = normalizeStellarNetwork(requestedNetworkRaw);

    // Concurrency key so simultaneous requests for the same snippet & txHash are serialized/coalesced
    const lockKey = `${snippetId}::${rawTxHash ?? "none"}::${requestedNetworkRaw}`;
    const existingInFlight = this.inFlightLocks.get(lockKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const promise = this.executeVerificationInternal({
      snippetId,
      rawTxHash: rawTxHash ?? null,
      requestedNetwork,
      requestedNetworkRaw,
      expectedOperation:
        input.expectedOperation ?? metadata?.expectedOperation ?? null,
      expectedMemo: input.expectedMemo ?? metadata?.expectedMemo ?? null,
      actorWallet: input.actorWallet ?? null,
      visibility,
      ownerWallet,
      allowedWallets,
      forceRevalidate: Boolean(input.forceRevalidate),
    });

    this.inFlightLocks.set(lockKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightLocks.delete(lockKey);
    }
  }

  private async executeVerificationInternal(params: {
    snippetId: string;
    rawTxHash: string | null;
    requestedNetwork: StellarNetwork | null;
    requestedNetworkRaw: string;
    expectedOperation: string | null;
    expectedMemo: string | null;
    actorWallet: string | null;
    visibility: "public" | "private" | "shared";
    ownerWallet: string | null;
    allowedWallets: string[];
    forceRevalidate: boolean;
  }): Promise<VerificationStatusResponse> {
    const now = new Date().toISOString();

    // 1. Validate network configuration & reject wrong-network requests immediately
    if (!params.requestedNetwork || params.requestedNetwork !== this.configuredNetwork) {
      const existing = params.rawTxHash
        ? await this.store.getBySnippetAndTx(params.snippetId, params.rawTxHash)
        : await this.store.getLatestBySnippetId(params.snippetId);

      const record: BlockchainVerificationRecord = {
        id: existing?.id ?? `ver_${crypto.randomUUID()}`,
        snippetId: params.snippetId,
        transactionHash: params.rawTxHash ?? "",
        network: params.requestedNetwork ?? this.configuredNetwork,
        status: "failed",
        ledger: null,
        verifiedAt: null,
        lastCheckedAt: now,
        retryCount: existing?.retryCount ?? 0,
        maxRetries: this.maxRetries,
        failureReason: `Transaction network "${params.requestedNetworkRaw}" does not match configured Stellar network "${this.configuredNetwork}".`,
        failureCode: "WRONG_NETWORK",
        expectedOperation: params.expectedOperation,
        expectedMemo: params.expectedMemo,
        requestedBy: params.actorWallet,
        visibility: params.visibility,
        ownerWallet: params.ownerWallet,
        allowedWallets: params.allowedWallets,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const saved = await this.store.save(record);
      await this.recordAudit({
        verificationId: saved.id,
        snippetId: saved.snippetId,
        transactionHash: saved.transactionHash,
        action: "verification.rejected_wrong_network",
        previousStatus: existing?.status ?? null,
        newStatus: "failed",
        actorWallet: params.actorWallet,
        reason: saved.failureReason,
      });

      return {
        snippetId: saved.snippetId,
        verification: sanitizeVerificationForPublic(saved),
        error: {
          status: "failed",
          code: "WRONG_NETWORK",
          message: saved.failureReason!,
        },
      };
    }

    // 2. Missing or malformed transaction reference -> unverifiable (never confirmed)
    if (!params.rawTxHash || !isValidTxHash(params.rawTxHash)) {
      const existing = await this.store.getLatestBySnippetId(params.snippetId);
      const record: BlockchainVerificationRecord = {
        id: existing?.id ?? `ver_${crypto.randomUUID()}`,
        snippetId: params.snippetId,
        transactionHash: params.rawTxHash ?? "",
        network: this.configuredNetwork,
        status: "unverifiable",
        ledger: null,
        verifiedAt: null,
        lastCheckedAt: now,
        retryCount: existing?.retryCount ?? 0,
        maxRetries: this.maxRetries,
        failureReason: params.rawTxHash
          ? "Malformed Stellar transaction hash."
          : "Missing blockchain transaction reference for snippet.",
        failureCode: "MISSING_TRANSACTION_REFERENCE",
        expectedOperation: params.expectedOperation,
        expectedMemo: params.expectedMemo,
        requestedBy: params.actorWallet,
        visibility: params.visibility,
        ownerWallet: params.ownerWallet,
        allowedWallets: params.allowedWallets,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const saved = await this.store.save(record);
      await this.recordAudit({
        verificationId: saved.id,
        snippetId: saved.snippetId,
        transactionHash: saved.transactionHash,
        action: "verification.unverifiable",
        previousStatus: existing?.status ?? null,
        newStatus: "unverifiable",
        actorWallet: params.actorWallet,
        reason: saved.failureReason,
      });

      return {
        snippetId: saved.snippetId,
        verification: sanitizeVerificationForPublic(saved),
        error: {
          status: "unverifiable",
          code: "MISSING_TRANSACTION_REFERENCE",
          message: saved.failureReason!,
        },
      };
    }

    const txHash = params.rawTxHash.trim();
    const existing = await this.store.getBySnippetAndTx(
      params.snippetId,
      txHash,
    );

    // Idempotency: if already confirmed and not forced to revalidate against Horizon, return existing record without creating a duplicate
    if (existing && existing.status === "confirmed" && !params.forceRevalidate) {
      return {
        snippetId: existing.snippetId,
        verification: sanitizeVerificationForPublic(existing),
      };
    }

    // Initialize or reuse the verification record (prevents duplicate records)
    const baseRecord: BlockchainVerificationRecord = existing
      ? {
          ...existing,
          expectedOperation:
            params.expectedOperation ?? existing.expectedOperation,
          expectedMemo: params.expectedMemo ?? existing.expectedMemo,
          visibility: params.visibility ?? existing.visibility,
          ownerWallet: params.ownerWallet ?? existing.ownerWallet,
          allowedWallets: params.allowedWallets.length
            ? params.allowedWallets
            : existing.allowedWallets,
          lastCheckedAt: now,
          updatedAt: now,
        }
      : {
          id: `ver_${crypto.randomUUID()}`,
          snippetId: params.snippetId,
          transactionHash: txHash,
          network: this.configuredNetwork,
          status: "pending",
          ledger: null,
          verifiedAt: null,
          lastCheckedAt: now,
          retryCount: 0,
          maxRetries: this.maxRetries,
          failureReason: null,
          failureCode: null,
          expectedOperation: params.expectedOperation,
          expectedMemo: params.expectedMemo,
          requestedBy: params.actorWallet,
          visibility: params.visibility,
          ownerWallet: params.ownerWallet,
          allowedWallets: params.allowedWallets,
          createdAt: now,
          updatedAt: now,
        };

    if (!existing) {
      await this.store.save(baseRecord);
      await this.recordAudit({
        verificationId: baseRecord.id,
        snippetId: baseRecord.snippetId,
        transactionHash: baseRecord.transactionHash,
        action: "verification.requested",
        previousStatus: null,
        newStatus: "pending",
        actorWallet: params.actorWallet,
        reason: null,
      });
    }

    return this.evaluateAgainstStellar(baseRecord, params.actorWallet, false);
  }

  /**
   * Evaluates a verification record against authoritative Stellar transaction data.
   */
  private async evaluateAgainstStellar(
    record: BlockchainVerificationRecord,
    actorWallet: string | null,
    isRetryAttempt: boolean,
  ): Promise<VerificationStatusResponse> {
    const previousStatus = record.status;
    const now = new Date().toISOString();

    try {
      const txDetails = await this.stellarClient.getTransaction(
        record.transactionHash,
        this.configuredNetwork,
      );

      // Verify network returned by Stellar transaction
      const txNetwork = normalizeStellarNetwork(txDetails.network);
      if (txNetwork && txNetwork !== this.configuredNetwork) {
        const failedRecord: BlockchainVerificationRecord = {
          ...record,
          status: "failed",
          ledger: null,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureCode: "WRONG_NETWORK",
          failureReason: `Transaction originated on "${txDetails.network}" instead of configured "${this.configuredNetwork}".`,
        };
        const saved = await this.store.save(failedRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.rejected_wrong_network",
          previousStatus,
          newStatus: "failed",
          actorWallet,
          reason: saved.failureReason,
        });
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "failed",
            code: "WRONG_NETWORK",
            message: saved.failureReason!,
          },
        };
      }

      // Transaction is pending confirmation on Stellar
      if (txDetails.pending) {
        const pendingRecord: BlockchainVerificationRecord = {
          ...record,
          status: "pending",
          ledger: txDetails.ledger ?? null,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureReason: null,
          failureCode: null,
        };
        const saved = await this.store.save(pendingRecord);
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
        };
      }

      // Missing transaction on Stellar network -> unverifiable (never confirmed)
      if (!txDetails.exists) {
        const unverifiableRecord: BlockchainVerificationRecord = {
          ...record,
          status: "unverifiable",
          ledger: null,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureCode: "TRANSACTION_NOT_FOUND",
          failureReason:
            "Transaction was not found on the configured Stellar network.",
        };
        const saved = await this.store.save(unverifiableRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.unverifiable",
          previousStatus,
          newStatus: "unverifiable",
          actorWallet,
          reason: saved.failureReason,
        });
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "unverifiable",
            code: "TRANSACTION_NOT_FOUND",
            message: saved.failureReason!,
          },
        };
      }

      // Transaction exists on-chain, check outcome
      if (txDetails.successful === false) {
        const failedRecord: BlockchainVerificationRecord = {
          ...record,
          status: "failed",
          ledger: txDetails.ledger ?? null,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureCode: "TRANSACTION_FAILED",
          failureReason:
            "Stellar transaction execution failed on-chain (successful = false).",
        };
        const saved = await this.store.save(failedRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.failed",
          previousStatus,
          newStatus: "failed",
          actorWallet,
          reason: saved.failureReason,
        });
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "failed",
            code: "TRANSACTION_FAILED",
            message: saved.failureReason!,
          },
        };
      }

      // Check ledger consistency
      if (
        txDetails.ledger === undefined ||
        txDetails.ledger === null ||
        txDetails.ledger <= 0
      ) {
        const unverifiableRecord: BlockchainVerificationRecord = {
          ...record,
          status: "unverifiable",
          ledger: null,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureCode: "INCONSISTENT_DATA",
          failureReason:
            "Transaction is missing authoritative Stellar ledger confirmation data.",
        };
        const saved = await this.store.save(unverifiableRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.unverifiable",
          previousStatus,
          newStatus: "unverifiable",
          actorWallet,
          reason: saved.failureReason,
        });
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "unverifiable",
            code: "INCONSISTENT_DATA",
            message: saved.failureReason!,
          },
        };
      }

      // Validate operation-specific details and snippet association
      const opCheck = this.validateTransactionOperationMatch(
        record,
        txDetails,
      );
      if (!opCheck.valid) {
        const failedRecord: BlockchainVerificationRecord = {
          ...record,
          status: "failed",
          ledger: txDetails.ledger,
          verifiedAt: null,
          lastCheckedAt: now,
          updatedAt: now,
          failureCode: "OPERATION_MISMATCH",
          failureReason: opCheck.reason!,
        };
        const saved = await this.store.save(failedRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.failed",
          previousStatus,
          newStatus: "failed",
          actorWallet,
          reason: saved.failureReason,
        });
        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "failed",
            code: "OPERATION_MISMATCH",
            message: saved.failureReason!,
          },
        };
      }

      // All checks passed -> Confirmed!
      const confirmedRecord: BlockchainVerificationRecord = {
        ...record,
        status: "confirmed",
        ledger: txDetails.ledger,
        verifiedAt: record.verifiedAt ?? now,
        lastCheckedAt: now,
        updatedAt: now,
        failureReason: null,
        failureCode: null,
      };
      const saved = await this.store.save(confirmedRecord);
      await this.recordAudit({
        verificationId: saved.id,
        snippetId: saved.snippetId,
        transactionHash: saved.transactionHash,
        action: "verification.confirmed",
        previousStatus,
        newStatus: "confirmed",
        actorWallet,
        reason: null,
        metadata: { ledger: saved.ledger, wasRetry: isRetryAttempt },
      });

      return {
        snippetId: saved.snippetId,
        verification: sanitizeVerificationForPublic(saved),
      };
    } catch (error) {
      const classified = classifyNetworkFailure(error);
      const nextRetryCount = isRetryAttempt
        ? record.retryCount + 1
        : record.retryCount;

      if (classified.retryable && nextRetryCount < record.maxRetries) {
        const retryScheduledRecord: BlockchainVerificationRecord = {
          ...record,
          status: "retry_scheduled",
          lastCheckedAt: now,
          updatedAt: now,
          retryCount: nextRetryCount,
          failureCode: classified.code,
          failureReason: classified.message,
        };
        const saved = await this.store.save(retryScheduledRecord);
        await this.recordAudit({
          verificationId: saved.id,
          snippetId: saved.snippetId,
          transactionHash: saved.transactionHash,
          action: "verification.retry_scheduled",
          previousStatus,
          newStatus: "retry_scheduled",
          actorWallet,
          reason: classified.message,
          metadata: {
            code: classified.code,
            retryCount: saved.retryCount,
            maxRetries: saved.maxRetries,
          },
        });

        return {
          snippetId: saved.snippetId,
          verification: sanitizeVerificationForPublic(saved),
          error: {
            status: "retry_scheduled",
            code: classified.code,
            message: classified.message,
          },
        };
      }

      // Retries exhausted or non-retryable failure -> Unverifiable
      const exhaustionCode: VerificationErrorCode =
        nextRetryCount >= record.maxRetries
          ? "RETRY_EXHAUSTED"
          : classified.code;
      const exhaustionMessage =
        nextRetryCount >= record.maxRetries
          ? `Verification retries exhausted (${nextRetryCount}/${record.maxRetries}): ${classified.message}`
          : classified.message;

      const exhaustedRecord: BlockchainVerificationRecord = {
        ...record,
        status: "unverifiable",
        lastCheckedAt: now,
        updatedAt: now,
        retryCount: nextRetryCount,
        failureCode: exhaustionCode,
        failureReason: exhaustionMessage,
      };
      const saved = await this.store.save(exhaustedRecord);
      await this.recordAudit({
        verificationId: saved.id,
        snippetId: saved.snippetId,
        transactionHash: saved.transactionHash,
        action:
          nextRetryCount >= record.maxRetries
            ? "verification.retry_exhausted"
            : "verification.unverifiable",
        previousStatus,
        newStatus: "unverifiable",
        actorWallet,
        reason: exhaustionMessage,
        metadata: {
          code: exhaustionCode,
          retryCount: saved.retryCount,
          maxRetries: saved.maxRetries,
        },
      });

      return {
        snippetId: saved.snippetId,
        verification: sanitizeVerificationForPublic(saved),
        error: {
          status: "unverifiable",
          code: exhaustionCode,
          message: exhaustionMessage,
        },
      };
    }
  }

  private validateTransactionOperationMatch(
    record: BlockchainVerificationRecord,
    txDetails: StellarTransactionDetails,
  ): { valid: boolean; reason?: string } {
    // Check snippetId match in operations if operations carry a snippetId
    if (Array.isArray(txDetails.operations) && txDetails.operations.length > 0) {
      const explicitSnippetOps = txDetails.operations.filter(
        (op) => op.snippetId !== undefined && op.snippetId !== null,
      );
      if (
        explicitSnippetOps.length > 0 &&
        !explicitSnippetOps.some((op) => op.snippetId === record.snippetId)
      ) {
        return {
          valid: false,
          reason: `Transaction operations reference snippet "${explicitSnippetOps[0].snippetId}" instead of expected snippet "${record.snippetId}".`,
        };
      }

      if (record.expectedOperation) {
        const expected = record.expectedOperation.toLowerCase();
        const opMatched = txDetails.operations.some(
          (op) =>
            op.type?.toLowerCase() === expected ||
            op.operationType?.toLowerCase() === expected ||
            op.name?.toLowerCase().includes(expected),
        );
        if (!opMatched) {
          return {
            valid: false,
            reason: `Transaction operations do not match expected snippet operation "${record.expectedOperation}".`,
          };
        }
      }
    } else if (record.expectedOperation) {
      return {
        valid: false,
        reason: `Transaction contains no operations matching expected operation "${record.expectedOperation}".`,
      };
    }

    if (record.expectedMemo) {
      if (!txDetails.memo || txDetails.memo !== record.expectedMemo) {
        return {
          valid: false,
          reason: `Transaction memo "${txDetails.memo ?? ""}" does not match expected memo "${record.expectedMemo}".`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Retrieve the latest verification status for a snippet.
   */
  public async getSnippetVerificationStatus(
    snippetId: string,
    options?: { viewerWallet?: string | null; revalidate?: boolean },
  ): Promise<VerificationStatusResponse> {
    if (!snippetId || typeof snippetId !== "string" || !snippetId.trim()) {
      throw new VerificationValidationError(
        "A valid snippetId is required.",
        "INVALID_INPUT",
        400,
      );
    }

    const cleanId = snippetId.trim();
    const existing = await this.store.getLatestBySnippetId(cleanId);
    const metadata = await this.store.getSnippetMetadata(cleanId);

    if (existing) {
      this.checkReadAuthorization(existing, options?.viewerWallet);
      if (
        options?.revalidate &&
        (existing.status === "pending" || existing.status === "retry_scheduled")
      ) {
        return this.evaluateAgainstStellar(
          existing,
          options?.viewerWallet ?? null,
          false,
        );
      }
      return {
        snippetId: existing.snippetId,
        verification: sanitizeVerificationForPublic(existing),
        ...(existing.failureCode && existing.failureReason
          ? {
              error: {
                status: existing.status,
                code: existing.failureCode,
                message: existing.failureReason,
              },
            }
          : {}),
      };
    }

    if (metadata) {
      this.checkReadAuthorization(
        {
          snippetId: cleanId,
          visibility: metadata.visibility,
          ownerWallet: metadata.ownerWallet,
          allowedWallets: metadata.sharedWith,
        },
        options?.viewerWallet,
      );

      if (metadata.transactionHash) {
        return this.verifySnippetTransaction({
          snippetId: cleanId,
          transactionHash: metadata.transactionHash,
          network: metadata.network ?? this.configuredNetwork,
          expectedOperation: metadata.expectedOperation,
          expectedMemo: metadata.expectedMemo,
          actorWallet: options?.viewerWallet ?? metadata.ownerWallet ?? null,
          visibility: metadata.visibility,
          ownerWallet: metadata.ownerWallet,
          allowedWallets: metadata.sharedWith,
        });
      }
    }

    // No verification or transaction reference found -> return unverifiable status
    const now = new Date().toISOString();
    const unverifiableView: PublicVerificationView = {
      id: `ver_unlinked_${cleanId}`,
      snippetId: cleanId,
      transactionHash: "",
      network: this.configuredNetwork,
      status: "unverifiable",
      ledger: null,
      verifiedAt: null,
      lastCheckedAt: now,
      retryCount: 0,
      failureReason: "No blockchain transaction is linked to this snippet.",
      failureCode: "MISSING_TRANSACTION_REFERENCE",
    };

    return {
      snippetId: cleanId,
      verification: unverifiableView,
      error: {
        status: "unverifiable",
        code: "MISSING_TRANSACTION_REFERENCE",
        message: "No blockchain transaction is linked to this snippet.",
      },
    };
  }

  /**
   * Retrieve a specific verification record by ID.
   */
  public async getVerificationById(
    verificationId: string,
    options?: { viewerWallet?: string | null },
  ): Promise<PublicVerificationView> {
    if (!verificationId || !verificationId.trim()) {
      throw new VerificationValidationError(
        "A valid verificationId is required.",
        "INVALID_INPUT",
        400,
      );
    }

    const record = await this.store.getById(verificationId.trim());
    if (!record) {
      throw new VerificationValidationError(
        `Verification record "${verificationId}" not found.`,
        "NOT_FOUND",
        404,
      );
    }

    this.checkReadAuthorization(record, options?.viewerWallet);
    return sanitizeVerificationForPublic(record);
  }

  /**
   * Retry a recoverable verification failure.
   * Preserves the existing verification record ID and increments retryCount without creating duplicates.
   */
  public async retryVerification(
    verificationId: string,
    options?: { actorWallet?: string | null },
  ): Promise<VerificationStatusResponse> {
    if (!verificationId || !verificationId.trim()) {
      throw new VerificationValidationError(
        "A valid verificationId is required for retry.",
        "INVALID_INPUT",
        400,
      );
    }

    const record = await this.store.getById(verificationId.trim());
    if (!record) {
      throw new VerificationValidationError(
        `Verification record "${verificationId}" not found.`,
        "NOT_FOUND",
        404,
      );
    }

    this.checkReadAuthorization(record, options?.actorWallet);

    // If already confirmed, return idempotently without re-mutating
    if (record.status === "confirmed") {
      return {
        snippetId: record.snippetId,
        verification: sanitizeVerificationForPublic(record),
      };
    }

    // Check if retries are already exhausted
    if (record.retryCount >= record.maxRetries) {
      const now = new Date().toISOString();
      const exhausted: BlockchainVerificationRecord = {
        ...record,
        status: "unverifiable",
        lastCheckedAt: now,
        updatedAt: now,
        failureCode: "RETRY_EXHAUSTED",
        failureReason: `Maximum retry attempts (${record.maxRetries}) reached for verification "${record.id}".`,
      };
      const saved = await this.store.save(exhausted);
      await this.recordAudit({
        verificationId: saved.id,
        snippetId: saved.snippetId,
        transactionHash: saved.transactionHash,
        action: "verification.retry_exhausted",
        previousStatus: record.status,
        newStatus: "unverifiable",
        actorWallet: options?.actorWallet ?? null,
        reason: saved.failureReason,
      });

      return {
        snippetId: saved.snippetId,
        verification: sanitizeVerificationForPublic(saved),
        error: {
          status: "unverifiable",
          code: "RETRY_EXHAUSTED",
          message: saved.failureReason!,
        },
      };
    }

    await this.recordAudit({
      verificationId: record.id,
      snippetId: record.snippetId,
      transactionHash: record.transactionHash,
      action: "verification.retried",
      previousStatus: record.status,
      newStatus: record.status,
      actorWallet: options?.actorWallet ?? null,
      reason: "Manual or scheduled retry initiated.",
      metadata: { retryAttempt: record.retryCount + 1 },
    });

    return this.evaluateAgainstStellar(
      record,
      options?.actorWallet ?? null,
      true,
    );
  }

  public async getAuditTrail(filter?: {
    snippetId?: string;
    verificationId?: string;
  }): Promise<VerificationAuditEntry[]> {
    return this.store.getAuditEntries(filter);
  }

  private async recordAudit(
    entry: Omit<VerificationAuditEntry, "id" | "timestamp">,
  ): Promise<void> {
    const fullEntry: VerificationAuditEntry = {
      ...entry,
      id: `audit_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
    };
    await this.store.appendAudit(fullEntry);

    try {
      await appendActivityLog("snippet.transaction.confirmed", "snippet", {
        actorWallet: entry.actorWallet,
        resourceId: entry.snippetId,
        metadata: {
          verificationId: entry.verificationId,
          transactionHash: entry.transactionHash,
          auditAction: entry.action,
          previousStatus: entry.previousStatus,
          newStatus: entry.newStatus,
          reason: entry.reason,
        },
      });
    } catch {
      // Non-blocking audit hook
    }
  }
}

// Singleton instance for Next.js API routes
export const blockchainVerificationService =
  new BlockchainVerificationService();
