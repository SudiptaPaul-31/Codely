"use server";

import { prisma } from "@/lib/prisma"; // ADAPT if your prisma export differs
import { getCurrentOwner } from "@/lib/current-owner";

const MAX_BULK = 500;

export type BulkResult = {
  ok: boolean;
  message: string;
  failedIds: string[];
  successIds: string[];
};

function fail(message: string, ids: string[] = []): BulkResult {
  return { ok: false, message, failedIds: ids, successIds: [] };
}

function validateIds(ids: unknown): string | null {
  if (!Array.isArray(ids) || ids.length === 0) return "No snippets selected.";
  if (ids.length > MAX_BULK) return `You can act on at most ${MAX_BULK} snippets at once.`;
  if (!ids.every((i) => typeof i === "string")) return "Invalid selection.";
  return null;
}

async function authorizedIds(owner: string, ids: string[]): Promise<string[]> {
  const rows = await prisma.snippet.findMany({
    where: { id: { in: ids }, owner },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function audit(actor: string, action: string, targetIds: string[], meta?: object) {
  try {
    await prisma.auditLog.create({ data: { actor, action, targetIds, meta } });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export async function listMyFolders() {
  const owner = await getCurrentOwner();
  if (!owner) return [];
  return prisma.folder.findMany({
    where: { owner },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createFolder(name: string) {
  const owner = await getCurrentOwner();
  if (!owner) return { ok: false, message: "Not authorized." };
  const clean = name.trim();
  if (!clean || clean.length > 60) return { ok: false, message: "Folder name must be 1-60 characters." };
  const folder = await prisma.folder.create({ data: { name: clean, owner } });
  return { ok: true, message: "Folder created.", id: folder.id };
}

export async function bulkDeleteSnippets(ids: string[]): Promise<BulkResult> {
  const owner = await getCurrentOwner();
  if (!owner) return fail("You are not authorized.", ids);
  const err = validateIds(ids);
  if (err) return fail(err);

  const allowed = await authorizedIds(owner, ids);
  const denied = ids.filter((i) => !allowed.includes(i));
  if (allowed.length === 0) return fail("None of the selected snippets can be deleted by you.", denied);

  await prisma.snippet.deleteMany({ where: { id: { in: allowed }, owner } });
  await audit(owner, "bulk_delete", allowed, { denied });

  return {
    ok: denied.length === 0,
    message:
      denied.length === 0
        ? `Deleted ${allowed.length} snippet${allowed.length === 1 ? "" : "s"}.`
        : `Deleted ${allowed.length}. ${denied.length} could not be deleted (not allowed).`,
    failedIds: denied,
    successIds: allowed,
  };
}

export async function bulkMoveSnippets(ids: string[], folderId: string | null): Promise<BulkResult> {
  const owner = await getCurrentOwner();
  if (!owner) return fail("You are not authorized.", ids);
  const err = validateIds(ids);
  if (err) return fail(err);

  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, owner }, select: { id: true } });
    if (!folder) return fail("Invalid or unauthorized destination folder.");
  }

  const allowed = await authorizedIds(owner, ids);
  const denied = ids.filter((i) => !allowed.includes(i));
  if (allowed.length === 0) return fail("None of the selected snippets can be moved by you.", denied);

  await prisma.snippet.updateMany({ where: { id: { in: allowed }, owner }, data: { folderId } });
  await audit(owner, "bulk_move", allowed, { folderId, denied });

  return {
    ok: denied.length === 0,
    message:
      denied.length === 0
        ? `Moved ${allowed.length} snippet${allowed.length === 1 ? "" : "s"}.`
        : `Moved ${allowed.length}. ${denied.length} could not be moved (not allowed).`,
    failedIds: denied,
    successIds: allowed,
  };
}

export async function bulkExportSnippets(ids: string[]) {
  const owner = await getCurrentOwner();
  if (!owner) return { ok: false, message: "You are not authorized.", snippets: [] as any[] };
  const err = validateIds(ids);
  if (err) return { ok: false, message: err, snippets: [] as any[] };

  const snippets = await prisma.snippet.findMany({
    where: { id: { in: ids }, owner },
    select: {
      id: true,
      title: true,
      language: true,
      code: true,
      createdAt: true,
      updatedAt: true,
      folder: { select: { name: true } },
    },
  });
  if (snippets.length === 0) return { ok: false, message: "Nothing to export.", snippets: [] as any[] };

  await audit(owner, "bulk_export", snippets.map((s) => s.id));
  return {
    ok: true,
    message: `Exported ${snippets.length} snippet${snippets.length === 1 ? "" : "s"}.`,
    snippets: snippets.map((s) => ({
      ...s,
      folder: s.folder?.name ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}