import { NextRequest, NextResponse } from "next/server";
import { ownershipProofService } from "@/lib/ownership-proof-service";

/**
 * POST /api/ownership-proofs/verify
 * Independently verify an exported ownership proof (JSON, signed JSON, or proofId).
 */
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) || {};
    } catch {
      return NextResponse.json(
        {
          status: "invalid",
          verified: false,
          reason: "Request body must be valid JSON.",
        },
        { status: 400 },
      );
    }

    const result = await ownershipProofService.verifyOwnershipProof(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to verify ownership proof.";
    return NextResponse.json(
      {
        status: "unverifiable",
        verified: false,
        reason: message,
      },
      { status: 500 },
    );
  }
}
