import { NextRequest, NextResponse } from "next/server";
import {
  ownershipProofService,
  OwnershipProofValidationError,
} from "@/lib/ownership-proof-service";

/**
 * GET /api/ownership-proofs/[proofId]
 * Retrieve a specific ownership proof by ID in the requested export format.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ proofId: string }> },
) {
  try {
    const { proofId } = await params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    const bundle = await ownershipProofService.getProofById(proofId);

    if (format === "json") {
      return NextResponse.json(bundle.json, { status: 200 });
    }
    if (format === "signed_json") {
      return NextResponse.json(bundle.signedJson, { status: 200 });
    }
    if (format === "verification_link") {
      return NextResponse.json(
        { verificationLink: bundle.verificationLink },
        { status: 200 },
      );
    }

    return NextResponse.json(bundle, { status: 200 });
  } catch (error) {
    if (error instanceof OwnershipProofValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to retrieve ownership proof." },
      { status: 500 },
    );
  }
}
