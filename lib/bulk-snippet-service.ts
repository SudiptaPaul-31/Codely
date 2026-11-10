import crypto from "crypto";
import { logEvent } from "@/lib/audit";

export type BulkOperationType = "export" | "move" | "delete";

export type BulkFailureCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PROCESSING_FAILURE";

export interface BulkItemResult {
  snippetId: string;
  status: "success" | "failed";
  code?: BulkFailureCode;
  reason?: string;
  message?: string;
}

export interface BulkOperationSummary {
  totalRequested: number;
  uniqueProcessed: number;
  succeeded: number;
  failed: number;
}

export interface StoredBulkSnippet {
  id: string;
  title: string;
  code: string;
  language: string;
  description?: string;
  ownerWallet: string;
  visibility: "public" | "private" | "shared";
  editors?: string[];
  sharedWith?: string[];
  canDeleteWallets?: string[];
  folderId?: string | null;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredBulkFolder {
  id: string;
  name: string;
  ownerWallet: string;
  editors?: string[];
}

export interface ExportedSnippetRecord {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string;
  folderId: string | null;
  visibility: "public" | "private" | "shared";
  createdAt: string;
  updatedAt: string;
}

export interface BulkExportResponse {
  results: BulkItemResult[];
  exportedSnippets: ExportedSnippetRecord[];
  format: "json" | "markdown";
  exportedContent?: string;
  summary: BulkOperationSummary;
}

export interface BulkMoveResponse {
  results: BulkItemResult[];
  destinationFolderId: string | null;
  summary: BulkOperationSummary;
}

export interface BulkDeleteResponse {
  results: BulkItemResult[];
  summary: BulkOperationSummary;
}

export interface BulkAuditLogEntry {
  id: string;
  requestingUser: string;
  operationType: BulkOperationType;
  requestedSnippetIds: string[];
  affectedSnippetIds: string[];
  failedSnippetIds: string[];
  timestamp: string;
  outcome: "success" | "partial_success" | "failed";
  details?: Record<string, unknown>;
}

export const MAX_BULK_BATCH_SIZE = 100;

export class BulkRequestError extends Error {
  public readonly code: BulkFailureCode;
  public readonly status: number;

  constructor(code: BulkFailureCode, message: string, status = 400) {
    super(message);
    this.name = "BulkRequestError";
    this.code = code;
    this.status = status;
  }
}

const VALID_SNIPPET_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validateSnippetIdFormat(rawId: unknown): {
  valid: boolean;
  id: string;
  error?: string;
} {
  if (typeof rawId !== "string") {
    return {
      valid: false,
      id: String(rawId ?? ""),
      error: "Snippet ID must be a string.",
    };
  }
  const trimmed = rawId.trim();
  if (!trimmed) {
    return {
      valid: false,
      id: "",
      error: "Snippet ID must not be empty.",
    };
  }
  if (!VALID_SNIPPET_ID_REGEX.test(trimmed) || trimmed.includes("..")) {
    return {
      valid: false,
      id: trimmed,
      error: "Invalid snippet identifier format.",
    };
  }
  return { valid: true, id: trimmed };
}

function deduplicateRawIds(snippetIds: unknown[]): unknown[] {
  const seenStrings = new Set<string>();
  const unique: unknown[] = [];
  for (const item of snippetIds) {
    if (typeof item === "string") {
      const normalized = item.trim();
      if (seenStrings.has(normalized)) continue;
      seenStrings.add(normalized);
      unique.push(item);
    } else {
      unique.push(item);
    }
  }
  return unique;
}

export class BulkSnippetService {
  private snippets = new Map<string, StoredBulkSnippet>();
  private folders = new Map<string, StoredBulkFolder>();
  private auditLogs: BulkAuditLogEntry[] = [];
  private simulatedFailureIds = new Set<string>();

