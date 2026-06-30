import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "../../verification.service";
import { VerificationRepository } from "../../verification.repository";

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * GET /api/snippets/[id]/verification-status
 * Get the verification status of a specific snippet
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    // Get verification status from service
    const verificationStatus = await service.getVerificationStatus(id);

    console.log(
      `[API] Retrieved verification status for snippet: ${id}`,
      verificationStatus ? "verified" : "not verified"
    );

    return NextResponse.json(
      {
        snippetId: id,
        verification: verificationStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error(
      "[API] Error retrieving verification status:",
      errorMessage
    );

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
