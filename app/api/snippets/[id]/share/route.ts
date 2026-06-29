import { NextRequest, NextResponse } from "next/server";
import { ShareService } from "../../share.service";
import { ShareRepository } from "../../share.repository";
import { SnippetRepository } from "../../snippet.repository";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { z } from "zod";

const createShareSchema = z.object({
  isReadOnly: z.boolean().optional(),
  expiresAt: z.string().optional().transform((val) => (val ? new Date(val) : null)),
});

const snippetRepository = new SnippetRepository();
const shareRepository = new ShareRepository();
const shareService = new ShareService(shareRepository, snippetRepository);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    const ownershipResult = await new OwnershipMiddleware().verifyOwnership(
      id,
      walletAddress,
    );
    if (!ownershipResult.isOwner) {
      return NextResponse.json(
        { error: "Forbidden", message: "Only the snippet owner can share snippets." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = createShareSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { isReadOnly, expiresAt } = parsed.data;

    const result = await shareService.createShareLink({
      snippetId: id,
      isReadOnly: isReadOnly ?? true,
      expiresAt,
      createdByWalletAddress: walletAddress,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[Share] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create share link" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    const ownershipResult = await new OwnershipMiddleware().verifyOwnership(
      id,
      walletAddress,
    );
    if (!ownershipResult.isOwner) {
      return NextResponse.json(
        { error: "Forbidden", message: "Only the snippet owner can revoke share links." },
        { status: 403 },
      );
    }

    const revoked = await shareService.revokeShare(id, walletAddress);

    if (!revoked) {
      return NextResponse.json(
        { error: "No active share link found for this snippet." },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Share link revoked successfully" });
  } catch (error) {
    console.error("[Share] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke share link" },
      { status: 500 },
    );
  }
}