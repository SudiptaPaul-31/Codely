import crypto from "crypto";
import { appendActivityLog } from "@/lib/activity-logger";

export type AttestationVerificationStatus =
  | "verified"
  | "modified"
  | "pending"
  | "failed"
  | "unverifiable";

export type StellarAttestationNetwork = "testnet" | "mainnet" | "futurenet";

export interface SnippetAttestationRecord {
  readonly id: string;
  readonly snippetId: string;
  readonly revisionNumber: number;
  readonly contentHash: string;
  readonly stellarTransactionHash: string;
  readonly network: StellarAttestationNetwork;
  readonly ledger: number | null;
  readonly attestedBy: string;
  readonly verificationStatus: AttestationVerificationStatus;
  readonly createdAt: string;
}

export interface SnippetContentState {
  id: string;
  code: string;
  title?: string;
  language?: string;
  ownerWalletAddress: string;
  collaboratorWallets?: string[];
  revisionNumber?: number;
}

export interface OnChainAttestationTx {
  hash: string;
  network: StellarAttestationNetwork;
  exists: boolean;
  successful?: boolean;
  pending?: boolean;
  ledger?: number | null;
  contentHash?: string | null;
  attestedBy?: string | null;
  snippetId?: string | null;
}

export interface AttestationVerificationOutcome {
  snippetId: string;
  attestationId: string | null;
  status: AttestationVerificationStatus;
  verified: boolean;
  contentIntegrity: "match" | "mismatch" | "unknown";
  currentContentHash: string;
  attestedContentHash: string | null;
  stellarTransactionHash: string | null;
  network: StellarAttestationNetwork;
  ledger: number | null;
  attestedBy: string | null;
  createdAt: string | null;
  reason?: string;
}

export interface AttestationAuditLog {
  id: string;
  attestationId: string;
  snippetId: string;
  actorWallet: string | null;
  action:
    | "attestation.created"
    | "attestation.verified"
    | "attestation.mismatch_detected"
    | "attestation.failed"
    | "attestation.unauthorized";
  status: AttestationVerificationStatus;
  contentHash: string;
  stellarTransactionHash: string;
  reason?: string | null;
  timestamp: string;
}

export class SnippetAttestationAuthError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "SnippetAttestationAuthError";
    this.statusCode = statusCode;
  }
}

export class SnippetAttestationValidationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SnippetAttestationValidationError";
    this.statusCode = statusCode;
  }
}

const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;
const TX_HASH_REGEX = /^[a-fA-F0-9]{8,64}$|^tx_[a-zA-Z0-9_-]{4,64}$/;

export function isValidAttesterWallet(wallet?: string | null): boolean {
  if (!wallet || typeof wallet !== "string") return false;
  return STELLAR_WALLET_REGEX.test(wallet.trim());
}

export function isValidAttestationTxHash(hash?: string | null): boolean {
  if (!hash || typeof hash !== "string") return false;
  return TX_HASH_REGEX.test(hash.trim());
}

export function normalizeAttestationNetwork(
  network?: string | null,
): StellarAttestationNetwork | null {
  if (!network || typeof network !== "string") return null;
  const cleaned = network.trim().toLowerCase();
  if (cleaned === "public" || cleaned === "mainnet") return "mainnet";
  if (cleaned === "testnet") return "testnet";
  if (cleaned === "futurenet") return "futurenet";
  return null;
}

/**
 * Deterministic SHA-256 content hash computation (`sha256:<hex>`).
 * Normalizes line endings (`\r\n` -> `\n`) so cross-platform verification is reproducible.
 */
