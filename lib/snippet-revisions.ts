/**
 * Snippet Revision Management
 *
 * Creates, lists, compares, and restores immutable snippet revisions.
 * Every meaningful update becomes a new sequential revision; restore
 * never erases history — it appends a new revision with the restored content.
 *
 * Persistence: in-memory store (tests / local) with optional Neon DB when
 * DATABASE_URL is set and the snippet_revisions table exists.
 */

import { buildSideBySideDiff, type DiffRow } from "@/lib/snippet-comparison";
import { logEvent } from "@/lib/audit";

export interface SnippetRevision {
  id: string;
  snippetId: string;
  versionNumber: number;
  content: string;
  editorId: string | null;
  createdAt: string;
  /** Optional metadata captured at revision time */
  title?: string | null;
  language?: string | null;
  changeSummary?: string | null;
}

export interface RevisionListItem {
  id: string;
  snippetId: string;
  versionNumber: number;
  editorId: string | null;
  createdAt: string;
  title?: string | null;
  language?: string | null;
  changeSummary?: string | null;
  contentPreview: string;
}

export interface RevisionCompareResult {
  snippetId: string;
  from: SnippetRevision;
  to: SnippetRevision;
  diff: DiffRow[];
  stats: {
    equal: number;
    changed: number;
    added: number;
    removed: number;
  };
}

export interface RevisionAuditEntry {
  id: string;
  snippetId: string;
  action: "create" | "compare" | "restore" | "list";
  actorId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CreateRevisionInput {
  content: string;
  editorId?: string | null;
  title?: string | null;
  language?: string | null;
  changeSummary?: string | null;
}

export interface RestoreRevisionResult {
  snippetId: string;
  restoredFrom: SnippetRevision;
  newRevision: SnippetRevision;
  /** Content that should become the snippet's current version */
  currentContent: string;
}

// ── In-memory stores (shared across module for process lifetime) ──────────────

const revisionsBySnippet = new Map<string, SnippetRevision[]>();
const auditLog: RevisionAuditEntry[] = [];
let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

function preview(content: string, max = 120): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

async function tryDb<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await fn();
  } catch (err) {
    console.warn("[snippet-revisions] DB unavailable, using memory:", (err as Error).message);
    return null;
  }
}

async function getSql() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL!);
}

function rowToRevision(row: Record<string, unknown>): SnippetRevision {
  return {
    id: String(row.id),
    snippetId: String(row.snippet_id),
    versionNumber: Number(row.version_number),
    content: String(row.content),
    editorId: (row.editor_id as string) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    title: (row.title as string) ?? null,
    language: (row.language as string) ?? null,
    changeSummary: (row.change_summary as string) ?? null,
  };
}

function recordAudit(
  snippetId: string,
  action: RevisionAuditEntry["action"],
  actorId: string | null,
  details: Record<string, unknown>,
): RevisionAuditEntry {
  const entry: RevisionAuditEntry = {
    id: nextId("aud"),
    snippetId,
    action,
    actorId,
    details,
    createdAt: new Date().toISOString(),
  };
  auditLog.push(entry);
  // Fire-and-forget external audit table when present
  void logEvent(
    `snippet_revision.${action}`,
    actorId || "system",
    snippetId,
    JSON.stringify(details),
  );
  return entry;
}

/** Reset in-memory state — for tests only */
export function __resetSnippetRevisionsForTests(): void {
  revisionsBySnippet.clear();
  auditLog.length = 0;
  idCounter = 0;
}

export function getRevisionAuditLog(snippetId?: string): RevisionAuditEntry[] {
  if (!snippetId) return [...auditLog];
  return auditLog.filter((e) => e.snippetId === snippetId);
}

/**
 * Create a new revision for a snippet. Version numbers increment sequentially
 * with no gaps or duplicates for a given snippetId.
 */
export async function createRevision(
  snippetId: string,
  input: CreateRevisionInput,
): Promise<SnippetRevision> {
  if (!snippetId?.trim()) {
    throw new Error("snippetId is required");
  }
  if (typeof input.content !== "string") {
    throw new Error("content is required");
  }

  const editorId = input.editorId ?? null;

  const fromDb = await tryDb(async () => {
    const sql = await getSql();
    const next = await sql`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM snippet_revisions
      WHERE snippet_id = ${snippetId}
    `;
    const versionNumber = Number(next[0]?.next_version ?? 1);
    const createdAt = new Date().toISOString();
    const result = await sql`
      INSERT INTO snippet_revisions
        (snippet_id, version_number, content, editor_id, created_at, title, language, change_summary)
      VALUES
        (${snippetId}, ${versionNumber}, ${input.content}, ${editorId}, ${createdAt},
         ${input.title ?? null}, ${input.language ?? null}, ${input.changeSummary ?? null})
      RETURNING *
    `;
    return rowToRevision(result[0] as Record<string, unknown>);
  });

  let revision: SnippetRevision;
  if (fromDb) {
    revision = fromDb;
    // Mirror into memory for consistent list/compare in same process
    const list = revisionsBySnippet.get(snippetId) ?? [];
    list.push(revision);
    revisionsBySnippet.set(snippetId, list);
  } else {
    const list = revisionsBySnippet.get(snippetId) ?? [];
    const versionNumber =
      list.length === 0
        ? 1
        : Math.max(...list.map((r) => r.versionNumber)) + 1;
    revision = {
      id: nextId("rev"),
      snippetId,
      versionNumber,
      content: input.content,
      editorId,
      createdAt: new Date().toISOString(),
      title: input.title ?? null,
      language: input.language ?? null,
      changeSummary: input.changeSummary ?? null,
    };
    list.push(revision);
    revisionsBySnippet.set(snippetId, list);
  }

  recordAudit(snippetId, "create", editorId, {
    revisionId: revision.id,
    versionNumber: revision.versionNumber,
    contentLength: revision.content.length,
  });

  return revision;
}

