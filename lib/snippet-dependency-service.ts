import crypto from "crypto";
import { logEvent } from "@/lib/audit";

export const SUPPORTED_ECOSYSTEMS = [
  "npm",
  "pip",
  "Cargo",
  "Maven",
  "NuGet",
  "Composer",
  "Other",
] as const;

export type DependencyEcosystem = (typeof SUPPORTED_ECOSYSTEMS)[number];

export const ALLOWED_CONFIGURATION_KEYS = [
  "peerDependency",
  "required",
  "optional",
  "devDependency",
  "minRuntimeVersion",
  "registryUrl",
  "notes",
] as const;

export const MAX_DEPENDENCY_NAME_LENGTH = 214;
export const MAX_VERSION_LENGTH = 64;
export const MAX_CONFIG_PAYLOAD_BYTES = 2048;
export const MAX_CONFIG_NOTES_LENGTH = 500;

export interface DependencyConfiguration {
  peerDependency?: boolean;
  required?: boolean;
  optional?: boolean;
  devDependency?: boolean;
  minRuntimeVersion?: string;
  registryUrl?: string;
  notes?: string;
}

export interface SnippetDependency {
  id: string;
  snippetId: string;
  name: string;
  version: string;
  ecosystem: DependencyEcosystem;
  configuration: DependencyConfiguration;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDependencyInput {
  name: string;
  version: string;
  ecosystem?: DependencyEcosystem | string;
  configuration?: Record<string, unknown>;
}

export interface UpdateDependencyInput {
  name?: string;
  version?: string;
  ecosystem?: DependencyEcosystem | string;
  configuration?: Record<string, unknown>;
}

export interface RegisteredSnippetRef {
  id: string;
  ownerWallet: string;
  editors?: string[];
  visibility?: "public" | "private" | "shared";
}

export interface DependencyAuditEntry {
  id: string;
  dependencyId: string | null;
  snippetId: string;
  action: "created" | "updated" | "deleted" | "cascade_deleted";
  actorWallet: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export type DependencyErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT";

export class DependencyServiceError extends Error {
  public readonly code: DependencyErrorCode;
  public readonly status: number;
  public readonly fields?: Record<string, string>;

