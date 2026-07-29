import { addFolder, createOrganization, deleteFolder, moveSnippet, normalizeOrganization, renameFolder, reorderFolder } from "./snippet-folders";

describe("snippet folder organization", () => {
  it("creates, renames, reorders, and deletes folders without losing snippets", () => {
    let state = createOrganization(["a", "b"]);
    state = addFolder(state, "Backend", "folder-1");
    state = addFolder(state, "Frontend", "folder-2");
    state = renameFolder(state, "folder-1", "API");
    state = moveSnippet(state, "a", "folder-1");
    state = reorderFolder(state, "folder-2", 0);
    expect(state.folderOrder).toEqual(["folder-2", "folder-1"]);
    expect(state.folders["folder-1"]).toMatchObject({ name: "API", snippetIds: ["a"] });
    state = deleteFolder(state, "folder-1");
    expect(state.unfiledSnippetIds).toContain("a");
  });

  it("moves and reorders snippets between folders", () => {
    let state = addFolder(createOrganization(["a", "b", "c"]), "Work", "work");
    state = moveSnippet(state, "a", "work");
    state = moveSnippet(state, "b", "work");
    state = moveSnippet(state, "b", "work", 0);
    expect(state.folders.work.snippetIds).toEqual(["b", "a"]);
  });

  it("restores valid state while adding newly discovered snippets", () => {
    const saved = moveSnippet(addFolder(createOrganization(["a"]), "Work", "work"), "a", "work");
    const restored = normalizeOrganization(saved, ["a", "new"]);
    expect(restored.folders.work.snippetIds).toEqual(["a"]);
    expect(restored.unfiledSnippetIds).toEqual(["new"]);
  });
});
