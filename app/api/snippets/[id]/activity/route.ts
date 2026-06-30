import { NextRequest, NextResponse } from "next/server";
import { ActivityLogger } from "@/lib/activity-logger";
import { OwnershipMiddleware } from "../../ownership.middleware";

/**
 * GET /api/snippets/[id]/activity
 * Get activity history for a snippet
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Extract wallet address for ownership verification
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
      Math.max(parseInt(searchParams.get("limit") || "50", 10), 1),
      100,
    );

    // Get activity history
    const history = await (ActivityLogger as any).getSnippetHistory(id, limit);

    return NextResponse.json({
      snippetId: id,
      activities: history,
      total: history.length,
    });
  } catch (error) {
    console.error("[API] Error fetching activity history:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
