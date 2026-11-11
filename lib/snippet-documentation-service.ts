import crypto from "crypto";
import { appendActivityLog } from "@/lib/activity-logger";

export const MAX_TEXT_SECTION_LENGTH = 5_000;
export const MAX_LIST_ITEMS = 50;
export const MAX_LIST_ITEM_LENGTH = 500;
export const MAX_EXAMPLE_PAYLOAD_BYTES = 10_000;

const ALLOWED_DOCUMENTATION_FIELDS = new Set([
  "overview",
  "usageInstructions",
  "prerequisites",
  "setupSteps",
  "inputExample",
  "outputExample",
  "notes",
]);

export interface SnippetDocumentationRecord {
  id: string;
  snippetId: string;
  overview: string;
  usageInstructions?: string;
  prerequisites: string[];
  setupSteps: string[];
  inputExample: Record<string, unknown> | unknown[] | string | null;
  outputExample: Record<string, unknown> | unknown[] | string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface SnippetDocumentationResponse {
  snippetId: string;
  documentation: SnippetDocumentationRecord | null;
  empty: boolean;
}

export interface SnippetAccessMetadata {
  id: string;
  ownerWalletAddress: string;
  collaboratorWallets?: string[];
  visibility?: "private" | "public" | "shared";
  exists?: boolean;
}

export interface SnippetAccessResolver {
  resolveSnippet(snippetId: string): Promise<SnippetAccessMetadata | null>;
  canEditSnippet?(snippetId: string, walletAddress: string): Promise<boolean>;
  canViewSnippet?(snippetId: string, walletAddress: string): Promise<boolean>;
}

export interface DocumentationAuditEntry {
  id: string;
  snippetId: string;
  documentationId: string | null;
  actorWallet: string | null;
  action:
    | "documentation.created"
    | "documentation.updated"
    | "documentation.deleted"
    | "documentation.unauthorized";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class DocumentationAuthError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "DocumentationAuthError";
    this.statusCode = statusCode;
  }
}

export class DocumentationValidationError extends Error {
  public readonly statusCode: number;
  public readonly fields?: Record<string, string>;
  constructor(
    message: string,
    fields?: Record<string, string>,
    statusCode = 400,
  ) {
    super(message);
    this.name = "DocumentationValidationError";
    this.fields = fields;
    this.statusCode = statusCode;
  }
}

export class DocumentationNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message = "Snippet not found.") {
    super(message);
    this.name = "DocumentationNotFoundError";
  }
}

const STELLAR_WALLET_REGEX = /^G[A-Z2-7]{55}$/;

export function isValidDocumentationWallet(wallet?: string | null): boolean {
  if (!wallet || typeof wallet !== "string") return false;
  return STELLAR_WALLET_REGEX.test(wallet.trim());
}

function stripDisallowedControlChars(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const isAllowedWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    if ((code >= 0x20 && code !== 0x7f) || isAllowedWhitespace) {
      out += input[i];
    }
  }
  return out;
}

/**
 * Sanitize user-generated text/markdown content against XSS, script tags,
 * unsafe HTML elements, inline event handlers, and dangerous URL protocols.
 */
export function sanitizeDocumentationText(raw: string): string {
  let clean = String(raw ?? "").replace(/\r\n?/g, "\n");
  // Remove <script>, <iframe>, <object>, <embed>, <style> blocks and tags
  clean = clean.replace(
    /<\s*(script|iframe|object|embed|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  clean = clean.replace(
    /<\s*\/?\s*(script|iframe|object|embed|style)\b[^>]*>/gi,
    "",
  );
  // Strip inline on* event handlers (e.g. onerror="...", onclick='...')
  clean = clean.replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Neutralize javascript:, vbscript:, and data:text/html URLs
  clean = clean.replace(/(?:javascript|vbscript)\s*:/gi, "unsafe:");
  clean = clean.replace(/data\s*:\s*text\/html/gi, "unsafe:text/html");
  // Remove NUL and non-printable control characters
  clean = stripDisallowedControlChars(clean);
  return clean.trim();
}

export function sanitizeExampleValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeDocumentationText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExampleValue(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const safeKey = sanitizeDocumentationText(k);
      out[safeKey] = sanitizeExampleValue(v);
    }
    return out;
  }
  return value;
}

