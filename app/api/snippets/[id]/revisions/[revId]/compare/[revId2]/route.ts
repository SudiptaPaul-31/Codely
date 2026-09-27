import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../../../ownership.middleware";
import { compareRevisions } from "@/lib/snippet-revisions";

/**
 * GET /api/snippets/:id/revisions/:revId/compare/:revId2
 * Return a highlighted diff between two revision versions.
 */
export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; revId: string; revId2: string }> },
) {
  try {
    const { id, revId, revId2 } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    const result = await compareRevisions(id, revId, revId2, walletAddress);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compare revisions";
    const status = message.includes("not found") ? 404 : 500;
    console.error("[Revisions] COMPARE error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