  constructor(
    code: DependencyErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DependencyServiceError";
    this.code = code;
    this.fields = fields;
    switch (code) {
      case "VALIDATION_ERROR":
        this.status = 400;
        break;
      case "UNAUTHORIZED":
        this.status = 401;
        break;
      case "FORBIDDEN":
        this.status = 403;
        break;
      case "NOT_FOUND":
        this.status = 404;
        break;
      case "CONFLICT":
        this.status = 409;
        break;
    }
  }
}

const PACKAGE_NAME_REGEX =
  /^(@[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+|[a-zA-Z0-9][a-zA-Z0-9._:/-]*)$/;

const VERSION_FORMAT_REGEX =
  /^(latest|\*|v?\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?|(\^|~|>=|<=|>|<|=)\s*v?\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?|\d+\.x|\d+\.\d+\.x)$/;

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function validateDependencyName(rawName: unknown): {
  valid: boolean;
  value?: string;
  error?: string;
} {
  if (typeof rawName !== "string") {
    return { valid: false, error: "Dependency name is required and must be a string." };
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { valid: false, error: "Dependency name must not be empty." };
  }
  if (trimmed.length > MAX_DEPENDENCY_NAME_LENGTH) {
    return {
      valid: false,
      error: `Dependency name must not exceed ${MAX_DEPENDENCY_NAME_LENGTH} characters.`,
    };
  }
  if (hasControlCharacters(trimmed) || trimmed.includes("..") || trimmed.includes("//")) {
    return { valid: false, error: "Dependency name contains invalid characters or path traversal." };
  }
  if (!PACKAGE_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error:
        "Dependency name must conform to package naming rules (letters, numbers, '@scope/pkg', '.', '_', '-', ':').",
    };
  }
  return { valid: true, value: trimmed };
}

export function validateDependencyVersion(rawVersion: unknown): {
  valid: boolean;
  value?: string;
  error?: string;
} {
  if (typeof rawVersion !== "string") {
    return { valid: false, error: "Dependency version is required and must be a string." };
  }
  const trimmed = rawVersion.trim();
  if (!trimmed) {
    return { valid: false, error: "Dependency version must not be empty." };
  }
  if (trimmed.length > MAX_VERSION_LENGTH) {
    return {
      valid: false,
      error: `Dependency version must not exceed ${MAX_VERSION_LENGTH} characters.`,
    };
  }
  if (hasControlCharacters(trimmed) || !VERSION_FORMAT_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "Dependency version must follow a valid version or semver format (e.g. 18.3.1, ^1.2.0).",
    };
  }
  return { valid: true, value: trimmed };
}

export function validateDependencyEcosystem(rawEcosystem: unknown): {
  valid: boolean;
  value?: DependencyEcosystem;
  error?: string;
} {
  if (rawEcosystem === undefined || rawEcosystem === null) {
    return { valid: true, value: "npm" };
  }
  if (typeof rawEcosystem !== "string") {
    return { valid: false, error: "Ecosystem must be a string." };
  }
  const trimmed = rawEcosystem.trim();
  if (!SUPPORTED_ECOSYSTEMS.includes(trimmed as DependencyEcosystem)) {
    return {
      valid: false,
      error: `Unsupported ecosystem "${trimmed}". Supported values: ${SUPPORTED_ECOSYSTEMS.join(", ")}.`,
    };
  }
  return { valid: true, value: trimmed as DependencyEcosystem };
}

export function validateDependencyConfiguration(rawConfig: unknown): {
  valid: boolean;
  value?: DependencyConfiguration;
  error?: string;
} {
  if (rawConfig === undefined) {
    return { valid: true, value: {} };
  }
  if (rawConfig === null || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return {
      valid: false,
      error: "Configuration must be a valid JSON object.",
    };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(rawConfig);
  } catch {
    return { valid: false, error: "Configuration must be serializable JSON." };
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_CONFIG_PAYLOAD_BYTES) {
    return {
      valid: false,
      error: `Configuration payload exceeds maximum size of ${MAX_CONFIG_PAYLOAD_BYTES} bytes.`,
    };
  }

  const record = rawConfig as Record<string, unknown>;
  const allowedSet = new Set<string>(ALLOWED_CONFIGURATION_KEYS);
  const sanitized: DependencyConfiguration = {};

  for (const [key, val] of Object.entries(record)) {
    if (!allowedSet.has(key)) {
      return {
        valid: false,
        error: `Unsupported configuration property "${key}".`,
      };
    }
    if (val === undefined) continue;

    if (
      key === "peerDependency" ||
      key === "required" ||
      key === "optional" ||
      key === "devDependency"
    ) {
      if (typeof val !== "boolean") {
        return {
          valid: false,
          error: `Configuration property "${key}" must be a boolean.`,
        };
      }
      sanitized[key] = val;
    } else if (key === "minRuntimeVersion") {
      if (typeof val !== "string" || val.trim().length === 0 || val.length > MAX_VERSION_LENGTH || hasControlCharacters(val)) {
        return {
          valid: false,
          error: "Configuration property \"minRuntimeVersion\" must be a non-empty version string.",
        };
      }
      sanitized.minRuntimeVersion = val.trim();
    } else if (key === "registryUrl") {
      if (typeof val !== "string" || val.length > 256) {
        return {
          valid: false,
          error: "Configuration property \"registryUrl\" must be a valid URL string under 256 characters.",
        };
      }
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return {
            valid: false,
            error: "Configuration property \"registryUrl\" must use http or https protocol.",
          };
        }
        sanitized.registryUrl = parsed.toString();
      } catch {
        return {
          valid: false,
          error: "Configuration property \"registryUrl\" must be a valid URL.",
        };
      }
    } else if (key === "notes") {
      if (typeof val !== "string" || val.length > MAX_CONFIG_NOTES_LENGTH || hasControlCharacters(val)) {
        return {
          valid: false,
          error: `Configuration property "notes" must be a valid string up to ${MAX_CONFIG_NOTES_LENGTH} characters.`,
        };
      }
      sanitized.notes = val.trim();
    }
  }

  return { valid: true, value: sanitized };
}