/**
 * List all revisions for a snippet (metadata + content preview).
 * Ordered by versionNumber ascending (sequential history).
 */
export async function listRevisions(
  snippetId: string,
  actorId: string | null = null,
): Promise<RevisionListItem[]> {
  if (!snippetId?.trim()) {
    throw new Error("snippetId is required");
  }

  const fromDb = await tryDb(async () => {
    const sql = await getSql();
    const rows = await sql`
      SELECT * FROM snippet_revisions
      WHERE snippet_id = ${snippetId}
      ORDER BY version_number ASC
    `;
    return (rows as Record<string, unknown>[]).map(rowToRevision);
  });

  const revisions =
    fromDb ??
    [...(revisionsBySnippet.get(snippetId) ?? [])].sort(
      (a, b) => a.versionNumber - b.versionNumber,
    );

  recordAudit(snippetId, "list", actorId, { count: revisions.length });

  return revisions.map((r) => ({
    id: r.id,
    snippetId: r.snippetId,
    versionNumber: r.versionNumber,
    editorId: r.editorId,
    createdAt: r.createdAt,
    title: r.title,
    language: r.language,
    changeSummary: r.changeSummary,
    contentPreview: preview(r.content),
  }));
}

export async function getRevisionById(
  snippetId: string,
  revId: string,
): Promise<SnippetRevision | null> {
  const fromDb = await tryDb(async () => {
    const sql = await getSql();
    const rows = await sql`
      SELECT * FROM snippet_revisions
      WHERE snippet_id = ${snippetId} AND id = ${revId}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return rowToRevision(rows[0] as Record<string, unknown>);
  });
  if (fromDb !== null) return fromDb;

  const list = revisionsBySnippet.get(snippetId) ?? [];
  return list.find((r) => r.id === revId) ?? null;
}

/**
 * Compare two revisions and return a highlighted line-level diff.
 */
export async function compareRevisions(
  snippetId: string,
  revId: string,
  revId2: string,
  actorId: string | null = null,
): Promise<RevisionCompareResult> {
  const [from, to] = await Promise.all([
    getRevisionById(snippetId, revId),
    getRevisionById(snippetId, revId2),
  ]);

  if (!from) {
    throw new Error(`Revision not found: ${revId}`);
  }
  if (!to) {
    throw new Error(`Revision not found: ${revId2}`);
  }

  const diff = buildSideBySideDiff(from.content, to.content);
  const stats = {
    equal: 0,
    changed: 0,
    added: 0,
    removed: 0,
  };
  for (const row of diff) {
    stats[row.kind] += 1;
  }

  recordAudit(snippetId, "compare", actorId, {
    fromRevisionId: revId,
    toRevisionId: revId2,
    fromVersion: from.versionNumber,
    toVersion: to.versionNumber,
    stats,
  });

  return { snippetId, from, to, diff, stats };
}

/**
 * Restore a previous revision: applies its content as the current version
 * by creating a NEW revision entry (history is preserved — no overwrite).
 */
export async function restoreRevision(
  snippetId: string,
  revId: string,
  editorId: string | null = null,
): Promise<RestoreRevisionResult> {
  const source = await getRevisionById(snippetId, revId);
  if (!source) {
    throw new Error(`Revision not found: ${revId}`);
  }

  const newRevision = await createRevision(snippetId, {
    content: source.content,
    editorId,
    title: source.title,
    language: source.language,
    changeSummary: `Restored from version ${source.versionNumber}`,
  });

  // createRevision already logged "create"; also log explicit restore
  recordAudit(snippetId, "restore", editorId, {
    restoredFromId: source.id,
    restoredFromVersion: source.versionNumber,
    newRevisionId: newRevision.id,
    newVersionNumber: newRevision.versionNumber,
  });

  return {
    snippetId,
    restoredFrom: source,
    newRevision,
    currentContent: newRevision.content,
  };
}

/**
 * Ensure sequential version numbers with no gaps/duplicates for a snippet.
 * Used by acceptance checks / tests.
 */
export function assertSequentialVersions(revisions: { versionNumber: number }[]): boolean {
  const nums = revisions.map((r) => r.versionNumber).sort((a, b) => a - b);
  if (nums.length === 0) return true;
  if (nums[0] !== 1) return false;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) return false;
  }
  return new Set(nums).size === nums.length;
}