function validateAndSanitizeExample(
  rawExample: unknown,
  fieldName: "inputExample" | "outputExample",
): Record<string, unknown> | unknown[] | string | null {
  if (rawExample === undefined || rawExample === null) {
    return null;
  }

  let serializedLength = 0;
  try {
    serializedLength =
      typeof rawExample === "string"
        ? Buffer.byteLength(rawExample, "utf8")
        : Buffer.byteLength(JSON.stringify(rawExample), "utf8");
  } catch {
    throw new DocumentationValidationError(
      `Invalid ${fieldName} format.`,
      { [fieldName]: `${fieldName} must be serializable JSON or text.` },
      400,
    );
  }

  if (serializedLength > MAX_EXAMPLE_PAYLOAD_BYTES) {
    throw new DocumentationValidationError(
      `${fieldName} exceeds maximum allowed size of ${MAX_EXAMPLE_PAYLOAD_BYTES} bytes.`,
      {
        [fieldName]: `${fieldName} exceeds maximum size limit (${MAX_EXAMPLE_PAYLOAD_BYTES} bytes).`,
      },
      400,
    );
  }

  if (typeof rawExample === "string") {
    const trimmed = rawExample.trim();
    if (!trimmed) return null;
    // If string looks like a JSON object/array or starts with `{` / `[`, validate JSON syntax
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return sanitizeExampleValue(parsed) as
          | Record<string, unknown>
          | unknown[];
      } catch {
        throw new DocumentationValidationError(
          `Invalid JSON in ${fieldName}.`,
          { [fieldName]: `${fieldName} contains malformed JSON.` },
          400,
        );
      }
    }
    return sanitizeDocumentationText(trimmed);
  }

  if (typeof rawExample === "object") {
    // Check if wrapped in { format: "json", content: "..." }
    const obj = rawExample as Record<string, unknown>;
    if (
      obj.format === "json" &&
      typeof obj.content === "string" &&
      Object.keys(obj).length <= 2
    ) {
      try {
        const parsed = JSON.parse(obj.content);
        return sanitizeExampleValue(parsed) as
          | Record<string, unknown>
          | unknown[];
      } catch {
        throw new DocumentationValidationError(
          `Invalid JSON example in ${fieldName}.`,
          { [fieldName]: `${fieldName} must contain valid JSON.` },
          400,
        );
      }
    }

    return sanitizeExampleValue(rawExample) as
      | Record<string, unknown>
      | unknown[];
  }

  throw new DocumentationValidationError(
    `Unsupported format for ${fieldName}.`,
    {
      [fieldName]: `${fieldName} must be a JSON object, array, or string.`,
    },
    400,
  );
}

function validateAndSanitizeStringList(
  rawList: unknown,
  fieldName: "prerequisites" | "setupSteps",
): string[] {
  if (rawList === undefined || rawList === null) return [];

  if (!Array.isArray(rawList)) {
    throw new DocumentationValidationError(
      `${fieldName} must be an array of strings.`,
      { [fieldName]: `${fieldName} must be an array of strings.` },
      400,
    );
  }

  if (rawList.length > MAX_LIST_ITEMS) {
    throw new DocumentationValidationError(
      `${fieldName} cannot exceed ${MAX_LIST_ITEMS} items.`,
      { [fieldName]: `Maximum ${MAX_LIST_ITEMS} items allowed.` },
      400,
    );
  }

  const sanitized: string[] = [];
  for (const item of rawList) {
    if (typeof item !== "string") {
      throw new DocumentationValidationError(
        `All entries in ${fieldName} must be strings.`,
        { [fieldName]: `All entries in ${fieldName} must be strings.` },
        400,
      );
    }
    if (item.length > MAX_LIST_ITEM_LENGTH) {
      throw new DocumentationValidationError(
        `Item in ${fieldName} exceeds maximum length of ${MAX_LIST_ITEM_LENGTH} characters.`,
        {
          [fieldName]: `Each item must be under ${MAX_LIST_ITEM_LENGTH} characters.`,
        },
        400,
      );
    }
    const clean = sanitizeDocumentationText(item);
    if (clean) {
      sanitized.push(clean);
    }
  }
  return sanitized;
}

