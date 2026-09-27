import { NextRequest, NextResponse } from "next/server";
import { shareLinkManagementService } from "@/lib/share-link-management.service";

/**
 * GET /api/share-links/:token/validate
 * Checks whether a share link is active and valid.
 * Returns metadata only — never snippet content.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: token } = await params;
    const result = await shareLinkManagementService.validateShareLink(token);

    return NextResponse.json({
      success: true,
      data: {
        valid: result.valid,
        reason: result.reason ?? null,
        link: result.link ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate share link";
    console.error("[share-links] VALIDATE error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