export class SnippetDependencyService {
  private dependenciesById = new Map<string, SnippetDependency>();
  private dependencyIdsBySnippet = new Map<string, Set<string>>();
  private snippets = new Map<string, RegisteredSnippetRef>();
  private auditLogs: DependencyAuditEntry[] = [];

  registerSnippet(snippet: RegisteredSnippetRef): void {
    this.snippets.set(snippet.id, {
      ...snippet,
      editors: snippet.editors ? [...snippet.editors] : [],
      visibility: snippet.visibility ?? "public",
    });
  }

  hasSnippet(snippetId: string): boolean {
    return this.snippets.has(snippetId);
  }

  getSnippetRef(snippetId: string): RegisteredSnippetRef | null {
    return this.snippets.get(snippetId) ?? null;
  }

  private assertCanModify(snippet: RegisteredSnippetRef, callerWallet?: string | null): string {
    const wallet = callerWallet?.trim();
    if (!wallet) {
      throw new DependencyServiceError(
        "UNAUTHORIZED",
        "Authentication is required to modify snippet dependencies.",
      );
    }
    const isOwner = snippet.ownerWallet === wallet;
    const isEditor = snippet.editors?.includes(wallet) ?? false;
    if (!isOwner && !isEditor) {
      throw new DependencyServiceError(
        "FORBIDDEN",
        "Only the snippet owner or an authorized editor can modify dependency metadata.",
      );
    }
    return wallet;
  }