export function validateDocumentationInput(rawInput: unknown): {
  overview: string;
  usageInstructions?: string;
  prerequisites: string[];
  setupSteps: string[];
  inputExample: Record<string, unknown> | unknown[] | string | null;
  outputExample: Record<string, unknown> | unknown[] | string | null;
  notes: string;
} {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new DocumentationValidationError(
      "Documentation payload must be a JSON object.",
      { form: "Documentation payload must be a JSON object." },
      400,
    );
  }

  const record = rawInput as Record<string, unknown>;
  const unsupportedFields = Object.keys(record).filter(
    (k) => !ALLOWED_DOCUMENTATION_FIELDS.has(k),
  );
  if (unsupportedFields.length > 0) {
    const fieldErrors: Record<string, string> = {};
    for (const f of unsupportedFields) {
      fieldErrors[f] = `Unsupported documentation field "${f}".`;
    }
    throw new DocumentationValidationError(
      `Unsupported documentation fields: ${unsupportedFields.join(", ")}.`,
      fieldErrors,
      400,
    );
  }

  const validateTextSection = (
    val: unknown,
    field: "overview" | "notes" | "usageInstructions",
  ): string => {
    if (val === undefined || val === null) return "";
    if (typeof val !== "string") {
      throw new DocumentationValidationError(
        `${field} must be a string.`,
        { [field]: `${field} must be a string.` },
        400,
      );
    }
    if (val.length > MAX_TEXT_SECTION_LENGTH) {
      throw new DocumentationValidationError(
        `${field} exceeds maximum length of ${MAX_TEXT_SECTION_LENGTH} characters.`,
        {
          [field]: `${field} must be at most ${MAX_TEXT_SECTION_LENGTH} characters.`,
        },
        400,
      );
    }
    return sanitizeDocumentationText(val);
  };

  const overview = validateTextSection(record.overview, "overview");
  const usageInstructions = validateTextSection(
    record.usageInstructions,
    "usageInstructions",
  );
  const notes = validateTextSection(record.notes, "notes");
  const prerequisites = validateAndSanitizeStringList(
    record.prerequisites,
    "prerequisites",
  );
  const setupSteps = validateAndSanitizeStringList(
    record.setupSteps,
    "setupSteps",
  );
  const inputExample = validateAndSanitizeExample(
    record.inputExample,
    "inputExample",
  );
  const outputExample = validateAndSanitizeExample(
    record.outputExample,
    "outputExample",
  );

  const isEmpty =
    !overview &&
    !usageInstructions &&
    !notes &&
    prerequisites.length === 0 &&
    setupSteps.length === 0 &&
    inputExample === null &&
    outputExample === null;

  if (isEmpty) {
    throw new DocumentationValidationError(
      "Documentation submission cannot be empty. Provide at least one valid section.",
      { form: "Provide at least one documentation section." },
      400,
    );
  }

  return {
    overview,
    ...(usageInstructions ? { usageInstructions } : {}),
    prerequisites,
    setupSteps,
    inputExample,
    outputExample,
    notes,
  };
}

export class SnippetDocumentationService {
  private docsBySnippetId = new Map<string, SnippetDocumentationRecord>();
  private snippetAccess = new Map<string, SnippetAccessMetadata>();
  private accessResolver: SnippetAccessResolver | null = null;
  private auditLogs: DocumentationAuditEntry[] = [];
  private snippetWriteLocks = new Map<string, Promise<unknown>>();

  constructor(accessResolver?: SnippetAccessResolver | null) {
    this.accessResolver = accessResolver ?? null;
  }

  public setAccessResolver(resolver: SnippetAccessResolver | null): void {
    this.accessResolver = resolver;
  }

