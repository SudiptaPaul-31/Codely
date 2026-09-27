import {
  __resetSnippetRevisionsForTests,
  assertSequentialVersions,
  compareRevisions,
  createRevision,
  getRevisionAuditLog,
  listRevisions,
  restoreRevision,
} from "./snippet-revisions";

describe("Snippet Revision Management API (lib)", () => {
  beforeEach(() => {
    __resetSnippetRevisionsForTests();
  });

  it("creates a revision entry on every update (no silent overwrite)", async () => {
    const a = await createRevision("snip-1", {
      content: "v1 code",
      editorId: "editor-a",
    });
    const b = await createRevision("snip-1", {
      content: "v2 code",
      editorId: "editor-b",
    });
    expect(a.versionNumber).toBe(1);
    expect(b.versionNumber).toBe(2);
    expect(a.id).not.toBe(b.id);
    expect(a.content).toBe("v1 code");
    expect(b.content).toBe("v2 code");
  });

  it("lists revisions with version number, timestamp, and editor", async () => {
    await createRevision("snip-2", { content: "one", editorId: "ed-1" });
    await createRevision("snip-2", { content: "two", editorId: "ed-2" });

    const list = await listRevisions("snip-2", "viewer");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      versionNumber: 1,
      editorId: "ed-1",
    });
    expect(list[1]).toMatchObject({
      versionNumber: 2,
      editorId: "ed-2",
    });
    expect(list[0].createdAt).toBeTruthy();
    expect(list[1].createdAt).toBeTruthy();
    expect(list[0].contentPreview).toContain("one");
  });

  it("compares two revisions with highlighted diff stats", async () => {
    const r1 = await createRevision("snip-3", {
      content: "line1\nline2\nline3",
      editorId: "ed",
    });
    const r2 = await createRevision("snip-3", {
      content: "line1\nline2-changed\nline3\nline4",
      editorId: "ed",
    });

    const result = await compareRevisions("snip-3", r1.id, r2.id, "ed");
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.stats.changed + result.stats.added + result.stats.removed).toBeGreaterThan(0);
    expect(result.from.versionNumber).toBe(1);
    expect(result.to.versionNumber).toBe(2);
  });

  it("restore creates a new revision without erasing history", async () => {
    const r1 = await createRevision("snip-4", {
      content: "original",
      editorId: "ed",
    });
    await createRevision("snip-4", { content: "broken", editorId: "ed" });

    const restored = await restoreRevision("snip-4", r1.id, "ed-restore");
    expect(restored.newRevision.content).toBe("original");
    expect(restored.newRevision.versionNumber).toBe(3);
    expect(restored.currentContent).toBe("original");

    const list = await listRevisions("snip-4");
    expect(list).toHaveLength(3);
    expect(list.map((x) => x.versionNumber)).toEqual([1, 2, 3]);
    expect(list[0].contentPreview).toContain("original");
    expect(list[1].contentPreview).toContain("broken");
    expect(list[2].contentPreview).toContain("original");
    expect(assertSequentialVersions(list)).toBe(true);
  });

  it("version numbers increment sequentially with no duplicates or gaps", async () => {
    for (let i = 0; i < 5; i++) {
      await createRevision("snip-5", { content: `c${i}`, editorId: "ed" });
    }
    const list = await listRevisions("snip-5");
    expect(list.map((r) => r.versionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(assertSequentialVersions(list)).toBe(true);
  });

  it("tracks audit log for create, compare, and restore", async () => {
    const r1 = await createRevision("snip-6", { content: "a", editorId: "ed" });
    const r2 = await createRevision("snip-6", { content: "b", editorId: "ed" });
    await compareRevisions("snip-6", r1.id, r2.id, "ed");
    await restoreRevision("snip-6", r1.id, "ed");

    const audits = getRevisionAuditLog("snip-6");
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("create");
    expect(actions).toContain("compare");
    expect(actions).toContain("restore");
  });
});
