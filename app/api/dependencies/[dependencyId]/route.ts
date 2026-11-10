import { NextRequest, NextResponse } from "next/server";
import {
  DependencyServiceError,
  snippetDependencyService,
} from "@/lib/snippet-dependency-service";
import { verifyAuthentication } from "@/lib/auth-middleware";

type RouteParams = { params: Promise<{ dependencyId: string }> };

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

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { dependencyId } = await params;
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
    const updated = await snippetDependencyService.updateDependency(
      dependencyId,
      {
        name: record.name as string | undefined,
        version: record.version as string | undefined,
        ecosystem: record.ecosystem as string | undefined,
        configuration: record.configuration as Record<string, unknown> | undefined,
      },
      callerWallet,
    );

    return NextResponse.json({ dependency: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof DependencyServiceError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to update dependency." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { dependencyId } = await params;
    const callerWallet = await resolveCallerWallet(req);

    const result = await snippetDependencyService.deleteDependency(
      dependencyId,
      callerWallet,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DependencyServiceError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to delete dependency." },
      { status: 500 },
    );
  }
}
