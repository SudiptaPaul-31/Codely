/**
 * @jest-environment node
 */

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true,
});

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: memoryStorage,
    dispatchEvent: () => true,
  },
  configurable: true,
});

import {
  RECENT_SNIPPETS_STORAGE_KEY,
  MAX_RECENT_SNIPPETS,
  clearRecentSnippets,
  getRecentSnippets,
  recordRecentSnippet,
} from "./recent-snippets-storage";

describe("recent-snippets-storage", () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(getRecentSnippets()).toEqual([]);
  });

  it("records a snippet and returns it as most recent", () => {
    const result = recordRecentSnippet({
      id: "a",
      title: "Alpha",
      language: "typescript",
      description: "desc",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "a",
      title: "Alpha",
      language: "typescript",
      description: "desc",
    });
    expect(result[0].viewedAt).toBeTruthy();
    expect(getRecentSnippets()).toEqual(result);
  });

  it("dedupes by id and moves the viewed snippet to the front", () => {
    recordRecentSnippet({ id: "a", title: "A", language: "js" });
    recordRecentSnippet({ id: "b", title: "B", language: "py" });
    recordRecentSnippet({ id: "a", title: "A updated", language: "js" });

    const recent = getRecentSnippets();
    expect(recent.map((s) => s.id)).toEqual(["a", "b"]);
    expect(recent[0].title).toBe("A updated");
  });

  it("caps history at MAX_RECENT_SNIPPETS", () => {
    for (let i = 0; i < MAX_RECENT_SNIPPETS + 5; i++) {
      recordRecentSnippet({
        id: `id-${i}`,
        title: `Snippet ${i}`,
        language: "javascript",
      });
    }

    const recent = getRecentSnippets();
    expect(recent).toHaveLength(MAX_RECENT_SNIPPETS);
    expect(recent[0].id).toBe(`id-${MAX_RECENT_SNIPPETS + 4}`);
  });

  it("clears history", () => {
    recordRecentSnippet({ id: "a", title: "A", language: "js" });
    clearRecentSnippets();
    expect(getRecentSnippets()).toEqual([]);
    expect(localStorage.getItem(RECENT_SNIPPETS_STORAGE_KEY)).toBeNull();
  });

  it("ignores corrupt localStorage payloads", () => {
    localStorage.setItem(RECENT_SNIPPETS_STORAGE_KEY, "{not-json");
    expect(getRecentSnippets()).toEqual([]);

    localStorage.setItem(RECENT_SNIPPETS_STORAGE_KEY, JSON.stringify([{ id: 1 }]));
    expect(getRecentSnippets()).toEqual([]);
  });
});