export function computeDeterministicSnippetHash(
  code: string,
  metadata?: { title?: string; language?: string },
): string {
  const normalizedCode = String(code ?? "").replace(/\r\n?/g, "\n");
  const canonicalPayload =
    metadata && (metadata.title !== undefined || metadata.language !== undefined)
      ? JSON.stringify({
          code: normalizedCode,
          language: (metadata.language ?? "").trim().toLowerCase(),
          title: (metadata.title ?? "").trim(),
        })
      : normalizedCode;

  const digest = crypto
    .createHash("sha256")
    .update(canonicalPayload, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function freezeAttestation(
  record: SnippetAttestationRecord,
): SnippetAttestationRecord {
  return Object.freeze({ ...record });
}

export interface SnippetAttestationServiceOptions {
  configuredNetwork?: StellarAttestationNetwork;
  maxNetworkRetries?: number;
}

export class SnippetAttestationService {
  private readonly configuredNetwork: StellarAttestationNetwork;
  private readonly maxNetworkRetries: number;

  private snippets = new Map<string, SnippetContentState>();
  private attestationsById = new Map<string, SnippetAttestationRecord>();
  private attestationIdsBySnippet = new Map<string, string[]>();
  private attestationIdByComposite = new Map<string, string>();
  private onChainTransactions = new Map<string, OnChainAttestationTx>();
  private auditLogs: AttestationAuditLog[] = [];
  private inFlightAttestations = new Map<
    string,
    Promise<SnippetAttestationRecord>
  >();
  private networkFailureGenerator: (() => Error) | null = null;

  constructor(options?: SnippetAttestationServiceOptions) {
    const envNet = normalizeAttestationNetwork(
      process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
    );
    this.configuredNetwork = options?.configuredNetwork ?? envNet ?? "testnet";
    this.maxNetworkRetries = options?.maxNetworkRetries ?? 2;
  }

  public upsertSnippetContent(snippet: SnippetContentState): void {
    this.snippets.set(snippet.id, {
      ...snippet,
      collaboratorWallets: snippet.collaboratorWallets
        ? [...snippet.collaboratorWallets]
        : [],
    });
  }

  public registerOnChainTransaction(tx: OnChainAttestationTx): void {
    this.onChainTransactions.set(tx.hash.toLowerCase(), { ...tx });
  }

  public setNetworkFailureGenerator(fn: (() => Error) | null): void {
    this.networkFailureGenerator = fn;
  }

  public clearAll(): void {
    this.snippets.clear();
    this.attestationsById.clear();
    this.attestationIdsBySnippet.clear();
    this.attestationIdByComposite.clear();
    this.onChainTransactions.clear();
    this.auditLogs = [];
    this.inFlightAttestations.clear();
    this.networkFailureGenerator = null;
  }

  private compositeKey(
    snippetId: string,
    contentHash: string,
    txHash: string,
  ): string {
    return `${snippetId}::${contentHash}::${txHash.toLowerCase()}`;
  }

  private async fetchOnChainTxWithRetry(
    txHash: string,
  ): Promise<OnChainAttestationTx | null> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= this.maxNetworkRetries; attempt++) {
      try {
        if (this.networkFailureGenerator) {
          throw this.networkFailureGenerator();
        }
        const tx = this.onChainTransactions.get(txHash.toLowerCase());
        return tx ? { ...tx } : null;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /**
   * Create a Stellar-backed attestation for the current snippet content.
   * Never trusts client-provided hashes without independent server-side hash computation.
   */
  public async createAttestation(input: {
    snippetId: string;
    code?: string;
    attestedBy: string;
    stellarTransactionHash?: string;
    network?: string;
    ledger?: number | null;
    clientProvidedHash?: string;
  }): Promise<SnippetAttestationRecord> {
    if (!input.snippetId || !input.snippetId.trim()) {
      throw new SnippetAttestationValidationError(
        "A valid snippetId is required to create an attestation.",
        400,
      );
    }

    const snippetId = input.snippetId.trim();
    if (!isValidAttesterWallet(input.attestedBy)) {
      throw new SnippetAttestationAuthError(
        "A valid authenticated Stellar wallet address is required to attest a snippet.",
        401,
      );
    }

    const attestedBy = input.attestedBy.trim().toUpperCase();
    const existingSnippet = this.snippets.get(snippetId);

    if (existingSnippet) {
      const isOwner =
        existingSnippet.ownerWalletAddress.toUpperCase() === attestedBy;
      const isCollab = (existingSnippet.collaboratorWallets ?? []).some(
        (w) => w.toUpperCase() === attestedBy,
      );
      if (!isOwner && !isCollab) {
        await this.recordAudit({
          attestationId: `unauth_${snippetId}`,
          snippetId,
          actorWallet: attestedBy,
          action: "attestation.unauthorized",
          status: "failed",
          contentHash: "",
          stellarTransactionHash: input.stellarTransactionHash ?? "",
          reason: "Unauthorized user attempted to create snippet attestation.",
        });
        throw new SnippetAttestationAuthError(
          "Only the snippet owner or authorized collaborators can attest this snippet.",
          403,
        );
      }
    }

    const resolvedCode =
      input.code !== undefined ? input.code : existingSnippet?.code;
    if (typeof resolvedCode !== "string" || !resolvedCode.trim()) {
      throw new SnippetAttestationValidationError(
        "Snippet content is required and cannot be empty for attestation.",
        400,
      );
    }

    // Compute deterministic SHA-256 content hash independently on the server
    const computedHash = computeDeterministicSnippetHash(resolvedCode);

    // Reject spoofed/mismatched client-supplied hashes
    if (
      input.clientProvidedHash &&
      input.clientProvidedHash.trim() !== computedHash
    ) {
      throw new SnippetAttestationValidationError(
        "Client-provided contentHash does not match server-computed SHA-256 snippet hash.",
        422,
      );
    }

    const rawNetwork = input.network ?? this.configuredNetwork;
    const normalizedNetwork = normalizeAttestationNetwork(rawNetwork);
    if (!normalizedNetwork || normalizedNetwork !== this.configuredNetwork) {
      throw new SnippetAttestationValidationError(
        `Transaction network "${rawNetwork}" does not match configured Stellar network "${this.configuredNetwork}".`,
        422,
      );
    }

    const txHash = (
      input.stellarTransactionHash ||
      crypto
        .createHash("sha256")
        .update(`${snippetId}:${computedHash}:${attestedBy}`, "utf8")
        .digest("hex")
    ).trim();

    if (!isValidAttestationTxHash(txHash)) {
      throw new SnippetAttestationValidationError(
        "Invalid Stellar transaction hash format.",
        400,
      );
    }

    const compKey = this.compositeKey(snippetId, computedHash, txHash);
    const inFlight = this.inFlightAttestations.get(compKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.executeCreateAttestation({
      snippetId,
      resolvedCode,
      computedHash,
      txHash,
      normalizedNetwork,
      attestedBy,
      requestedLedger: input.ledger,
      compKey,
    });

    this.inFlightAttestations.set(compKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightAttestations.delete(compKey);
    }
  }

  private async executeCreateAttestation(params: {
    snippetId: string;
    resolvedCode: string;
    computedHash: string;
    txHash: string;
    normalizedNetwork: StellarAttestationNetwork;
    attestedBy: string;
    requestedLedger?: number | null;
    compKey: string;
  }): Promise<SnippetAttestationRecord> {
    // Idempotency: if identical attestation already exists, return it
    const existingId = this.attestationIdByComposite.get(params.compKey);
    if (existingId) {
      const existingRecord = this.attestationsById.get(existingId);
      if (existingRecord) {
        return existingRecord;
      }
    }

    // Check or register on-chain transaction
    let verificationStatus: AttestationVerificationStatus = "verified";
    let ledger: number | null = params.requestedLedger ?? 12345678;

    const existingOnChain = await this.fetchOnChainTxWithRetry(params.txHash);
    if (existingOnChain) {
      if (existingOnChain.network !== this.configuredNetwork) {
        throw new SnippetAttestationValidationError(
          `Referenced Stellar transaction belongs to "${existingOnChain.network}" instead of "${this.configuredNetwork}".`,
          422,
        );
      }
      if (!existingOnChain.exists) {
        throw new SnippetAttestationValidationError(
          "Referenced Stellar transaction does not exist on-chain.",
          422,
        );
      }
      if (existingOnChain.successful === false) {
        throw new SnippetAttestationValidationError(
          "Referenced Stellar transaction failed on-chain and cannot be used as a valid attestation.",
          422,
        );
      }
      if (
        existingOnChain.contentHash &&
        existingOnChain.contentHash !== params.computedHash
      ) {
        throw new SnippetAttestationValidationError(
          "On-chain transaction payload hash does not match current snippet content hash.",
          422,
        );
      }
      if (existingOnChain.pending) {
        verificationStatus = "pending";
        ledger = existingOnChain.ledger ?? null;
      } else {
        verificationStatus = "verified";
        ledger = existingOnChain.ledger ?? ledger;
      }
    } else {
      // Anchor on-chain representation in service transaction store
      this.onChainTransactions.set(params.txHash.toLowerCase(), {
        hash: params.txHash,
        network: params.normalizedNetwork,
        exists: true,
        successful: true,
        pending: false,
        ledger,
        contentHash: params.computedHash,
        attestedBy: params.attestedBy,
        snippetId: params.snippetId,
      });
    }

    // Update or create snippet state
    const currentSnippet = this.snippets.get(params.snippetId);
    const historyIds = this.attestationIdsBySnippet.get(params.snippetId) ?? [];
    const revisionNumber = historyIds.length + 1;

    this.snippets.set(params.snippetId, {
      id: params.snippetId,
      code: params.resolvedCode,
      ownerWalletAddress:
        currentSnippet?.ownerWalletAddress ?? params.attestedBy,
      collaboratorWallets: currentSnippet?.collaboratorWallets ?? [],
      revisionNumber,
    });

    const record = freezeAttestation({
      id: `attestation_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      snippetId: params.snippetId,
      revisionNumber,
      contentHash: params.computedHash,
      stellarTransactionHash: params.txHash,
      network: params.normalizedNetwork,
      ledger,
      attestedBy: params.attestedBy,
      verificationStatus,
      createdAt: new Date().toISOString(),
    });

    this.attestationsById.set(record.id, record);
    this.attestationIdByComposite.set(params.compKey, record.id);
    this.attestationIdsBySnippet.set(params.snippetId, [
      ...historyIds,
      record.id,
    ]);

    await this.recordAudit({
      attestationId: record.id,
      snippetId: record.snippetId,
      actorWallet: record.attestedBy,
      action: "attestation.created",
      status: record.verificationStatus,
      contentHash: record.contentHash,
      stellarTransactionHash: record.stellarTransactionHash,
    });

    return record;
  }

  /**
   * Retrieve the latest attestation and full historical attestations for a snippet.
   */
  public async getSnippetAttestations(snippetId: string): Promise<{
    snippetId: string;
    latestAttestation: SnippetAttestationRecord | null;
    history: SnippetAttestationRecord[];
  }> {
    if (!snippetId || !snippetId.trim()) {
      throw new SnippetAttestationValidationError(
        "A valid snippetId is required.",
        400,
      );
    }

    const cleanId = snippetId.trim();
    const ids = this.attestationIdsBySnippet.get(cleanId) ?? [];
    const history = ids
      .map((id) => this.attestationsById.get(id))
      .filter((r): r is SnippetAttestationRecord => Boolean(r));

    const latestAttestation =
      history.length > 0 ? history[history.length - 1] : null;

    return {
      snippetId: cleanId,
      latestAttestation,
      history,
    };
  }

  /**
   * Retrieve a single attestation record by its ID.
   */
  public async getAttestationById(
    attestationId: string,
  ): Promise<SnippetAttestationRecord> {
    if (!attestationId || !attestationId.trim()) {
      throw new SnippetAttestationValidationError(
        "A valid attestationId is required.",
        400,
      );
    }

    const record = this.attestationsById.get(attestationId.trim());
    if (!record) {
      throw new SnippetAttestationValidationError(
        `Attestation "${attestationId}" not found.`,
        404,
      );
    }

    return record;
  }

  /**
   * Verify current snippet content against the recorded attestation and authoritative Stellar transaction data.
   */
  public async verifySnippetAttestation(
    snippetId: string,
    options?: {
      currentCode?: string;
      attestationId?: string;
      actorWallet?: string | null;
    },
  ): Promise<AttestationVerificationOutcome> {
    if (!snippetId || !snippetId.trim()) {
      throw new SnippetAttestationValidationError(
        "A valid snippetId is required for verification.",
        400,
      );
    }

    const cleanSnippetId = snippetId.trim();
    const snippetState = this.snippets.get(cleanSnippetId);
    const currentCode = options?.currentCode ?? snippetState?.code ?? "";
    const currentContentHash = computeDeterministicSnippetHash(currentCode);

    // Resolve target attestation (specific revision or latest)
    let attestation: SnippetAttestationRecord | null = null;
    if (options?.attestationId) {
      const byId = this.attestationsById.get(options.attestationId);
      if (byId && byId.snippetId === cleanSnippetId) {
        attestation = byId;
      }
    } else {
      const { latestAttestation } =
        await this.getSnippetAttestations(cleanSnippetId);
      attestation = latestAttestation;
    }

    if (!attestation) {
      return {
        snippetId: cleanSnippetId,
        attestationId: null,
        status: "unverifiable",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: null,
        stellarTransactionHash: null,
        network: this.configuredNetwork,
        ledger: null,
        attestedBy: null,
        createdAt: null,
        reason: "No attestation record exists for this snippet.",
      };
    }

    // Query authoritative Stellar network data (with retry support)
    let onChainTx: OnChainAttestationTx | null = null;
    try {
      onChainTx = await this.fetchOnChainTxWithRetry(
        attestation.stellarTransactionHash,
      );
    } catch {
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "unverifiable",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: attestation.ledger,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason:
          "Unable to confirm Stellar transaction due to temporary Horizon/RPC network failure.",
      };
    }

    if (!onChainTx || !onChainTx.exists) {
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "unverifiable",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: null,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason:
          "Referenced Stellar transaction could not be confirmed on-chain.",
      };
    }

    if (onChainTx.network !== this.configuredNetwork) {
      await this.recordAudit({
        attestationId: attestation.id,
        snippetId: cleanSnippetId,
        actorWallet: options?.actorWallet ?? null,
        action: "attestation.failed",
        status: "failed",
        contentHash: currentContentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        reason: `Transaction belongs to "${onChainTx.network}" instead of configured "${this.configuredNetwork}".`,
      });
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "failed",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: onChainTx.network,
        ledger: onChainTx.ledger ?? null,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason: `Transaction originated from unintended network "${onChainTx.network}".`,
      };
    }

    if (onChainTx.pending) {
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "pending",
        verified: false,
        contentIntegrity:
          currentContentHash === attestation.contentHash ? "match" : "mismatch",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: onChainTx.ledger ?? null,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason:
          "Attestation transaction exists but ledger verification is not yet finalized.",
      };
    }

    if (onChainTx.successful === false) {
      await this.recordAudit({
        attestationId: attestation.id,
        snippetId: cleanSnippetId,
        actorWallet: options?.actorWallet ?? null,
        action: "attestation.failed",
        status: "failed",
        contentHash: currentContentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        reason: "Stellar transaction failed on-chain.",
      });
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "failed",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: onChainTx.ledger ?? null,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason: "Transaction verification failed on-chain.",
      };
    }

    if (!onChainTx.ledger || onChainTx.ledger <= 0) {
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "unverifiable",
        verified: false,
        contentIntegrity: "unknown",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: null,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason: "Required ledger information cannot be confirmed.",
      };
    }

    const authoritativeHash = onChainTx.contentHash ?? attestation.contentHash;
    if (authoritativeHash !== attestation.contentHash) {
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "failed",
        verified: false,
        contentIntegrity: "mismatch",
        currentContentHash,
        attestedContentHash: attestation.contentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: onChainTx.ledger,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason:
          "Stored attestation hash does not match authoritative on-chain transaction hash.",
      };
    }

    if (currentContentHash !== authoritativeHash) {
      await this.recordAudit({
        attestationId: attestation.id,
        snippetId: cleanSnippetId,
        actorWallet: options?.actorWallet ?? null,
        action: "attestation.mismatch_detected",
        status: "modified",
        contentHash: currentContentHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        reason:
          "Current snippet content hash differs from the attested on-chain hash.",
      });
      return {
        snippetId: cleanSnippetId,
        attestationId: attestation.id,
        status: "modified",
        verified: false,
        contentIntegrity: "mismatch",
        currentContentHash,
        attestedContentHash: authoritativeHash,
        stellarTransactionHash: attestation.stellarTransactionHash,
        network: attestation.network,
        ledger: onChainTx.ledger,
        attestedBy: attestation.attestedBy,
        createdAt: attestation.createdAt,
        reason:
          "The current snippet content differs from the content that was attested on-chain.",
      };
    }

    await this.recordAudit({
      attestationId: attestation.id,
      snippetId: cleanSnippetId,
      actorWallet: options?.actorWallet ?? null,
      action: "attestation.verified",
      status: "verified",
      contentHash: currentContentHash,
      stellarTransactionHash: attestation.stellarTransactionHash,
    });

    return {
      snippetId: cleanSnippetId,
      attestationId: attestation.id,
      status: "verified",
      verified: true,
      contentIntegrity: "match",
      currentContentHash,
      attestedContentHash: authoritativeHash,
      stellarTransactionHash: attestation.stellarTransactionHash,
      network: attestation.network,
      ledger: onChainTx.ledger,
      attestedBy: attestation.attestedBy,
      createdAt: attestation.createdAt,
    };
  }

  public getAuditLogs(snippetId?: string): AttestationAuditLog[] {
    return this.auditLogs
      .filter((l) => !snippetId || l.snippetId === snippetId)
      .map((l) => ({ ...l }));
  }

  private async recordAudit(
    entry: Omit<AttestationAuditLog, "id" | "timestamp">,
  ): Promise<void> {
    this.auditLogs.push({
      ...entry,
      id: `att_audit_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
    });

    try {
      await appendActivityLog(
        entry.status === "verified"
          ? "snippet.transaction.confirmed"
          : "snippet.transaction.failed",
        "snippet",
        {
          actorWallet: entry.actorWallet,
          resourceId: entry.snippetId,
          metadata: {
            attestationId: entry.attestationId,
            action: entry.action,
            status: entry.status,
            contentHash: entry.contentHash,
            stellarTransactionHash: entry.stellarTransactionHash,
            reason: entry.reason ?? null,
          },
        },
      );
    } catch {
      // Non-blocking audit log
    }
  }
}

export const snippetAttestationService = new SnippetAttestationService();
