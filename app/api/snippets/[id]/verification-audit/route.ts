import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "../../verification.service";
import { VerificationRepository } from "../../verification.repository";

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pagination defaults
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;

// Dependency Injection instantiation
const repository = new VerificationRepository();
const service = new VerificationService(repository);

/**
 * Validate if a string is a valid UUID format
 */
function isValidUUID(id: string): boolean {
  return uuidRegex.test(id);
}

/**
 * Parse pagination parameters from query string
 */
function parsePaginationParams(
  req: NextRequest
): { limit: number; offset: number } {
  const { searchParams } = new URL(req.url);

  // Parse limit with default and max boundary
  const rawLimit = searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number.parseInt(rawLimit ?? "", 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  // Parse offset with minimum boundary
  const rawOffset = searchParams.get("offset");
  const offset = Math.max(Number.parseInt(rawOffset ?? "", 10) || DEFAULT_OFFSET, 0);

  return { limit, offset };
}

/**
 * GET /api/snippets/[id]/verification-audit
 * Get paginated verification audit log for a specific snippet
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Validate snippet ID is UUID format
    if (!isValidUUID(id)) {
      console.warn("[API] Invalid snippet ID format:", id);
      return NextResponse.json(
        {
          error: "Invalid snippet ID format. Must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    // Parse pagination parameters
    const { limit, offset } = parsePaginationParams(req);

    // Get verification audit log from service
    const auditLog = await service.getVerificationAuditLog(id, {
      limit,
      offset,
    });

    console.log(
      `[API] Retrieved verification audit log for snippet: ${id}`,
      `total: ${auditLog.total}, limit: ${limit}, offset: ${offset}`
    );

    return NextResponse.json(
      {
        snippetId: id,
        auditLog: auditLog.data,
        pagination: {
          total: auditLog.total,
          limit: auditLog.limit,
          offset: auditLog.offset,
          hasMore: auditLog.hasMore,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("[API] Error retrieving verification audit log:", errorMessage);

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
