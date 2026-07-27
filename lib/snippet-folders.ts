export const FOLDER_STORAGE_KEY = "codely:snippet-folders:v1";

export interface SnippetFolder {
  id: string;
  name: string;
  snippetIds: string[];
}

export interface FolderOrganization {
  version: 1;
  folderOrder: string[];
  folders: Record<string, SnippetFolder>;
  unfiledSnippetIds: string[];
}

export function createOrganization(snippetIds: string[]): FolderOrganization {
  return { version: 1, folderOrder: [], folders: {}, unfiledSnippetIds: [...snippetIds] };
}

export function normalizeOrganization(value: unknown, snippetIds: string[]): FolderOrganization {
  const fallback = createOrganization(snippetIds);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<FolderOrganization>;
  if (candidate.version !== 1 || !candidate.folders || !Array.isArray(candidate.folderOrder)) return fallback;

  const valid = new Set(snippetIds);
  const used = new Set<string>();
  const folders: Record<string, SnippetFolder> = {};
  const folderOrder = candidate.folderOrder.filter((id) => {
    const folder = candidate.folders?.[id];
    if (!folder || typeof folder.name !== "string" || !Array.isArray(folder.snippetIds)) return false;
    folders[id] = {
      id,
      name: folder.name,
      snippetIds: folder.snippetIds.filter((snippetId) => valid.has(snippetId) && !used.has(snippetId) && used.add(snippetId)),
    };
    return true;
  });
  const savedUnfiled = Array.isArray(candidate.unfiledSnippetIds) ? candidate.unfiledSnippetIds : [];
  const unfiledSnippetIds = [
    ...savedUnfiled.filter((id) => valid.has(id) && !used.has(id) && used.add(id)),
    ...snippetIds.filter((id) => !used.has(id)),
  ];
  return { version: 1, folderOrder, folders, unfiledSnippetIds };
}

export function addFolder(state: FolderOrganization, name: string, id: string): FolderOrganization {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return {
    ...state,
    folderOrder: [...state.folderOrder, id],
    folders: { ...state.folders, [id]: { id, name: trimmed, snippetIds: [] } },
  };
}

export function renameFolder(state: FolderOrganization, id: string, name: string): FolderOrganization {
  const trimmed = name.trim();
  if (!state.folders[id] || !trimmed) return state;
  return { ...state, folders: { ...state.folders, [id]: { ...state.folders[id], name: trimmed } } };
}

export function deleteFolder(state: FolderOrganization, id: string): FolderOrganization {
  const folder = state.folders[id];
  if (!folder) return state;
  const folders = { ...state.folders };
  delete folders[id];
  return {
    ...state,
    folders,
    folderOrder: state.folderOrder.filter((folderId) => folderId !== id),
    unfiledSnippetIds: [...state.unfiledSnippetIds, ...folder.snippetIds],
  };
}

export function moveSnippet(
  state: FolderOrganization,
  snippetId: string,
  destinationId: string | null,
  destinationIndex?: number,
): FolderOrganization {
  const folders = Object.fromEntries(Object.entries(state.folders).map(([id, folder]) => [
    id, { ...folder, snippetIds: folder.snippetIds.filter((value) => value !== snippetId) },
  ]));
  let unfiledSnippetIds = state.unfiledSnippetIds.filter((value) => value !== snippetId);
  const destination = destinationId ? folders[destinationId]?.snippetIds : unfiledSnippetIds;
  if (!destination) return state;
  const index = Math.max(0, Math.min(destinationIndex ?? destination.length, destination.length));
  destination.splice(index, 0, snippetId);
  if (!destinationId) unfiledSnippetIds = destination;
  return { ...state, folders, unfiledSnippetIds };
}

export function reorderFolder(state: FolderOrganization, folderId: string, destinationIndex: number) {
  const order = state.folderOrder.filter((id) => id !== folderId);
  order.splice(Math.max(0, Math.min(destinationIndex, order.length)), 0, folderId);
  return { ...state, folderOrder: order };
}
