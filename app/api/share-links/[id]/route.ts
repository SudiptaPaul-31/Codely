import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "@/app/api/snippets/ownership.middleware";
import { shareLinkManagementService } from "@/lib/share-link-management.service";
import { authorizeSnippet } from "../route";

/**
 * DELETE /api/share-links/:id
 * Immediately invalidates a share link.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    const existing = await shareLinkManagementService.findShareLink(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Share link not found" }, { status: 404 });
    }
    const ownershipResponse = await authorizeSnippet(existing.snippetId, walletAddress);
    if (ownershipResponse) return ownershipResponse;

    const link = await shareLinkManagementService.revokeShareLink(
      id,
      walletAddress,
    );

    return NextResponse.json({
      success: true,
      data: link,
      message: "Share link revoked successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke share link";
    const status =
      message.includes("not found") ? 404 :
      message.includes("already revoked") ? 409 :
      500;
    console.error("[share-links] DELETE error:", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
