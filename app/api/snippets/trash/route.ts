import { NextRequest, NextResponse } from "next/server";
import { SnippetService } from "../snippet.service";
import { SnippetRepository } from "../snippet.repository";
import { OwnershipMiddleware } from "../ownership.middleware";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

/**
 * GET /api/snippets/trash
 * Get all soft-deleted snippets for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    // Extract wallet address
    const walletAddress = OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    // Parse pagination parameters
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "20", 10), 1),
      100,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // Get user's trash
    const trash = await service.getUserTrash(walletAddress, { limit, offset });

    return NextResponse.json({
      data: trash.data,
      pagination: {
        total: trash.total,
        limit: trash.limit,
        offset: trash.offset,
        hasMore: trash.hasMore,
      },
      message: `Found ${trash.total} deleted snippet(s)`,
    });
  } catch (error) {
    console.error("[API] Error fetching trash:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
