import crypto from "crypto";
import { appendActivityLog } from "@/lib/activity-logger";

export type OwnershipProofStatus =
  | "verified"
  | "invalid"
  | "tampered"
  | "pending"
  | "unverifiable";

export type StellarProofNetwork = "testnet" | "mainnet" | "futurenet";

export type ProofExportFormat = "json" | "signed_json" | "verification_link";

export interface OwnershipProofRecord {
  readonly proofId: string;
  readonly snippetId: string;
  readonly walletAddress: string;
  readonly transactionHash: string;
  readonly network: StellarProofNetwork;
  readonly verificationTimestamp: string;
  readonly proofVersion: "1.0";
  readonly signature: string;
  readonly status: OwnershipProofStatus;
}

export interface CanonicalProofPayload {
  network: StellarProofNetwork;
  proofVersion: "1.0";
  snippetId: string;
  transactionHash: string;
  verificationTimestamp: string;
  walletAddress: string;
}

export interface JsonProofExport {
  walletAddress: string;
  snippetId: string;
  transactionHash: string;
  network: StellarProofNetwork;
  proofId: string;
  verificationTimestamp: string;
  proofVersion: "1.0";
  status: OwnershipProofStatus;
}

export interface SignedJsonProofExport {
  payload: {
    walletAddress: string;
    snippetId: string;
    transactionHash: string;
    network: StellarProofNetwork;
    proofId: string;
    verificationTimestamp: string;
    proofVersion: "1.0";
  };
  signature: string;
}

export interface ProofExportBundle {
  proof: OwnershipProofRecord;
  json: JsonProofExport;
  signedJson: SignedJsonProofExport;
  verificationLink: string;
}

export interface ProofVerificationChecks {
  walletVerified: boolean;
  transactionVerified: boolean;
  snippetMatchConfirmed: boolean;
  networkVerified: boolean;
  signatureVerified: boolean;
}

export interface ProofVerificationResult {
  status: OwnershipProofStatus;
  verified: boolean;
  proofId: string | null;
  snippetId: string | null;
  walletAddress: string | null;
  transactionHash: string | null;
  network: string | null;
  checks: ProofVerificationChecks;
  reason?: string;
}

export interface OwnershipProofAuditEntry {
  id: string;
  proofId: string;
  snippetId: string;
  walletAddress: string;
  action:
    | "proof.generated"
    | "proof.exported"
    | "proof.verified"
    | "proof.verification_failed"
    | "proof.unauthorized_attempt";
  status: OwnershipProofStatus;
  reason?: string | null;
  timestamp: string;
}

export interface EligibleSnippetRecord {
  id: string;
  ownerWalletAddress: string;
  transactionHash: string;
  network?: StellarProofNetwork;
}

export interface StellarProofTxRecord {
  hash: string;
  network: StellarProofNetwork;
  exists: boolean;
  successful?: boolean;
  pending?: boolean;
  sourceWallet?: string;
  snippetId?: string;
}

export class OwnershipProofAuthError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "OwnershipProofAuthError";
    this.statusCode = statusCode;
  }
}

export class OwnershipProofValidationError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OwnershipProofValidationError";
    this.statusCode = statusCode;
  }
}

const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;
const TX_HASH_REGEX = /^[a-fA-F0-9]{8,64}$|^tx_[a-zA-Z0-9_-]{4,64}$/;
const DEFAULT_PROOF_SECRET =
  process.env.OWNERSHIP_PROOF_SIGNING_SECRET ||
  "codely-stellar-ownership-proof-secret-v1";
const DEFAULT_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.example.com";

export function isValidStellarWalletAddress(address?: string | null): boolean {
  if (!address || typeof address !== "string") return false;
  return STELLAR_WALLET_REGEX.test(address.trim());
}

export function isValidStellarTxReference(hash?: string | null): boolean {
  if (!hash || typeof hash !== "string") return false;
  return TX_HASH_REGEX.test(hash.trim());
}

export function normalizeProofNetwork(
  network?: string | null,
): StellarProofNetwork | null {
  if (!network || typeof network !== "string") return null;
  const cleaned = network.trim().toLowerCase();
  if (cleaned === "public" || cleaned === "mainnet") return "mainnet";
  if (cleaned === "testnet") return "testnet";
  if (cleaned === "futurenet") return "futurenet";
  return null;
}

