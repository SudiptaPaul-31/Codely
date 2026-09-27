import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { createRevision, listRevisions } from "@/lib/snippet-revisions";
import { z } from "zod";

const createSchema = z.object({
  content: z.string().min(0),
  editorId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  changeSummary: z.string().optional().nullable(),
});

/**
 * GET /api/snippets/:id/revisions
 * List all revisions with metadata (version number, timestamp, editor).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    const revisions = await listRevisions(id, walletAddress);
    return NextResponse.json({
      snippetId: id,
      count: revisions.length,
      revisions,
    });
  } catch (error) {
    console.error("[Revisions] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list revisions" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/snippets/:id/revisions
 * Store a new revision when a snippet is updated.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const revision = await createRevision(id, {
      content: parsed.data.content,
      editorId: parsed.data.editorId ?? walletAddress,
      title: parsed.data.title,
      language: parsed.data.language,
      changeSummary: parsed.data.changeSummary,
    });

    return NextResponse.json(
      {
        message: "Revision created",
        revision,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Revisions] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create revision" },
      { status: 500 },
    );
  }
}
