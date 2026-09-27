import { NextRequest, NextResponse } from "next/server";
import { StellarRecoveryService } from "@/lib/stellar-recovery.service";

const service = new StellarRecoveryService();

// UUID validation regex (snippets.id is UUID)
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pagination defaults (matches /verification-audit)
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

function isValidUUID(id: string): boolean {
  return uuidRegex.test(id);
}

function parsePaginationParams(
  req: NextRequest,
): { limit: number; offset: number } {
  const { searchParams } = new URL(req.url);

  const rawLimit = searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number.parseInt(rawLimit ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const rawOffset = searchParams.get("offset");
  const offset = Math.max(Number.parseInt(rawOffset ?? "", 10) || DEFAULT_OFFSET, 0);

  return { limit, offset };
}

/**
 * GET /api/snippets/[id]/verification-history
 *
 * Chronological history of blockchain verification events for a snippet:
 * transaction hash, ledger sequence, and confirmation status (oldest first).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      console.warn("[API] Invalid snippet ID format:", id);
      return NextResponse.json(
        { error: "Invalid snippet ID format. Must be a valid UUID." },
        { status: 400 },
      );
    }

    const exists = await service.snippetExists(id);
    if (!exists) {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }

    const { limit, offset } = parsePaginationParams(req);
    const { data, total } = await service.getVerificationHistory(id, {
      limit,
      offset,
    });

    return NextResponse.json({
      snippetId: id,
      history: data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("[API] Error retrieving verification history:", errorMessage);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