  public getAccessResolver(): SnippetAccessResolver | null {
    return this.accessResolver;
  }

  public hasAccessResolver(): boolean {
    return this.accessResolver !== null;
  }

  public registerSnippet(snippet: SnippetAccessMetadata): void {
    this.snippetAccess.set(snippet.id, {
      ...snippet,
      exists: snippet.exists ?? true,
      collaboratorWallets: snippet.collaboratorWallets
        ? [...snippet.collaboratorWallets]
        : [],
    });
  }

  public markSnippetMissing(snippetId: string): void {
    this.snippetAccess.set(snippetId, {
      id: snippetId,
      ownerWalletAddress: "",
      exists: false,
    });
  }

  public clearAll(): void {
    this.docsBySnippetId.clear();
    this.snippetAccess.clear();
    this.auditLogs = [];
    this.snippetWriteLocks.clear();
  }

  private async runWithSnippetLock<T>(
    snippetId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.snippetWriteLocks.get(snippetId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.snippetWriteLocks.set(
      snippetId,
      next.catch(() => undefined),
    );
    return next;
  }

  private async ensureSnippetExists(
    snippetId: string,
  ): Promise<SnippetAccessMetadata | null> {
    if (!snippetId || !snippetId.trim()) {
      throw new DocumentationValidationError("A valid snippetId is required.");
    }
    const cleanId = snippetId.trim();
    const localMeta = this.snippetAccess.get(cleanId);
    if (localMeta) {
      if (localMeta.exists === false) {
        throw new DocumentationNotFoundError(
          `Snippet "${cleanId}" was not found.`,
        );
      }
      return localMeta;
    }
    if (this.accessResolver) {
      const resolved = await this.accessResolver.resolveSnippet(cleanId);
      if (!resolved || resolved.exists === false) {
        throw new DocumentationNotFoundError(
          `Snippet "${cleanId}" was not found.`,
        );
      }
      return resolved;
    }
    return null;
  }

  private async enforceReadAuthorization(
    snippetId: string,
    meta: SnippetAccessMetadata | null,
    viewerWallet?: string | null,
  ): Promise<void> {
    if (!meta || !meta.visibility || meta.visibility === "public") {
      return;
    }
    const normalizedViewer =
      viewerWallet && isValidDocumentationWallet(viewerWallet)
        ? viewerWallet.trim().toUpperCase()
        : null;
    const ownerUpper = meta.ownerWalletAddress.trim().toUpperCase();
    if (normalizedViewer && (!ownerUpper || normalizedViewer === ownerUpper)) {
      return;
    }
    if (meta.visibility === "private") {
      if (!normalizedViewer) {
        throw new DocumentationAuthError(
          "Authentication required to view private snippet documentation.",
          401,
        );
      }
      throw new DocumentationAuthError(
        "Forbidden: This snippet is private.",
        403,
      );
    }
    if (meta.visibility === "shared") {
      if (!normalizedViewer) {
        throw new DocumentationAuthError(
          "Authentication required to view shared snippet documentation.",
          401,
        );
      }
      const inStaticCollabs = (meta.collaboratorWallets ?? []).some(
        (w) => w.trim().toUpperCase() === normalizedViewer,
      );
      const canViewViaResolver = this.accessResolver?.canViewSnippet
        ? await this.accessResolver.canViewSnippet(snippetId, normalizedViewer)
        : false;
      if (!inStaticCollabs && !canViewViaResolver) {
        throw new DocumentationAuthError(
          "Forbidden: You do not have access to this shared snippet.",
          403,
        );
      }
    }
  }

  private async enforceWriteAuthorization(
    snippetId: string,
    actorWallet?: string | null,
  ): Promise<string> {
    if (!actorWallet || !isValidDocumentationWallet(actorWallet)) {
      throw new DocumentationAuthError(
        "Authentication required: Provide a valid Stellar wallet to manage snippet documentation.",
        401,
      );
    }

    const normalizedActor = actorWallet.trim().toUpperCase();
    const meta = await this.ensureSnippetExists(snippetId);

    if (meta) {
      const ownerUpper = meta.ownerWalletAddress.trim().toUpperCase();
      const isOwner = !ownerUpper || ownerUpper === normalizedActor;
      const isCollab = (meta.collaboratorWallets ?? []).some(
        (w) => w.trim().toUpperCase() === normalizedActor,
      );
      const hasExternalEdit =
        !isOwner && !isCollab && this.accessResolver?.canEditSnippet
          ? await this.accessResolver.canEditSnippet(snippetId, normalizedActor)
          : false;
      if (!isOwner && !isCollab && !hasExternalEdit) {
        await this.recordAudit({
          snippetId,
          documentationId: this.docsBySnippetId.get(snippetId)?.id ?? null,
          actorWallet: normalizedActor,
          action: "documentation.unauthorized",
          metadata: { reason: "Wallet is neither owner nor collaborator." },
        });
        throw new DocumentationAuthError(
          "Forbidden: Only the snippet owner or authorized collaborators can modify documentation.",
          403,
        );
      }
    } else {
      // Standalone in-memory fallback when no repository resolver is configured
      this.snippetAccess.set(snippetId, {
        id: snippetId,
        ownerWalletAddress: normalizedActor,
        collaboratorWallets: [],
        exists: true,
      });
    }

    return normalizedActor;
  }

  /**
   * Create documentation for a snippet.
   */
  public async createDocumentation(
    snippetId: string,
    input: unknown,
    actorWallet?: string | null,
  ): Promise<SnippetDocumentationResponse> {
    const cleanSnippetId = snippetId?.trim();
    return this.runWithSnippetLock(cleanSnippetId, async () => {
      const authorizedWallet = await this.enforceWriteAuthorization(
        cleanSnippetId,
        actorWallet,
      );
      const validated = validateDocumentationInput(input);
      const now = new Date().toISOString();
      const existing = this.docsBySnippetId.get(cleanSnippetId);

      const record: SnippetDocumentationRecord = {
        id:
          existing?.id ??
          `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        snippetId: cleanSnippetId,
        overview: validated.overview,
        ...(validated.usageInstructions
          ? { usageInstructions: validated.usageInstructions }
          : {}),
        prerequisites: validated.prerequisites,
        setupSteps: validated.setupSteps,
        inputExample: validated.inputExample,
        outputExample: validated.outputExample,
        notes: validated.notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        updatedBy: authorizedWallet,
      };

      this.docsBySnippetId.set(cleanSnippetId, record);

      await this.recordAudit({
        snippetId: cleanSnippetId,
        documentationId: record.id,
        actorWallet: authorizedWallet,
        action: existing ? "documentation.updated" : "documentation.created",
      });

      return {
        snippetId: cleanSnippetId,
        documentation: { ...record },
        empty: false,
      };
    });
  }

  /**
   * Update existing documentation (or upsert) for a snippet transactionally.
   */
  public async updateDocumentation(
    snippetId: string,
    input: unknown,
    actorWallet?: string | null,
  ): Promise<SnippetDocumentationResponse> {
    const cleanSnippetId = snippetId?.trim();
    return this.runWithSnippetLock(cleanSnippetId, async () => {
      const authorizedWallet = await this.enforceWriteAuthorization(
        cleanSnippetId,
        actorWallet,
      );
      const validated = validateDocumentationInput(input);
      const now = new Date().toISOString();
      const existing = this.docsBySnippetId.get(cleanSnippetId);

      const record: SnippetDocumentationRecord = {
        id:
          existing?.id ??
          `doc_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        snippetId: cleanSnippetId,
        overview: validated.overview,
        ...(validated.usageInstructions
          ? { usageInstructions: validated.usageInstructions }
          : {}),
        prerequisites: validated.prerequisites,
        setupSteps: validated.setupSteps,
        inputExample: validated.inputExample,
        outputExample: validated.outputExample,
        notes: validated.notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        updatedBy: authorizedWallet,
      };

      this.docsBySnippetId.set(cleanSnippetId, record);

      await this.recordAudit({
        snippetId: cleanSnippetId,
        documentationId: record.id,
        actorWallet: authorizedWallet,
        action: existing ? "documentation.updated" : "documentation.created",
      });

      return {
        snippetId: cleanSnippetId,
        documentation: { ...record },
        empty: false,
      };
    });
  }

  /**
   * Retrieve documentation for a snippet. Returns an empty-state response if none exists.
   */
  public async getDocumentation(
    snippetId: string,
    viewerWallet?: string | null,
  ): Promise<SnippetDocumentationResponse> {
    const cleanSnippetId = snippetId?.trim();
    const meta = await this.ensureSnippetExists(cleanSnippetId);
    await this.enforceReadAuthorization(cleanSnippetId, meta, viewerWallet);

    const record = this.docsBySnippetId.get(cleanSnippetId);
    if (!record) {
      return {
        snippetId: cleanSnippetId,
        documentation: null,
        empty: true,
      };
    }

    return {
      snippetId: cleanSnippetId,
      documentation: {
        ...record,
        prerequisites: [...record.prerequisites],
        setupSteps: [...record.setupSteps],
      },
      empty: false,
    };
  }

  /**
   * Delete documentation for a snippet (authorized owners/collaborators only).
   */
  public async deleteDocumentation(
    snippetId: string,
    actorWallet?: string | null,
  ): Promise<SnippetDocumentationResponse> {
    const cleanSnippetId = snippetId?.trim();
    return this.runWithSnippetLock(cleanSnippetId, async () => {
      const authorizedWallet = await this.enforceWriteAuthorization(
        cleanSnippetId,
        actorWallet,
      );
      const existing = this.docsBySnippetId.get(cleanSnippetId);
      this.docsBySnippetId.delete(cleanSnippetId);

      await this.recordAudit({
        snippetId: cleanSnippetId,
        documentationId: existing?.id ?? null,
        actorWallet: authorizedWallet,
        action: "documentation.deleted",
      });

      return {
        snippetId: cleanSnippetId,
        documentation: null,
        empty: true,
      };
    });
  }

  /**
   * Synchronously read stored documentation when snippet existence and read
   * visibility have already been verified by an upstream route handler.
   */
  public getStoredDocumentation(
    snippetId: string,
  ): SnippetDocumentationRecord | null {
    const cleanSnippetId = snippetId?.trim();
    if (!cleanSnippetId) return null;
    const record = this.docsBySnippetId.get(cleanSnippetId);
    if (!record) return null;
    return {
      ...record,
      prerequisites: [...record.prerequisites],
      setupSteps: [...record.setupSteps],
    };
  }

  /**
   * Helper to enrich a snippet object with its associated documentation for snippet retrieval APIs.
   */
  public async attachDocumentationToSnippet<T extends { id: string }>(
    snippet: T,
    options?: { viewerWallet?: string | null; skipAccessCheck?: boolean },
  ): Promise<T & { documentation: SnippetDocumentationRecord | null }> {
    if (options?.skipAccessCheck) {
      return {
        ...snippet,
        documentation: this.getStoredDocumentation(snippet.id),
      };
    }
    const { documentation } = await this.getDocumentation(
      snippet.id,
      options?.viewerWallet,
    );
    return {
      ...snippet,
      documentation,
    };
  }

  public getAuditLogs(snippetId?: string): DocumentationAuditEntry[] {
    return this.auditLogs
      .filter((entry) => !snippetId || entry.snippetId === snippetId)
      .map((entry) => ({ ...entry }));
  }

  private async recordAudit(
    entry: Omit<DocumentationAuditEntry, "id" | "timestamp">,
  ): Promise<void> {
    this.auditLogs.push({
      ...entry,
      id: `doc_audit_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
    });

    try {
      await appendActivityLog("snippet.updated", "snippet", {
        actorWallet: entry.actorWallet,
        resourceId: entry.snippetId,
        metadata: {
          field: "documentation",
          documentationId: entry.documentationId,
          action: entry.action,
          ...(entry.metadata ?? {}),
        },
      });
    } catch {
      // Non-blocking audit log
    }
  }
}

export const snippetDocumentationService = new SnippetDocumentationService();