  registerSnippet(
    snippet: Omit<StoredBulkSnippet, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ): StoredBulkSnippet {
    const now = new Date().toISOString();
    const record: StoredBulkSnippet = {
      ...snippet,
      description: snippet.description ?? "",
      editors: snippet.editors ? [...snippet.editors] : [],
      sharedWith: snippet.sharedWith ? [...snippet.sharedWith] : [],
      canDeleteWallets: snippet.canDeleteWallets
        ? [...snippet.canDeleteWallets]
        : [],
      folderId: snippet.folderId ?? null,
      isDeleted: snippet.isDeleted ?? false,
      createdAt: snippet.createdAt ?? now,
      updatedAt: snippet.updatedAt ?? now,
    };
    this.snippets.set(record.id, record);
    return { ...record };
  }

  registerFolder(folder: StoredBulkFolder): StoredBulkFolder {
    const record: StoredBulkFolder = {
      ...folder,
      editors: folder.editors ? [...folder.editors] : [],
    };
    this.folders.set(record.id, record);
    return { ...record };
  }

  setSimulatedProcessingFailure(snippetId: string, shouldFail: boolean): void {
    if (shouldFail) this.simulatedFailureIds.add(snippetId);
    else this.simulatedFailureIds.delete(snippetId);
  }

  getSnippet(snippetId: string): StoredBulkSnippet | null {
    const item = this.snippets.get(snippetId);
    if (!item || item.isDeleted) return null;
    return { ...item };
  }

  private validateBatchRequest(
    snippetIds: unknown,
    callerWallet?: string | null,
  ): { actor: string; uniqueInputs: unknown[]; totalRequested: number } {
    const actor = callerWallet?.trim();
    if (!actor) {
      throw new BulkRequestError(
        "UNAUTHORIZED",
        "Authentication is required to perform bulk snippet operations.",
        401,
      );
    }

    if (!Array.isArray(snippetIds) || snippetIds.length === 0) {
      throw new BulkRequestError(
        "VALIDATION_ERROR",
        "snippetIds must be a non-empty array of snippet identifiers.",
        400,
      );
    }

    if (snippetIds.length > MAX_BULK_BATCH_SIZE) {
      throw new BulkRequestError(
        "VALIDATION_ERROR",
        `Cannot process more than ${MAX_BULK_BATCH_SIZE} snippets in a single bulk request.`,
        400,
      );
    }

    const uniqueInputs = deduplicateRawIds(snippetIds);
    return {
      actor,
      uniqueInputs,
      totalRequested: snippetIds.length,
    };
  }

  private canViewSnippet(snippet: StoredBulkSnippet, wallet: string): boolean {
    if (snippet.ownerWallet === wallet) return true;
    if (snippet.visibility === "public") return true;
    if (snippet.editors?.includes(wallet)) return true;
    if (snippet.sharedWith?.includes(wallet)) return true;
    return false;
  }

  private canEditSnippet(snippet: StoredBulkSnippet, wallet: string): boolean {
    if (snippet.ownerWallet === wallet) return true;
    if (snippet.editors?.includes(wallet)) return true;
    return false;
  }

  private canDeleteSnippet(snippet: StoredBulkSnippet, wallet: string): boolean {
    if (snippet.ownerWallet === wallet) return true;
    if (snippet.canDeleteWallets?.includes(wallet)) return true;
    return false;
  }

  private canAccessFolder(folder: StoredBulkFolder, wallet: string): boolean {
    if (folder.ownerWallet === wallet) return true;
    if (folder.editors?.includes(wallet)) return true;
    return false;
  }

  async bulkExport(
    input: {
      snippetIds: unknown;
      format?: "json" | "markdown";
    },
    callerWallet?: string | null,
  ): Promise<BulkExportResponse> {
    const { actor, uniqueInputs, totalRequested } = this.validateBatchRequest(
      input?.snippetIds,
      callerWallet,
    );

    const format = input?.format ?? "json";
    if (format !== "json" && format !== "markdown") {
      throw new BulkRequestError(
        "VALIDATION_ERROR",
        "Unsupported export format. Supported formats: json, markdown.",
        400,
      );
    }

    const results: BulkItemResult[] = [];
    const exportedSnippets: ExportedSnippetRecord[] = [];
    const requestedIds: string[] = [];

    for (const rawId of uniqueInputs) {
      const idCheck = validateSnippetIdFormat(rawId);
      requestedIds.push(idCheck.id);

      if (!idCheck.valid) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "VALIDATION_ERROR",
          reason: idCheck.error,
          message: idCheck.error,
        });
        continue;
      }

