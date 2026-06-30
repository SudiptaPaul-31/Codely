import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SnippetRepository } from "../../snippet.repository";
import { OwnershipMiddleware } from "../../ownership.middleware";
import { SignatureMiddleware } from "../../signature.middleware";
import { appendActivityLog, extractUserAgent } from "@/lib/activity-logger";
import { createTransaction } from "@/lib/db";
import { submitOwnershipTransferMemoToStellar } from "@/lib/ownership-transfer";

const transferSchema = z.object({
  newOwnerWalletAddress: z
    .string()
    .min(56, "Invalid Stellar wallet address")
    .max(56, "Invalid Stellar wallet address"),
});

const repository = new SnippetRepository();
const ownershipMiddleware = new OwnershipMiddleware();
const signatureMiddleware = new SignatureMiddleware();

function getIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  );
}

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

    const body = await req.json();
    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.errors,
        },
        { status: 400 },
      );
    }

    const { newOwnerWalletAddress } = parsed.data;

    if (walletAddress.toUpperCase() === newOwnerWalletAddress.toUpperCase()) {
      return NextResponse.json(
        { error: "Bad Request", message: "New owner must differ from current owner." },
        { status: 400 },
      );
    }

    // Enforce current ownership
    const ownershipResult = await ownershipMiddleware.verifyOwnership(
      id,
      walletAddress,
      false,
    );
    if (!ownershipResult.isOwner) {
      return ownershipResult.error!;
    }

    // Enforce signature for this critical action
    const signatureResult = await signatureMiddleware.verifySignature(
      req,
      "transfer_ownership",
      id,
    );
    if (!signatureResult.isValid) {
      return signatureResult.error!;
    }

    // Get current owner for audit + atomic guard
    const current = await repository.findById(id);
    if (!current) {
      return NextResponse.json(
        { error: "Not Found", message: "Snippet not found." },
        { status: 404 },
      );
    }

    const oldOwnerWalletAddress = (current as any).owner_wallet_address as
      | string
      | null;

    if (!oldOwnerWalletAddress) {
      return NextResponse.json(
        { error: "Bad Request", message: "Snippet has no owner set." },
        { status: 400 },
      );
    }

    // Atomic ownership update (guard by old owner)
    const updated = await (repository as any).transferOwnershipAtomic?.({
      snippetId: id,
      oldOwnerWalletAddress,
      newOwnerWalletAddress,
    });

    // Fallback (non-atomic) if repository method doesn't exist in this codebase
    if (!updated) {
      // Guard at application level
      const currentAfter = await repository.findById(id);
      const currentOwnerAfter = (currentAfter as any)?.owner_wallet_address as
        | string
        | null;

      if (
        !currentOwnerAfter ||
        currentOwnerAfter.toUpperCase() !== oldOwnerWalletAddress.toUpperCase()
      ) {
        return NextResponse.json(
          {
            error: "Conflict",
            message:
              "Ownership transfer failed. The snippet owner may have changed; retry.",
          },
          { status: 409 },
        );
      }

      const tmp = await (repository as any).sql`
        UPDATE snippets
        SET owner_wallet_address = ${newOwnerWalletAddress},
            updated_at = ${new Date()}
        WHERE id = ${id}
          AND owner_wallet_address = ${oldOwnerWalletAddress}
        RETURNING *
      `;

      const row = tmp?.[0] ?? null;
      if (!row) {
        return NextResponse.json(
          {
            error: "Conflict",
            message:
              "Ownership transfer failed. The snippet owner may have changed; retry.",
          },
          { status: 409 },
        );
      }

      // Replace updated
      (updated as any) = row;
    }

    if (!updated) {
      return NextResponse.json(
        {
          error: "Conflict",
          message:
            "Ownership transfer failed. The snippet owner may have changed; retry.",
        },
        { status: 409 },
      );
    }

    // On-chain immutable memo/proof
    const memoResult = await submitOwnershipTransferMemoToStellar({
      snippetId: id,
      oldOwnerWalletAddress,
      newOwnerWalletAddress,
    });

    if (!memoResult.success || !memoResult.transactionHash) {
      await appendActivityLog("snippet.owner_transfer_failed", "snippet", {
        actorWallet: walletAddress,
        resourceId: id,
        metadata: {
          oldOwnerWalletAddress,
          newOwnerWalletAddress,
          stellarError: memoResult.error || "Unknown error",
        },
        ipAddress: getIp(req),
        userAgent: extractUserAgent(req.headers),
      });

      return NextResponse.json(
        {
          error: "On-chain transfer proof failed",
          message: memoResult.error || "Stellar transaction failed",
        },
        { status: 502 },
      );
    }

    // Record app transaction (internal)
    try {
      await createTransaction(
        walletAddress,
        "snippet_owner_transfer",
        `Transferred snippet ${id} ownership`,
        {
          snippetId: id,
          oldOwnerWalletAddress,
          newOwnerWalletAddress,
          stellarTransactionHash: memoResult.transactionHash,
        },
      );
    } catch (err) {
      console.error("[transactions] Failed to log snippet_owner_transfer:", err);
    }

    // Success audit log
    await appendActivityLog("snippet.owner_transfer", "snippet", {
      actorWallet: walletAddress,
      resourceId: id,
      metadata: {
        oldOwnerWalletAddress,
        newOwnerWalletAddress,
        transactionHash: memoResult.transactionHash,
        memo: memoResult.memo,
      },
      ipAddress: getIp(req),
      userAgent: extractUserAgent(req.headers),
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("[OwnershipTransfer] POST error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}

