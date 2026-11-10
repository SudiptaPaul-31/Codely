import { NextRequest, NextResponse } from "next/server";
import {
  BulkRequestError,
  bulkSnippetService,
} from "@/lib/bulk-snippet-service";
import { verifyAuthentication } from "@/lib/auth-middleware";

async function resolveCallerWallet(req: NextRequest): Promise<string | null> {
  try {
    const authPayload = await verifyAuthentication(req);
    const jwtWallet = authPayload?.walletAddress ?? authPayload?.sub;
    if (typeof jwtWallet === "string" && jwtWallet.trim()) {
      return jwtWallet.trim();
    }
  } catch {
    // Fallback to header below
  }

  const headerWallet = req.headers.get("x-wallet-address");
  if (headerWallet && headerWallet.trim()) {
    return headerWallet.trim();
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const callerWallet = await resolveCallerWallet(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Request body must be valid JSON.",
        },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Request body must be a JSON object.",
        },
        { status: 400 },
      );
    }

    const record = body as Record<string, unknown>;
    const response = await bulkSnippetService.bulkExport(
      {
        snippetIds: record.snippetIds,
        format: record.format as "json" | "markdown" | undefined,
      },
      callerWallet,
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof BulkRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "PROCESSING_FAILURE",
        message: "Failed to execute bulk export operation.",
      },
      { status: 500 },
    );
  }
}
