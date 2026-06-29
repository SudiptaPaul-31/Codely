import {
  createSnippetVersion,
  getVersionHistory,
  getVersionById,
  restoreVersion,
  createTransaction,
} from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { SnippetService } from "../snippet.service";
import { SnippetRepository } from "../snippet.repository";
import { OwnershipMiddleware } from "../ownership.middleware";
import { canView, canEdit } from "@/lib/permissions.service";
import { ZodError } from "zod";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import { SignatureMiddleware } from "../signature.middleware";

// Dependency Injection instantiation
const repository = new SnippetRepository();
const service = new SnippetService(repository);
const ownershipMiddleware = new OwnershipMiddleware();
const signatureMiddleware = new SignatureMiddleware();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle version history request
    if (action === "versions") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = parseInt(url.searchParams.get("pageSize") || "10");

      const history = await getVersionHistory(id, page, pageSize);
      return NextResponse.json(history);
    }

    // Handle single version request
    if (action === "version") {
      const versionId = url.searchParams.get("versionId");
      if (!versionId) {
        return NextResponse.json(
          { error: "versionId is required" },
          { status: 400 },
        );
      }
      const version = await getVersionById(versionId);
      if (!version) {
        return NextResponse.json(
          { error: "Version not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(version);
    }

    // Default: get snippet by ID via service
    const snippet = await service.getSnippetById(id);

    // Enforce view permission if snippet has an owner
    const ownerWallet = (snippet as any).owner_wallet_address;
    if (ownerWallet) {
      const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
      if (!walletAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Owner always has access — skip permission check
      if (walletAddress !== ownerWallet) {
        const allowed = await canView(id, walletAddress);
        if (!allowed) {
          return NextResponse.json(
            {
              error: "Forbidden",
              message: "You do not have view access to this snippet.",
            },
            { status: 403 },
          );
        }
      }
    }

    return NextResponse.json(snippet);
  } catch (error) {
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    console.error("[v0] Error fetching snippet:", error);
    return NextResponse.json(
      { error: "Failed to fetch snippet" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle version restore request
    if (action === "restore") {
      const body = await req.json();
      const { versionId, editorId } = body;

      if (!versionId) {
        return NextResponse.json(
          { error: "versionId is required for restore action" },
          { status: 400 },
        );
      }

      const restored = await restoreVersion(versionId, editorId || null);

      // Log restore action if wallet provided
      if (req.headers.get("x-wallet-address")) {
        try {
          await createTransaction(
            req.headers.get("x-wallet-address")!,
            "version_restore",
            `Restored version ${versionId} for snippet ${restored.snippet_id}`,
            { versionId, snippetId: restored.snippet_id },
          );
        } catch (err) {
          console.error("[transactions] Failed to log version_restore:", err);
        }
      }
      // Log the restore action
      await appendActivityLog("snippet.restored", "snippet", {
        actorWallet: await await OwnershipMiddleware.extractWalletAddress(req),
        resourceId:  id,
        metadata:    { versionId, editorId: editorId || null },
        ipAddress:   extractIp(req.headers),
        userAgent:   extractUserAgent(req.headers),
      });

      return NextResponse.json(restored);
    }

    // Default: update snippet via service
    // Extract wallet address and verify ownership
    const walletAddress = await await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    // Check edit permission (owner OR granted edit access)
    const editAllowed = await canEdit(id, walletAddress);
    if (!editAllowed) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have edit access to this snippet.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const snippet = await service.updateSnippet(id, body);

    // Log update
    if (walletAddress) {
      try {
        await createTransaction(
          walletAddress,
          "snippet_update",
          `Updated snippet ${id}`,
          { snippetId: id },
        );
      } catch (err) {
        console.error("[transactions] Failed to log snippet_update:", err);
      }
    }
    // Log the update
    await appendActivityLog("snippet.updated", "snippet", {
      actorWallet: walletAddress,
      resourceId:  id,
      metadata:    { title: snippet.title, language: snippet.language },
      ipAddress:   extractIp(req.headers),
      userAgent:   extractUserAgent(req.headers),
    });

    return NextResponse.json(snippet);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    console.error("[v0] Error updating snippet:", error);
    return NextResponse.json(
      { error: "Failed to update snippet" },
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

    // Extract wallet address and verify ownership
    const walletAddress = await await OwnershipMiddleware.extractWalletAddress(req);

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    // Verify ownership before delete
    const ownershipResult = await ownershipMiddleware.verifyOwnership(
      id,
      walletAddress,
    );

    if (!ownershipResult.isOwner) {
      return ownershipResult.error!;
    }

    // Verify wallet signature for this critical action
    const signatureResult = await signatureMiddleware.verifySignature(req, "delete_snippet", id);
    if (!signatureResult.isValid) {
      return signatureResult.error!;
    }

    // Use soft delete instead of hard delete
    await service.deleteSnippet(id, walletAddress);

    // Log delete
    if (walletAddress) {
      try {
        await createTransaction(
          walletAddress,
          "snippet_delete",
          `Deleted snippet ${id}`,
          { snippetId: id },
        );
      } catch (err) {
        console.error("[transactions] Failed to log snippet_delete:", err);
      }
    }

    // Log the deletion
    await appendActivityLog("snippet.deleted", "snippet", {
      actorWallet: walletAddress,
      resourceId:  id,
      metadata:    {},
      ipAddress:   extractIp(req.headers),
      userAgent:   extractUserAgent(req.headers),
    });

    return NextResponse.json({
      message: "Snippet deleted successfully",
      note: "Snippet moved to trash. You can restore it from the trash section.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    console.error("[v0] Error deleting snippet:", error);
    return NextResponse.json(
      { error: "Failed to delete snippet" },
      { status: 500 },
    );
  }
}
