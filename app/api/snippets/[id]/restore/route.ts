import { NextRequest, NextResponse } from "next/server";
import { SnippetService } from "../../snippet.service";
import { SnippetRepository } from "../../snippet.repository";
import { OwnershipMiddleware } from "../../ownership.middleware";

const repository = new SnippetRepository();
const service = new SnippetService(repository);
const ownershipMiddleware = new OwnershipMiddleware();

/**
 * POST /api/snippets/[id]/restore
 * Restore a soft-deleted snippet
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Extract wallet address
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    // Verify ownership (check if user owns the deleted snippet)
    const ownershipResult = await ownershipMiddleware.verifyOwnership(
      id,
      walletAddress,
      true, // Allow checking deleted snippets
    );

    if (!ownershipResult.isOwner) {
      return ownershipResult.error!;
    }

    // Restore the snippet
    const restored = await service.restoreSnippet(id, walletAddress);

    return NextResponse.json(
      {
        message: "Snippet restored successfully",
        snippet: restored,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Snippet is not deleted") {
      return NextResponse.json(
        { error: "Snippet is not deleted" },
        { status: 400 },
      );
    }
    console.error("[API] Error restoring snippet:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
