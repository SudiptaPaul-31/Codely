import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "@/app/api/snippets/ownership.middleware";
import {
  shareLinkManagementService,
  ShareLinkVisibility,
} from "@/lib/share-link-management.service";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status },
  );
}

/**
 * POST /api/share-links
 * Body: { snippetId, visibility?, expiresAt? }
 */
export async function POST(req: NextRequest) {
  try {
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    const body = await req.json().catch(() => ({}));
    const snippetId = typeof body.snippetId === "string" ? body.snippetId : "";
    const visibility = body.visibility as ShareLinkVisibility | undefined;
    const expiresAt = body.expiresAt ?? null;

    if (!snippetId) {
      return jsonError("snippetId is required", 400);
    }

    if (visibility && visibility !== "read-only" && visibility !== "read-write") {
      return jsonError("visibility must be 'read-only' or 'read-write'", 400);
    }

    const link = await shareLinkManagementService.createShareLink({
      snippetId,
      visibility,
      expiresAt,
      createdBy: walletAddress,
    });

    return NextResponse.json(
      {
        success: true,
        data: link,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create share link";
    const status = message.includes("required") || message.includes("expiresAt") ? 400 : 500;
    console.error("[share-links] POST error:", error);
    return jsonError(message, status);
  }
}

/**
 * GET /api/share-links?snippetId=...
 * Lists active (non-expired, non-revoked) links for a snippet.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const snippetId = searchParams.get("snippetId") || "";

    if (!snippetId) {
      return jsonError("snippetId query parameter is required", 400);
    }

    const links = await shareLinkManagementService.listActiveShareLinks(snippetId);
    return NextResponse.json({
      success: true,
      data: links,
      count: links.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list share links";
    console.error("[share-links] GET error:", error);
    return jsonError(message, 500);
  }
}
