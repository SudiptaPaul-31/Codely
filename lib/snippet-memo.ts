import crypto from "crypto";

/**
 * Snippet memo references.
 *
 * Stellar `memo_text` payloads are capped at 28 bytes. Every reference built
 * here stays within that limit and is validated before it is submitted:
 * an over-long memo throws instead of being silently truncated.
 */

/** Hard limit imposed by Stellar for `MEMO_TEXT` payloads. */
export const STELLAR_MEMO_TEXT_MAX_BYTES = 28;

/** Prefix that marks a transaction memo as a snippet reference. */
export const SNIPPET_MEMO_PREFIX = "snip:";

/** Prefix used when one transaction anchors several snippets (batch). */
export const SNIPPET_BATCH_MEMO_PREFIX = "snipb:";

const SNIPPET_MEMO_ID_LENGTH = 12;
const SNIPPET_MEMO_HASH_LENGTH = 8;

export class SnippetMemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnippetMemoError";
  }
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SnippetMemoError(`${label} is required to build a snippet memo reference`);
  }
  return value.trim();
}

/**
 * Deterministic, collision-resistant reference for a snippet: `snip:<12 hex>`
 * (17 bytes). Deriving it from the snippet id keeps one reference per snippet,
 * so two snippets can never share the same memo identifier.
 */
export function generateSnippetMemoRef(snippetId: string): string {
  const id = requireNonEmpty(snippetId, "snippetId");
  const digest = crypto.createHash("sha256").update(id).digest("hex");
  return `${SNIPPET_MEMO_PREFIX}${digest.slice(0, SNIPPET_MEMO_ID_LENGTH)}`;
}

/** Reference shared by every snippet anchored in a single batch transaction. */
export function generateBatchSnippetMemoRef(batchHash: string): string {
  const hash = requireNonEmpty(batchHash, "batchHash");
  return `${SNIPPET_BATCH_MEMO_PREFIX}${hash.slice(0, SNIPPET_MEMO_ID_LENGTH)}`;
}

/**
 * Enforce Stellar's 28-byte `memo_text` limit.
 *
 * Throws (never truncates) so a memo can not silently change meaning between
 * the database and the ledger.
 */
export function assertMemoWithinStellarLimit(memo: string): string {
  if (typeof memo !== "string" || memo.length === 0) {
    throw new SnippetMemoError("Stellar memo must be a non-empty string");
  }

  const bytes = Buffer.byteLength(memo, "utf8");
  if (bytes > STELLAR_MEMO_TEXT_MAX_BYTES) {
    throw new SnippetMemoError(
      `Stellar memo_text is limited to ${STELLAR_MEMO_TEXT_MAX_BYTES} bytes, got ${bytes} for "${memo}"`,
    );
  }

  return memo;
}

/**
 * Memo for a snippet transaction: `snip:<ref>` or `snip:<ref>:<hash8>`
 * (at most 26 bytes). The optional hash suffix keeps the anchored-content hint
 * the previous `s:<id8>:<hash8>` format carried.
 */
export function buildSnippetMemo(snippetId: string, contentHash?: string): string {
  const ref = generateSnippetMemoRef(snippetId);
  const memo = contentHash
    ? `${ref}:${contentHash.slice(0, SNIPPET_MEMO_HASH_LENGTH)}`
    : ref;

  return assertMemoWithinStellarLimit(memo);
}

/** Memo for a batch transaction: `snipb:<12 hex>` (18 bytes). */
export function buildBatchSnippetMemo(batchHash: string): string {
  return assertMemoWithinStellarLimit(generateBatchSnippetMemoRef(batchHash));
}

/** Returns the canonical snippet reference carried by a memo, or null. */
export function parseSnippetMemo(memo?: string | null): string | null {
  if (typeof memo !== "string" || !memo.startsWith(SNIPPET_MEMO_PREFIX)) {
    return null;
  }

  const [id] = memo.slice(SNIPPET_MEMO_PREFIX.length).split(":");
  if (!id || !new RegExp(`^[0-9a-f]{${SNIPPET_MEMO_ID_LENGTH}}$`).test(id)) {
    return null;
  }

  return `${SNIPPET_MEMO_PREFIX}${id}`;
}

/** Returns the canonical batch reference carried by a memo, or null. */
export function parseBatchSnippetMemo(memo?: string | null): string | null {
  if (typeof memo !== "string" || !memo.startsWith(SNIPPET_BATCH_MEMO_PREFIX)) {
    return null;
  }

  const id = memo.slice(SNIPPET_BATCH_MEMO_PREFIX.length).split(":")[0];
  if (!id || !new RegExp(`^[0-9a-f]{${SNIPPET_MEMO_ID_LENGTH}}$`).test(id)) {
    return null;
  }

  return `${SNIPPET_BATCH_MEMO_PREFIX}${id}`;
}

/**
 * Validate a reference before it is persisted, rejecting malformed or
 * over-long values instead of storing an association the chain would refuse.
 */
export function assertSnippetMemoRef(reference: string): string {
  if (!parseSnippetMemo(reference) && !parseBatchSnippetMemo(reference)) {
    throw new SnippetMemoError(
      `"${reference}" is not a valid snippet memo reference (expected "${SNIPPET_MEMO_PREFIX}<12 hex>" or "${SNIPPET_BATCH_MEMO_PREFIX}<12 hex>")`,
    );
  }

  return assertMemoWithinStellarLimit(reference);
}
