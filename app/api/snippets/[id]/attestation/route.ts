import { NextRequest, NextResponse } from "next/server";
import {
  snippetAttestationService,
  SnippetAttestationValidationError,
} from "@/lib/snippet-attestation-service";

/**
 * GET /api/snippets/[id]/attestation
 * Retrieve the latest attestation and historical revision attestations for a snippet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await snippetAttestationService.getSnippetAttestations(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof SnippetAttestationValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to retrieve snippet attestations." },
      { status: 500 },
    );
  }
}
