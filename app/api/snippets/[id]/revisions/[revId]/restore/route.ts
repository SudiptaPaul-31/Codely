import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../../ownership.middleware";
import { restoreRevision } from "@/lib/snippet-revisions";
import { SnippetRepository } from "../../../snippet.repository";

const repository = new SnippetRepository();

/**
 * POST /api/snippets/:id/revisions/:revId/restore
 * Roll back to a previous version by creating a NEW revision entry
 * (history is preserved — no silent overwrite of prior revisions).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; revId: string }> },
) {
  try {
    const { id, revId } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    let body: { editorId?: string; applyToSnippet?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const editorId = body.editorId ?? walletAddress;
    const result = await restoreRevision(id, revId, editorId);

    // Optionally apply restored content to the live snippet row
    if (body.applyToSnippet !== false) {
      try {
        const snippet = await repository.findById(id);
        if (snippet) {
          await repository.update(id, {
            code: result.currentContent,
          });
        }
      } catch (err) {
        // Snippet row may be absent in unit/test environments; revision
        // history is still the source of truth for this API.
        console.warn("[Revisions] Could not apply restore to snippet row:", err);
      }
    }

    return NextResponse.json({
      message: "Revision restored; new revision entry created",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore revision";
    const status = message.includes("not found") ? 404 : 500;
    console.error("[Revisions] RESTORE error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