      if (this.simulatedFailureIds.has(idCheck.id)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "PROCESSING_FAILURE",
          reason: "Failed to process snippet during export",
          message: "Failed to process snippet during export",
        });
        continue;
      }

      const snippet = this.snippets.get(idCheck.id);
      if (!snippet || snippet.isDeleted) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "NOT_FOUND",
          reason: "Snippet not found",
          message: "Snippet not found",
        });
        continue;
      }

      if (!this.canViewSnippet(snippet, actor)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "FORBIDDEN",
          reason: "Permission denied",
          message: "Insufficient permissions",
        });
        continue;
      }

      results.push({
        snippetId: snippet.id,
        status: "success",
      });

      exportedSnippets.push({
        id: snippet.id,
        title: snippet.title,
        language: snippet.language,
        code: snippet.code,
        description: snippet.description ?? "",
        folderId: snippet.folderId ?? null,
        visibility: snippet.visibility,
        createdAt: snippet.createdAt,
        updatedAt: snippet.updatedAt,
      });
    }

    const exportedContent =
      format === "markdown"
        ? exportedSnippets
            .map(
              (s) =>
                `# ${s.title}\n\n${s.description ? `${s.description}\n\n` : ""}\`\`\`${s.language}\n${s.code}\n\`\`\``,
            )
            .join("\n\n---\n\n")
        : JSON.stringify(exportedSnippets, null, 2);

    const summary = this.buildSummary(totalRequested, results);
    this.recordAudit(actor, "export", requestedIds, results, { format });

    return {
      results,
      exportedSnippets,
      format,
      exportedContent,
      summary,
    };
  }

  async bulkMove(
    input: {
      snippetIds: unknown;
      folderId: string | null | undefined;
    },
    callerWallet?: string | null,
  ): Promise<BulkMoveResponse> {
    const { actor, uniqueInputs, totalRequested } = this.validateBatchRequest(
      input?.snippetIds,
      callerWallet,
    );

    if (
      input.folderId !== null &&
      (typeof input.folderId !== "string" || !input.folderId.trim())
    ) {
      throw new BulkRequestError(
        "VALIDATION_ERROR",
        "folderId must be a non-empty folder identifier or null (unfiled).",
        400,
      );
    }

    const targetFolderId =
      input.folderId === null ? null : input.folderId.trim();

    if (targetFolderId !== null) {
      const folder = this.folders.get(targetFolderId);
      if (!folder) {
        throw new BulkRequestError(
          "NOT_FOUND",
          "Destination folder not found.",
          404,
        );
      }
      if (!this.canAccessFolder(folder, actor)) {
        throw new BulkRequestError(
          "FORBIDDEN",
          "Insufficient permissions for destination folder.",
          403,
        );
      }
    }

    const results: BulkItemResult[] = [];
    const requestedIds: string[] = [];

    for (const rawId of uniqueInputs) {
      const idCheck = validateSnippetIdFormat(rawId);
      requestedIds.push(idCheck.id);

      if (!idCheck.valid) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "VALIDATION_ERROR",
          reason: idCheck.error,
          message: idCheck.error,
        });
        continue;
      }

      if (this.simulatedFailureIds.has(idCheck.id)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "PROCESSING_FAILURE",
          reason: "Failed to move snippet",
          message: "Failed to move snippet",
        });
        continue;
      }

      const snippet = this.snippets.get(idCheck.id);
      if (!snippet || snippet.isDeleted) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "NOT_FOUND",
          reason: "Snippet not found",
          message: "Snippet not found",
        });
        continue;
      }

      if (!this.canEditSnippet(snippet, actor)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "FORBIDDEN",
          reason: "Permission denied",
          message: "Insufficient permissions",
        });
        continue;
      }

      snippet.folderId = targetFolderId;
      snippet.updatedAt = new Date().toISOString();
      this.snippets.set(snippet.id, snippet);

      results.push({
        snippetId: snippet.id,
        status: "success",
      });
    }

    const summary = this.buildSummary(totalRequested, results);
    this.recordAudit(actor, "move", requestedIds, results, {
      destinationFolderId: targetFolderId,
    });

    return {
      results,
      destinationFolderId: targetFolderId,
      summary,
    };
  }

  async bulkDelete(
    input: {
      snippetIds: unknown;
    },
    callerWallet?: string | null,
  ): Promise<BulkDeleteResponse> {
    const { actor, uniqueInputs, totalRequested } = this.validateBatchRequest(
      input?.snippetIds,
      callerWallet,
    );

    const results: BulkItemResult[] = [];
    const requestedIds: string[] = [];

    for (const rawId of uniqueInputs) {
      const idCheck = validateSnippetIdFormat(rawId);
      requestedIds.push(idCheck.id);

      if (!idCheck.valid) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "VALIDATION_ERROR",
          reason: idCheck.error,
          message: idCheck.error,
        });
        continue;
      }

      if (this.simulatedFailureIds.has(idCheck.id)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "PROCESSING_FAILURE",
          reason: "Failed to delete snippet",
          message: "Failed to delete snippet",
        });
        continue;
      }

      const snippet = this.snippets.get(idCheck.id);
      if (!snippet) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "NOT_FOUND",
          reason: "Snippet not found",
          message: "Snippet not found",
        });
        continue;
      }

      if (!this.canDeleteSnippet(snippet, actor)) {
        results.push({
          snippetId: idCheck.id,
          status: "failed",
          code: "FORBIDDEN",
          reason: "Permission denied",
          message: "Insufficient permissions",
        });
        continue;
      }

      // Idempotent delete: if already soft-deleted by this owner, treat retry safely
      if (!snippet.isDeleted) {
        snippet.isDeleted = true;
        snippet.updatedAt = new Date().toISOString();
        this.snippets.set(snippet.id, snippet);
      }

      results.push({
        snippetId: snippet.id,
        status: "success",
      });
    }

    const summary = this.buildSummary(totalRequested, results);
    this.recordAudit(actor, "delete", requestedIds, results);

    return {
      results,
      summary,
    };
  }

  getAuditLogs(operationType?: BulkOperationType): BulkAuditLogEntry[] {
    const filtered = operationType
      ? this.auditLogs.filter((entry) => entry.operationType === operationType)
      : this.auditLogs;
    return filtered.map((entry) => ({
      ...entry,
      requestedSnippetIds: [...entry.requestedSnippetIds],
      affectedSnippetIds: [...entry.affectedSnippetIds],
      failedSnippetIds: [...entry.failedSnippetIds],
      details: entry.details ? { ...entry.details } : undefined,
    }));
  }

  clear(): void {
    this.snippets.clear();
    this.folders.clear();
    this.auditLogs = [];
    this.simulatedFailureIds.clear();
  }

  private buildSummary(
    totalRequested: number,
    results: BulkItemResult[],
  ): BulkOperationSummary {
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    return {
      totalRequested,
      uniqueProcessed: results.length,
      succeeded,
      failed,
    };
  }

  private recordAudit(
    requestingUser: string,
    operationType: BulkOperationType,
    requestedSnippetIds: string[],
    results: BulkItemResult[],
    details?: Record<string, unknown>,
  ): void {
    const affectedSnippetIds = results
      .filter((r) => r.status === "success")
      .map((r) => r.snippetId);
    const failedSnippetIds = results
      .filter((r) => r.status === "failed")
      .map((r) => r.snippetId);

    const outcome: BulkAuditLogEntry["outcome"] =
      failedSnippetIds.length === 0
        ? "success"
        : affectedSnippetIds.length === 0
          ? "failed"
          : "partial_success";

    const entry: BulkAuditLogEntry = {
      id: `bulk_aud_${crypto.randomUUID()}`,
      requestingUser,
      operationType,
      requestedSnippetIds,
      affectedSnippetIds,
      failedSnippetIds,
      timestamp: new Date().toISOString(),
      outcome,
      details,
    };

    this.auditLogs.push(entry);

    void logEvent(
      `snippets.bulk_${operationType}`,
      requestingUser,
      affectedSnippetIds.join(",") || "none",
      JSON.stringify({
        outcome,
        affectedCount: affectedSnippetIds.length,
        failedCount: failedSnippetIds.length,
        ...details,
      }),
    );
  }
}

export const bulkSnippetService = new BulkSnippetService();
