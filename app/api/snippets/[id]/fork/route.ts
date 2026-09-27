import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { SnippetService } from "../../snippet.service";
import { SnippetRepository } from "../../snippet.repository";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { appendActivityLog, extractIp, extractUserAgent } from "@/lib/activity-logger";
import { createTransaction } from "@/lib/db";
import { SnippetOwnershipProof } from "@/lib/snippet-ownership-proof";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body allows quick fork with defaults
    }

    // Extract wallet address
    let walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress && body.ownerWalletAddress) {
      walletAddress = body.ownerWalletAddress;
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Wallet address is required." },
        { status: 401 },
      );
    }

    if (body.ownershipProof) {
      const proof = body.ownershipProof as SnippetOwnershipProof;
      if (!proof.snippetId || !proof.hash || !proof.ownerWallet || !proof.signature || !proof.createdAt) {
        return NextResponse.json(
          { error: "Ownership proof required for forking" },
          { status: 400 },
        );
      }
    }

    const fork = await service.forkSnippet(id, walletAddress, body);

    await appendActivityLog("snippet.forked", "snippet", {
      actorWallet: walletAddress,
      resourceId: fork.id,
      metadata: {
        originalSnippetId: id,
        title: fork.title,
        language: fork.language,
      },
      ipAddress: extractIp(req.headers),
      userAgent: extractUserAgent(req.headers),
    });

    try {
      await createTransaction(
        walletAddress,
        "snippet_fork",
        `Forked snippet ${id} -> ${fork.id}`,
        { originalSnippetId: id, forkedSnippetId: fork.id },
      );
    } catch (txErr) {
      console.warn("[API] Failed to record transaction for snippet_fork:", txErr);
    }

    return NextResponse.json(fork, { status: 201 });
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
    if (error instanceof Error && error.message === "Cannot fork your own snippet") {
      return NextResponse.json(
        { error: "Cannot fork your own snippet" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Original snippet not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes("proof")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[API] Error forking snippet:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fork snippet" },
      { status: 500 },
    );
  }
}