/**
 * Deterministic canonical JSON serialization with sorted keys.
 */
export function serializeCanonicalProofPayload(
  payload: CanonicalProofPayload,
): string {
  return JSON.stringify({
    network: payload.network,
    proofVersion: payload.proofVersion,
    snippetId: payload.snippetId,
    transactionHash: payload.transactionHash.toLowerCase(),
    verificationTimestamp: payload.verificationTimestamp,
    walletAddress: payload.walletAddress.toUpperCase(),
  });
}

export function computeProofSignature(
  payload: CanonicalProofPayload,
  secret: string = DEFAULT_PROOF_SECRET,
): string {
  const canonical = serializeCanonicalProofPayload(payload);
  return crypto
    .createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");
}

export function verifyProofSignature(
  payload: CanonicalProofPayload,
  signature: string,
  secret: string = DEFAULT_PROOF_SECRET,
): boolean {
  if (!signature || typeof signature !== "string") return false;
  const expected = computeProofSignature(payload, secret);
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

function freezeProofRecord(
  record: OwnershipProofRecord,
): OwnershipProofRecord {
  return Object.freeze({ ...record });
}

export interface OwnershipProofServiceOptions {
  configuredNetwork?: StellarProofNetwork;
  signingSecret?: string;
  baseUrl?: string;
}

export class OwnershipProofService {
  private readonly configuredNetwork: StellarProofNetwork;
  private readonly signingSecret: string;
  private readonly baseUrl: string;

  private proofsById = new Map<string, OwnershipProofRecord>();
  private proofIdByComposite = new Map<string, string>();
  private latestProofIdBySnippet = new Map<string, string>();
  private snippets = new Map<string, EligibleSnippetRecord>();
  private transactions = new Map<string, StellarProofTxRecord>();
  private auditLogs: OwnershipProofAuditEntry[] = [];
  private transientNetworkFailure: (() => Error) | null = null;

  constructor(options?: OwnershipProofServiceOptions) {
    const envNet = normalizeProofNetwork(
      process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
    );
    this.configuredNetwork = options?.configuredNetwork ?? envNet ?? "testnet";
    this.signingSecret = options?.signingSecret ?? DEFAULT_PROOF_SECRET;
    this.baseUrl = (options?.baseUrl ?? DEFAULT_APP_BASE_URL).replace(
      /\/+$/,
      "",
    );
  }

  public registerEligibleSnippet(snippet: EligibleSnippetRecord): void {
    this.snippets.set(snippet.id, { ...snippet });
  }

  public registerTransaction(tx: StellarProofTxRecord): void {
    this.transactions.set(tx.hash.toLowerCase(), { ...tx });
  }

  public setTransientNetworkFailure(factory: (() => Error) | null): void {
    this.transientNetworkFailure = factory;
  }

  public clearAll(): void {
    this.proofsById.clear();
    this.proofIdByComposite.clear();
    this.latestProofIdBySnippet.clear();
    this.snippets.clear();
    this.transactions.clear();
    this.auditLogs = [];
    this.transientNetworkFailure = null;
  }

  private compositeKey(
    snippetId: string,
    walletAddress: string,
    txHash: string,
  ): string {
    return `${snippetId}::${walletAddress.toUpperCase()}::${txHash.toLowerCase()}`;
  }

  private async queryTransactionWithRetry(
    txHash: string,
    maxRetries = 2,
  ): Promise<StellarProofTxRecord | null> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (this.transientNetworkFailure) {
          throw this.transientNetworkFailure();
        }
        const tx = this.transactions.get(txHash.toLowerCase());
        return tx ? { ...tx } : null;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Generate an immutable, exportable Stellar wallet ownership proof for a snippet.
   */
  public async generateOwnershipProof(input: {
    snippetId: string;
    walletAddress: string;
    actorWallet?: string | null;
    transactionHash?: string;
    network?: string;
    verificationTimestamp?: string;
  }): Promise<ProofExportBundle> {
    if (!input.snippetId || !input.snippetId.trim()) {
      throw new OwnershipProofValidationError(
        "A valid snippetId is required to generate an ownership proof.",
        400,
      );
    }

    const snippetId = input.snippetId.trim();
    const actor = input.actorWallet ?? input.walletAddress;

    if (!actor || !isValidStellarWalletAddress(actor)) {
      throw new OwnershipProofAuthError(
        "A valid authenticated Stellar wallet address is required.",
        401,
      );
    }

    if (!isValidStellarWalletAddress(input.walletAddress)) {
      throw new OwnershipProofValidationError(
        "Invalid Stellar wallet address format.",
        400,
      );
    }

    const walletAddress = input.walletAddress.trim().toUpperCase();
    const actorWallet = actor.trim().toUpperCase();

    if (actorWallet !== walletAddress) {
      await this.recordAudit({
        proofId: `unauth_${snippetId}`,
        snippetId,
        walletAddress: actorWallet,
        action: "proof.unauthorized_attempt",
        status: "invalid",
        reason: "Actor wallet does not control the requested proof wallet.",
      });
      throw new OwnershipProofAuthError(
        "You can only generate ownership proofs for a wallet you control.",
        403,
      );
    }

    const registeredSnippet = this.snippets.get(snippetId);
    if (
      registeredSnippet &&
      registeredSnippet.ownerWalletAddress.toUpperCase() !== walletAddress
    ) {
      await this.recordAudit({
        proofId: `unauth_${snippetId}`,
        snippetId,
        walletAddress,
        action: "proof.unauthorized_attempt",
        status: "invalid",
        reason: "Requester is not the verified owner of the snippet.",
      });
      throw new OwnershipProofAuthError(
        "Unauthorized: You do not own this snippet.",
        403,
      );
    }

    const txHash = (
      input.transactionHash ??
      registeredSnippet?.transactionHash ??
      ""
    ).trim();
    if (!isValidStellarTxReference(txHash)) {
      throw new OwnershipProofValidationError(
        "A valid verified Stellar transaction hash is required to generate an ownership proof.",
        400,
      );
    }

    const rawNetwork =
      input.network ?? registeredSnippet?.network ?? this.configuredNetwork;
    const normalizedNetwork = normalizeProofNetwork(rawNetwork);
    if (!normalizedNetwork || normalizedNetwork !== this.configuredNetwork) {
      throw new OwnershipProofValidationError(
        `Stellar network "${rawNetwork}" does not match configured network "${this.configuredNetwork}".`,
        422,
      );
    }

    // Idempotent duplicate check: return existing immutable proof if already generated for same tuple
    const compKey = this.compositeKey(snippetId, walletAddress, txHash);
    const existingProofId = this.proofIdByComposite.get(compKey);
    if (existingProofId) {
      const existingProof = this.proofsById.get(existingProofId);
      if (existingProof) {
        return this.buildExportBundle(existingProof);
      }
    }

    // Check Stellar transaction if registered in the network store
    let proofStatus: OwnershipProofStatus = "verified";
    try {
      const tx = await this.queryTransactionWithRetry(txHash);
      if (tx) {
        if (tx.network !== this.configuredNetwork) {
          throw new OwnershipProofValidationError(
            `Transaction belongs to "${tx.network}" instead of "${this.configuredNetwork}".`,
            422,
          );
        }
        if (tx.pending) {
          proofStatus = "pending";
        } else if (!tx.exists || tx.successful === false) {
          throw new OwnershipProofValidationError(
            "Referenced Stellar transaction is unconfirmed or failed on-chain.",
            422,
          );
        } else if (
          tx.sourceWallet &&
          tx.sourceWallet.toUpperCase() !== walletAddress
        ) {
          throw new OwnershipProofAuthError(
            "Referenced Stellar transaction was not signed by the snippet owner wallet.",
            403,
          );
        }
      }
    } catch (error) {
      if (
        error instanceof OwnershipProofValidationError ||
        error instanceof OwnershipProofAuthError
      ) {
        throw error;
      }
      throw new OwnershipProofValidationError(
        "Unable to confirm Stellar transaction due to temporary network unavailability.",
        503,
      );
    }

    const verificationTimestamp =
      input.verificationTimestamp || new Date().toISOString();
    const payload: CanonicalProofPayload = {
      network: normalizedNetwork,
      proofVersion: "1.0",
      snippetId,
      transactionHash: txHash,
      verificationTimestamp,
      walletAddress,
    };

    const signature = computeProofSignature(payload, this.signingSecret);
    const proofId = `proof_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const record = freezeProofRecord({
      proofId,
      snippetId,
      walletAddress,
      transactionHash: txHash,
      network: normalizedNetwork,
      verificationTimestamp,
      proofVersion: "1.0",
      signature,
      status: proofStatus,
    });

    this.proofsById.set(proofId, record);
    this.proofIdByComposite.set(compKey, proofId);
    this.latestProofIdBySnippet.set(snippetId, proofId);

    // Ensure snippet is tracked for future independent verification checks
    if (!registeredSnippet) {
      this.snippets.set(snippetId, {
        id: snippetId,
        ownerWalletAddress: walletAddress,
        transactionHash: txHash,
        network: normalizedNetwork,
      });
    }
    if (!this.transactions.has(txHash.toLowerCase())) {
      this.transactions.set(txHash.toLowerCase(), {
        hash: txHash,
        network: normalizedNetwork,
        exists: true,
        successful: proofStatus === "verified",
        pending: proofStatus === "pending",
        sourceWallet: walletAddress,
        snippetId,
      });
    }

    await this.recordAudit({
      proofId,
      snippetId,
      walletAddress,
      action: "proof.generated",
      status: proofStatus,
    });

    return this.buildExportBundle(record);
  }

  public buildExportBundle(record: OwnershipProofRecord): ProofExportBundle {
    const frozen = freezeProofRecord(record);
    const json: JsonProofExport = {
      proofId: frozen.proofId,
      snippetId: frozen.snippetId,
      walletAddress: frozen.walletAddress,
      transactionHash: frozen.transactionHash,
      network: frozen.network,
      verificationTimestamp: frozen.verificationTimestamp,
      proofVersion: frozen.proofVersion,
      status: frozen.status,
    };

    const signedJson: SignedJsonProofExport = {
      payload: {
        proofId: frozen.proofId,
        snippetId: frozen.snippetId,
        walletAddress: frozen.walletAddress,
        transactionHash: frozen.transactionHash,
        network: frozen.network,
        verificationTimestamp: frozen.verificationTimestamp,
        proofVersion: frozen.proofVersion,
      },
      signature: frozen.signature,
    };

    const verificationLink = `${this.baseUrl}/proofs/${frozen.proofId}`;

    return {
      proof: frozen,
      json,
      signedJson,
      verificationLink,
    };
  }

  public async getProofBySnippetId(
    snippetId: string,
  ): Promise<ProofExportBundle> {
    if (!snippetId || !snippetId.trim()) {
      throw new OwnershipProofValidationError(
        "A valid snippetId is required.",
        400,
      );
    }
    const proofId = this.latestProofIdBySnippet.get(snippetId.trim());
    if (!proofId) {
      throw new OwnershipProofValidationError(
        `No ownership proof found for snippet "${snippetId}".`,
        404,
      );
    }
    return this.getProofById(proofId);
  }

  public async getProofById(proofId: string): Promise<ProofExportBundle> {
    if (!proofId || !proofId.trim()) {
      throw new OwnershipProofValidationError(
        "A valid proofId is required.",
        400,
      );
    }
    const record = this.proofsById.get(proofId.trim());
    if (!record) {
      throw new OwnershipProofValidationError(
        `Ownership proof "${proofId}" not found.`,
        404,
      );
    }
    return this.buildExportBundle(record);
  }

  /**
   * Independently verify an exported ownership proof (accepts proof object, signedJson, or proofId).
   */
  public async verifyOwnershipProof(input: {
    proofId?: string;
    snippetId?: string;
    walletAddress?: string;
    transactionHash?: string;
    network?: string;
    verificationTimestamp?: string;
    proofVersion?: string;
    signature?: string;
    payload?: {
      proofId?: string;
      snippetId?: string;
      walletAddress?: string;
      transactionHash?: string;
      network?: string;
      verificationTimestamp?: string;
      proofVersion?: string;
    };
  }): Promise<ProofVerificationResult> {
    const resolvedPayload = input.payload ? input.payload : input;
    const proofId = resolvedPayload.proofId ?? input.proofId ?? null;
    const storedProof = proofId ? this.proofsById.get(proofId) : undefined;

    const snippetId =
      resolvedPayload.snippetId ?? storedProof?.snippetId ?? null;
    const walletAddress =
      resolvedPayload.walletAddress ?? storedProof?.walletAddress ?? null;
    const transactionHash =
      resolvedPayload.transactionHash ?? storedProof?.transactionHash ?? null;
    const rawNetwork =
      resolvedPayload.network ?? storedProof?.network ?? this.configuredNetwork;
    const verificationTimestamp =
      resolvedPayload.verificationTimestamp ??
      storedProof?.verificationTimestamp ??
      null;
    const signature = input.signature ?? storedProof?.signature ?? null;

    const checks: ProofVerificationChecks = {
      walletVerified: false,
      transactionVerified: false,
      snippetMatchConfirmed: false,
      networkVerified: false,
      signatureVerified: false,
    };

    // 1. Validate required structure
    if (!snippetId || !walletAddress || !transactionHash) {
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: rawNetwork ?? null,
        checks,
        reason: "Required proof elements (snippetId, walletAddress, transactionHash) are missing.",
      };
    }

    // 2. Validate wallet format
    if (!isValidStellarWalletAddress(walletAddress)) {
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: rawNetwork ?? null,
        checks,
        reason: "Invalid Stellar wallet address in proof.",
      };
    }
    checks.walletVerified = true;

    // 3. Validate network
    const normalizedNetwork = normalizeProofNetwork(rawNetwork);
    if (!normalizedNetwork || normalizedNetwork !== this.configuredNetwork) {
      await this.recordAudit({
        proofId: proofId ?? "unknown",
        snippetId,
        walletAddress,
        action: "proof.verification_failed",
        status: "invalid",
        reason: `Proof network "${rawNetwork}" does not match expected Stellar network "${this.configuredNetwork}".`,
      });
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: rawNetwork ?? null,
        checks,
        reason: `Proof network "${rawNetwork}" does not match expected Stellar network "${this.configuredNetwork}".`,
      };
    }
    checks.networkVerified = true;

    // 4. Detect tampering via cryptographic signature or stored immutable record comparison
    if (storedProof) {
      const fieldsModified =
        storedProof.snippetId !== snippetId ||
        storedProof.walletAddress.toUpperCase() !== walletAddress.toUpperCase() ||
        storedProof.transactionHash.toLowerCase() !==
          transactionHash.toLowerCase() ||
        storedProof.network !== normalizedNetwork ||
        (verificationTimestamp &&
          storedProof.verificationTimestamp !== verificationTimestamp);

      if (fieldsModified) {
        await this.recordAudit({
          proofId: storedProof.proofId,
          snippetId,
          walletAddress,
          action: "proof.verification_failed",
          status: "tampered",
          reason: "Proof content was modified after creation.",
        });
        return {
          status: "tampered",
          verified: false,
          proofId: storedProof.proofId,
          snippetId,
          walletAddress,
          transactionHash,
          network: normalizedNetwork,
          checks,
          reason: "The proof content appears to have been modified after creation.",
        };
      }
    }

    if (signature && verificationTimestamp) {
      const sigValid = verifyProofSignature(
        {
          network: normalizedNetwork,
          proofVersion: "1.0",
          snippetId,
          transactionHash,
          verificationTimestamp,
          walletAddress: walletAddress.toUpperCase(),
        },
        signature,
        this.signingSecret,
      );

      if (!sigValid) {
        await this.recordAudit({
          proofId: proofId ?? "external",
          snippetId,
          walletAddress,
          action: "proof.verification_failed",
          status: "tampered",
          reason: "Cryptographic signature verification failed (tampered proof).",
        });
        return {
          status: "tampered",
          verified: false,
          proofId,
          snippetId,
          walletAddress,
          transactionHash,
          network: normalizedNetwork,
          checks,
          reason: "Proof signature does not match payload; proof appears tampered.",
        };
      }
      checks.signatureVerified = true;
    } else if (signature && !verificationTimestamp) {
      return {
        status: "tampered",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Signed proof is missing verificationTimestamp required for signature verification.",
      };
    } else {
      checks.signatureVerified = Boolean(storedProof);
    }

    // 5. Validate snippet association
    const snippetRecord = this.snippets.get(snippetId);
    if (snippetRecord) {
      if (
        snippetRecord.ownerWalletAddress.toUpperCase() !==
        walletAddress.toUpperCase()
      ) {
        checks.walletVerified = false;
        return {
          status: "invalid",
          verified: false,
          proofId,
          snippetId,
          walletAddress,
          transactionHash,
          network: normalizedNetwork,
          checks,
          reason: "Wallet address does not match recorded snippet owner.",
        };
      }
      checks.snippetMatchConfirmed = true;
    } else if (storedProof && storedProof.snippetId === snippetId) {
      checks.snippetMatchConfirmed = true;
    } else {
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Snippet reference does not match any verified ownership record.",
      };
    }

    // 6. Verify Stellar transaction on-chain (with retry on transient network failures)
    let tx: StellarProofTxRecord | null = null;
    try {
      tx = await this.queryTransactionWithRetry(transactionHash, 2);
    } catch {
      return {
        status: "unverifiable",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Required blockchain transaction data cannot currently be confirmed due to network unavailability.",
      };
    }

    if (!tx || !tx.exists) {
      return {
        status: "unverifiable",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Referenced Stellar transaction could not be found on the network.",
      };
    }

    if (tx.network !== this.configuredNetwork) {
      checks.networkVerified = false;
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: tx.network,
        checks,
        reason: `Referenced transaction belongs to "${tx.network}" instead of "${this.configuredNetwork}".`,
      };
    }

    if (tx.pending) {
      return {
        status: "pending",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Referenced transaction or attestation is awaiting final verification.",
      };
    }

    if (tx.successful === false) {
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Referenced Stellar transaction failed on-chain.",
      };
    }

    if (
      tx.sourceWallet &&
      tx.sourceWallet.toUpperCase() !== walletAddress.toUpperCase()
    ) {
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Transaction source wallet does not match proof wallet address.",
      };
    }

    if (tx.snippetId && tx.snippetId !== snippetId) {
      checks.snippetMatchConfirmed = false;
      return {
        status: "invalid",
        verified: false,
        proofId,
        snippetId,
        walletAddress,
        transactionHash,
        network: normalizedNetwork,
        checks,
        reason: "Transaction snippet reference does not match proof snippetId.",
      };
    }

    checks.transactionVerified = true;

    await this.recordAudit({
      proofId: proofId ?? "independent",
      snippetId,
      walletAddress,
      action: "proof.verified",
      status: "verified",
    });

    return {
      status: "verified",
      verified: true,
      proofId,
      snippetId,
      walletAddress: walletAddress.toUpperCase(),
      transactionHash,
      network: normalizedNetwork,
      checks,
    };
  }

  public getAuditLogs(snippetId?: string): OwnershipProofAuditEntry[] {
    return this.auditLogs
      .filter((entry) => !snippetId || entry.snippetId === snippetId)
      .map((entry) => ({ ...entry }));
  }

  private async recordAudit(
    entry: Omit<OwnershipProofAuditEntry, "id" | "timestamp">,
  ): Promise<void> {
    this.auditLogs.push({
      ...entry,
      id: `proof_audit_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
    });

    try {
      await appendActivityLog(
        entry.status === "verified"
          ? "snippet.proof_verified"
          : "snippet.proof_verification_failed",
        "snippet",
        {
          actorWallet: entry.walletAddress,
          resourceId: entry.snippetId,
          metadata: {
            proofId: entry.proofId,
            action: entry.action,
            status: entry.status,
            reason: entry.reason ?? null,
          },
        },
      );
    } catch {
      // Non-blocking audit log
    }
  }
}

export const ownershipProofService = new OwnershipProofService();
