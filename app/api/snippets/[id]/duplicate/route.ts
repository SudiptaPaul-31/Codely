import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { SnippetService } from "../../snippet.service";
import { SnippetRepository } from "../../snippet.repository";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import { createTransaction } from "@/lib/db";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Extract wallet address
    let walletAddress = await OwnershipMiddleware.extractWalletAddress(req);

    // If body has title override or wallet address
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is valid for duplicate
    }

    if (!walletAddress && body.ownerWalletAddress) {
      walletAddress = body.ownerWalletAddress;
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    const duplicate = await service.duplicateSnippet(id, walletAddress, body);

    await appendActivityLog("snippet.duplicated", "snippet", {
      actorWallet: walletAddress,
      resourceId: duplicate.id,
      metadata: {
        originalSnippetId: id,
        title: duplicate.title,
        language: duplicate.language,
      },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    // Record on-chain / database transaction
    try {
      await createTransaction(
        walletAddress,
        "snippet_duplicate",
        `Duplicated snippet ${id} -> ${duplicate.id}`,
        { originalSnippetId: id, newSnippetId: duplicate.id },
      );
    } catch (txErr) {
      console.warn("[API] Failed to record transaction for snippet_duplicate:", txErr);
    }

    return NextResponse.json(duplicate, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Source snippet not found") {
      return NextResponse.json(
        { error: "Source snippet not found" },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "Cannot duplicate your own snippet") {
      return NextResponse.json(
        { error: "Cannot duplicate your own snippet" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Original snippet not found" }, { status: 404 });
    }
    console.error("[API] Error duplicating snippet:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to duplicate snippet",
      },
      { status: 500 },
    );
  }
}