  async createDependency(
    snippetId: string,
    input: CreateDependencyInput,
    callerWallet?: string | null,
  ): Promise<SnippetDependency> {
    const cleanSnippetId = (snippetId || "").trim();
    if (!cleanSnippetId) {
      throw new DependencyServiceError("VALIDATION_ERROR", "Snippet ID is required.", {
        snippetId: "Snippet ID is required.",
      });
    }

    const snippet = this.snippets.get(cleanSnippetId);
    if (!snippet) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Snippet "${cleanSnippetId}" not found.`,
      );
    }

    const actor = this.assertCanModify(snippet, callerWallet);

    const fieldErrors: Record<string, string> = {};
    const nameResult = validateDependencyName(input?.name);
    if (!nameResult.valid) fieldErrors.name = nameResult.error!;

    const versionResult = validateDependencyVersion(input?.version);
    if (!versionResult.valid) fieldErrors.version = versionResult.error!;

    const ecosystemResult = validateDependencyEcosystem(input?.ecosystem);
    if (!ecosystemResult.valid) fieldErrors.ecosystem = ecosystemResult.error!;

    const configResult = validateDependencyConfiguration(input?.configuration);
    if (!configResult.valid) fieldErrors.configuration = configResult.error!;

    if (Object.keys(fieldErrors).length > 0) {
      throw new DependencyServiceError(
        "VALIDATION_ERROR",
        Object.values(fieldErrors)[0],
        fieldErrors,
      );
    }

    const existingForSnippet = this.getDependenciesForSnippetInternal(cleanSnippetId);
    const duplicate = existingForSnippet.find(
      (dep) =>
        dep.ecosystem.toLowerCase() === ecosystemResult.value!.toLowerCase() &&
        dep.name.toLowerCase() === nameResult.value!.toLowerCase(),
    );
    if (duplicate) {
      throw new DependencyServiceError(
        "CONFLICT",
        `Dependency "${nameResult.value}" (${ecosystemResult.value}) already exists for this snippet.`,
      );
    }

    const now = new Date().toISOString();
    const record: SnippetDependency = {
      id: `dep_${crypto.randomUUID()}`,
      snippetId: cleanSnippetId,
      name: nameResult.value!,
      version: versionResult.value!,
      ecosystem: ecosystemResult.value!,
      configuration: configResult.value!,
      createdAt: now,
      updatedAt: now,
    };

    this.dependenciesById.set(record.id, record);
    const set = this.dependencyIdsBySnippet.get(cleanSnippetId) ?? new Set<string>();
    set.add(record.id);
    this.dependencyIdsBySnippet.set(cleanSnippetId, set);

    this.recordAudit(record.id, cleanSnippetId, "created", actor, {
      name: record.name,
      version: record.version,
      ecosystem: record.ecosystem,
    });

    return this.cloneDependency(record);
  }

  async listDependencies(snippetId: string): Promise<SnippetDependency[]> {
    const cleanSnippetId = (snippetId || "").trim();
    if (!cleanSnippetId || !this.snippets.has(cleanSnippetId)) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Snippet "${cleanSnippetId}" not found.`,
      );
    }
    return this.getDependenciesForSnippetInternal(cleanSnippetId).map((d) =>
      this.cloneDependency(d),
    );
  }

  async getDependencyById(dependencyId: string): Promise<SnippetDependency | null> {
    const dep = this.dependenciesById.get((dependencyId || "").trim());
    return dep ? this.cloneDependency(dep) : null;
  }

  async updateDependency(
    dependencyId: string,
    input: UpdateDependencyInput,
    callerWallet?: string | null,
  ): Promise<SnippetDependency> {
    const cleanDepId = (dependencyId || "").trim();
    const existing = this.dependenciesById.get(cleanDepId);
    if (!existing) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Dependency "${cleanDepId}" not found.`,
      );
    }

    const snippet = this.snippets.get(existing.snippetId);
    if (!snippet) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Associated snippet "${existing.snippetId}" not found.`,
      );
    }

    const actor = this.assertCanModify(snippet, callerWallet);

    const fieldErrors: Record<string, string> = {};
    let nextName = existing.name;
    let nextVersion = existing.version;
    let nextEcosystem = existing.ecosystem;
    let nextConfiguration = existing.configuration;

    if (input.name !== undefined) {
      const res = validateDependencyName(input.name);
      if (!res.valid) fieldErrors.name = res.error!;
      else nextName = res.value!;
    }

    if (input.version !== undefined) {
      const res = validateDependencyVersion(input.version);
      if (!res.valid) fieldErrors.version = res.error!;
      else nextVersion = res.value!;
    }

    if (input.ecosystem !== undefined) {
      const res = validateDependencyEcosystem(input.ecosystem);
      if (!res.valid) fieldErrors.ecosystem = res.error!;
      else nextEcosystem = res.value!;
    }

    if (input.configuration !== undefined) {
      const res = validateDependencyConfiguration(input.configuration);
      if (!res.valid) fieldErrors.configuration = res.error!;
      else nextConfiguration = res.value!;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new DependencyServiceError(
        "VALIDATION_ERROR",
        Object.values(fieldErrors)[0],
        fieldErrors,
      );
    }

    const siblings = this.getDependenciesForSnippetInternal(existing.snippetId);
    const duplicate = siblings.find(
      (dep) =>
        dep.id !== existing.id &&
        dep.ecosystem.toLowerCase() === nextEcosystem.toLowerCase() &&
        dep.name.toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      throw new DependencyServiceError(
        "CONFLICT",
        `Dependency "${nextName}" (${nextEcosystem}) already exists for this snippet.`,
      );
    }

    const updated: SnippetDependency = {
      ...existing,
      name: nextName,
      version: nextVersion,
      ecosystem: nextEcosystem,
      configuration: { ...nextConfiguration },
      updatedAt: new Date().toISOString(),
    };

    this.dependenciesById.set(updated.id, updated);

    this.recordAudit(updated.id, updated.snippetId, "updated", actor, {
      name: updated.name,
      version: updated.version,
      ecosystem: updated.ecosystem,
    });

    return this.cloneDependency(updated);
  }

  async deleteDependency(
    dependencyId: string,
    callerWallet?: string | null,
  ): Promise<{ deleted: true; id: string; snippetId: string }> {
    const cleanDepId = (dependencyId || "").trim();
    const existing = this.dependenciesById.get(cleanDepId);
    if (!existing) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Dependency "${cleanDepId}" not found.`,
      );
    }

    const snippet = this.snippets.get(existing.snippetId);
    if (!snippet) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Associated snippet "${existing.snippetId}" not found.`,
      );
    }

    const actor = this.assertCanModify(snippet, callerWallet);

    this.dependenciesById.delete(cleanDepId);
    const set = this.dependencyIdsBySnippet.get(existing.snippetId);
    if (set) {
      set.delete(cleanDepId);
      if (set.size === 0) {
        this.dependencyIdsBySnippet.delete(existing.snippetId);
      }
    }

    this.recordAudit(cleanDepId, existing.snippetId, "deleted", actor, {
      name: existing.name,
      version: existing.version,
    });

    return { deleted: true, id: cleanDepId, snippetId: existing.snippetId };
  }

  /**
   * Cascade delete all dependencies when a snippet is deleted,
   * preventing orphaned dependency records.
   */
  async deleteSnippetWithCascade(
    snippetId: string,
    callerWallet?: string | null,
  ): Promise<{ snippetId: string; deletedDependenciesCount: number }> {
    const cleanSnippetId = (snippetId || "").trim();
    const snippet = this.snippets.get(cleanSnippetId);
    if (!snippet) {
      throw new DependencyServiceError(
        "NOT_FOUND",
        `Snippet "${cleanSnippetId}" not found.`,
      );
    }

    const actor = this.assertCanModify(snippet, callerWallet);
    const depIds = [...(this.dependencyIdsBySnippet.get(cleanSnippetId) ?? [])];
    for (const depId of depIds) {
      this.dependenciesById.delete(depId);
    }
    this.dependencyIdsBySnippet.delete(cleanSnippetId);
    this.snippets.delete(cleanSnippetId);

    this.recordAudit(null, cleanSnippetId, "cascade_deleted", actor, {
      deletedDependenciesCount: depIds.length,
    });

    return { snippetId: cleanSnippetId, deletedDependenciesCount: depIds.length };
  }

  /**
   * Enriches a snippet response object with its associated dependency records.
   */
  async attachDependenciesToSnippet<T extends { id: string }>(
    snippet: T,
  ): Promise<T & { dependencies: SnippetDependency[] }> {
    const deps = this.getDependenciesForSnippetInternal(snippet.id).map((d) =>
      this.cloneDependency(d),
    );
    return {
      ...snippet,
      dependencies: deps,
    };
  }

  getAuditLog(snippetId?: string): DependencyAuditEntry[] {
    const list = snippetId
      ? this.auditLogs.filter((entry) => entry.snippetId === snippetId)
      : this.auditLogs;
    return list.map((entry) => ({ ...entry, details: { ...entry.details } }));
  }

  clear(): void {
    this.dependenciesById.clear();
    this.dependencyIdsBySnippet.clear();
    this.snippets.clear();
    this.auditLogs = [];
  }

  private getDependenciesForSnippetInternal(snippetId: string): SnippetDependency[] {
    const ids = this.dependencyIdsBySnippet.get(snippetId);
    if (!ids) return [];
    const result: SnippetDependency[] = [];
    for (const id of ids) {
      const dep = this.dependenciesById.get(id);
      if (dep) result.push(dep);
    }
    return result;
  }

  private cloneDependency(dep: SnippetDependency): SnippetDependency {
    return {
      ...dep,
      configuration: { ...dep.configuration },
    };
  }

  private recordAudit(
    dependencyId: string | null,
    snippetId: string,
    action: DependencyAuditEntry["action"],
    actorWallet: string,
    details: Record<string, unknown>,
  ): void {
    const entry: DependencyAuditEntry = {
      id: `dep_aud_${crypto.randomUUID()}`,
      dependencyId,
      snippetId,
      action,
      actorWallet,
      timestamp: new Date().toISOString(),
      details,
    };
    this.auditLogs.push(entry);
    void logEvent(
      `snippet_dependency.${action}`,
      actorWallet,
      snippetId,
      JSON.stringify({ dependencyId, ...details }),
    );
  }
}

export const snippetDependencyService = new SnippetDependencyService();
