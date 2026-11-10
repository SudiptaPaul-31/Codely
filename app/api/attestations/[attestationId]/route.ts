import { NextRequest, NextResponse } from "next/server";
import {
  snippetAttestationService,
  SnippetAttestationValidationError,
} from "@/lib/snippet-attestation-service";

/**
 * GET /api/attestations/[attestationId]
 * Retrieve a specific snippet attestation record by ID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attestationId: string }> },
) {
  try {
    const { attestationId } = await params;
    const attestation =
      await snippetAttestationService.getAttestationById(attestationId);

    return NextResponse.json({ attestation }, { status: 200 });
  } catch (error) {
    if (error instanceof SnippetAttestationValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to retrieve attestation." },
      { status: 500 },
    );
  }
}
