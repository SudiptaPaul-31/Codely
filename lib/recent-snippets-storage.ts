/**
 * Persist recently viewed snippets in localStorage so history survives reloads.
 */

export const RECENT_SNIPPETS_STORAGE_KEY = "codely_recent_snippets";
export const MAX_RECENT_SNIPPETS = 12;

export interface RecentSnippetEntry {
  id: string;
  title: string;
  language: string;
  description?: string;
  viewedAt: string; // ISO 8601
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function isValidEntry(value: unknown): value is RecentSnippetEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.title === "string" &&
    typeof entry.language === "string" &&
    typeof entry.viewedAt === "string"
  );
}

/** Read recent snippets from localStorage (most recent first). */
export function getRecentSnippets(): RecentSnippetEntry[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(RECENT_SNIPPETS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isValidEntry).slice(0, MAX_RECENT_SNIPPETS);
  } catch {
    return [];
  }
}

/**
 * Record (or bump) a snippet in recent history.
 * Dedupes by id and keeps the newest entry at the front.
 */
export function recordRecentSnippet(
  entry: Omit<RecentSnippetEntry, "viewedAt"> & { viewedAt?: string },
): RecentSnippetEntry[] {
  if (!isBrowser()) return [];

  const nextEntry: RecentSnippetEntry = {
    id: entry.id,
    title: entry.title,
    language: entry.language,
    description: entry.description,
    viewedAt: entry.viewedAt ?? new Date().toISOString(),
  };

  const existing = getRecentSnippets().filter((item) => item.id !== nextEntry.id);
  const next = [nextEntry, ...existing].slice(0, MAX_RECENT_SNIPPETS);

  try {
    localStorage.setItem(RECENT_SNIPPETS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore persistence failure
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("codely:recent-snippets-changed"));
  }

  return next;
}

/** Clear the entire recent snippets history. */
export function clearRecentSnippets(): void {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(RECENT_SNIPPETS_STORAGE_KEY);
  } catch {
    // ignore
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("codely:recent-snippets-changed"));
  }
}
