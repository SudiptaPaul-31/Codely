import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import { VISIBILITY_VALUES } from "../../snippet.validator";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

const patchSchema = z.object({
  visibility: z.enum(VISIBILITY_VALUES),
  sharedWith: z.array(z.string().min(1)).optional(),
});

/**
 * GET /api/snippets/[id]/visibility
 * Returns the snippet's visibility state and (for the owner) the list of
 * users it is shared with.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const snippet = await repository.findById(id);
    if (!snippet) {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }

    const viewerWallet = await OwnershipMiddleware.extractWalletAddress(req);
    const isOwner =
      !!viewerWallet &&
      (!snippet.owner_wallet_address || snippet.owner_wallet_address === viewerWallet);

    // Non-owners may only inspect visibility for public snippets; anything else is denied.
    if (!isOwner && snippet.visibility !== "public") {
      return NextResponse.json(
        { error: "Forbidden", message: "You do not have access to this snippet." },
        { status: 403 },
      );
    }

    const sharedUsers = isOwner ? await service.getSharedUsers(id) : undefined;

    return NextResponse.json({
      visibility: snippet.visibility || "private",
      sharedWith: sharedUsers?.map((u: any) => u.user_wallet_address) ?? [],
      isOwner,
    });
  } catch (error) {
    console.error("[Visibility] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch visibility" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/snippets/[id]/visibility
 * Change snippet visibility (private | public | shared). Owner only.
 * Body: { visibility, sharedWith?: string[] }
 */
export async function PATCH(
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

    const snippet = await repository.findById(id);
    if (!snippet) {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }

    // Only the owner may change visibility
    if (
      snippet.owner_wallet_address &&
      snippet.owner_wallet_address !== walletAddress
    ) {
      await appendActivityLog("snippet.visibility_change_denied", "snippet", {
        actorWallet: walletAddress,
        resourceId: id,
        metadata: {
          reason: "not_owner",
          requestedVisibility: null,
        },
        ipAddress: extractIp(req.headers),
        userAgent: extractUserAgent(req.headers),
      });
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Only the snippet owner can change visibility.",
        },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Validation failed", details: [{ message: "Invalid JSON body" }] },
        { status: 400 },
      );
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { visibility, sharedWith } = parsed.data;

    // 'shared' visibility requires at least one authorized user
    if (visibility === "shared" && (!sharedWith || sharedWith.length === 0)) {
      // Allow keeping existing grants if any
      const existing = await service.getSharedUsers(id);
      if (existing.length === 0) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: [
              {
                message:
                  "sharedWith must contain at least one wallet address when visibility is 'shared'",
              },
            ],
          },
          { status: 400 },
        );
      }
    }

    const updated = await service.setVisibility(
      id,
      visibility,
      walletAddress,
      sharedWith,
    );

    return NextResponse.json({
      id: updated.id,
      visibility: updated.visibility,
      sharedWith:
        visibility === "shared"
          ? (await service.getSharedUsers(id)).map((u: any) => u.user_wallet_address)
          : [],
      message: `Visibility changed to ${visibility}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    console.error("[Visibility] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update visibility" },
      { status: 500 },
    );
  }
}
