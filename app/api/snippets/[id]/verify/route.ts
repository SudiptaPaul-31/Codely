import { NextRequest, NextResponse } from "next/server";
import {
  getSnippetWithHash,
  verifySnippetIntegrity,
  storeSnippetHash,
} from "@/lib/db";
import { generateSnippetHash } from "@/lib/hash";
import { submitHashToStellar } from "@/lib/stellar";

/**
 * POST /api/snippets/[id]/verify
 *
 * Anchors the snippet's creation timestamp + content hash on the Stellar
 * blockchain, providing immutable proof-of-existence.
 *
 * - The snippet's `created_at` timestamp is embedded in the Stellar memo,
 *   permanently linking the snippet ID, its content hash, and its creation
 *   time to a specific on-chain transaction.
 * - Once stored, the record cannot be overwritten (immutability enforced in DB).
 *
 * Body: { secretKey?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const snippet = await getSnippetWithHash(id);
    if (!snippet) {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }

    // Reject if already verified — timestamps are immutable
    if (snippet.on_chain_hash) {
      return NextResponse.json(
        {
          error:
            "Snippet is already verified on-chain. Timestamps are immutable.",
          data: {
            snippetId: id,
            onChainHash: snippet.on_chain_hash,
            transactionHash: snippet.transaction_hash,
            verifiedAt: snippet.verified_at,
            createdAt: snippet.created_at,
          },
        },
        { status: 409 },
      );
    }

    // Generate SHA-256 hash of snippet content
    const onChainHash = generateSnippetHash(
      snippet.title,
      snippet.description || "",
      snippet.code,
      snippet.language,
      snippet.tags || [],
    );

    // Use the snippet's original creation timestamp as the proof-of-existence anchor
    const createdAt: string =
      snippet.created_at instanceof Date
        ? snippet.created_at.toISOString()
        : String(snippet.created_at);

    console.log("[verify] Anchoring snippet on Stellar:", {
      id,
      onChainHash,
      createdAt,
    });

    // Submit to Stellar — memo encodes snippetId + contentHash + createdAt
    const secretKey = process.env.STELLAR_SECRET_KEY || "";
    const stellarResult = await submitHashToStellar(
      secretKey,
      onChainHash,
      id,
      createdAt,
    );

    if (!stellarResult.success) {
      return NextResponse.json(
        {
          error: "Failed to submit to Stellar blockchain",
          details: stellarResult.error,
        },
        { status: 502 },
      );
    }

    // Persist hash + tx hash — immutability enforced inside storeSnippetHash
    const updatedSnippet = await storeSnippetHash(
      id,
      onChainHash,
      stellarResult.transactionHash!,
    );

    return NextResponse.json({
      success: true,
      message: "Snippet creation timestamp anchored on Stellar blockchain",
      data: {
        snippetId: id,
        onChainHash,
        transactionHash: stellarResult.transactionHash,
        stellarMemo: stellarResult.memo,
        createdAt,
        verifiedAt: updatedSnippet.verified_at,
      },
    });
  } catch (error: any) {
    console.error("[verify] Error anchoring snippet:", error);

    // Surface immutability violations as 409
    if (error?.message?.includes("immutable")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Failed to anchor snippet on blockchain" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/snippets/[id]/verify
 *
 * Verifies snippet integrity by comparing the current content hash against
 * the hash stored on the Stellar blockchain at creation time.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const snippet = await getSnippetWithHash(id);
    if (!snippet) {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }

    if (!snippet.on_chain_hash) {
      return NextResponse.json({
        verified: false,
        snippetId: id,
        message: "This snippet has not been anchored on the blockchain yet.",
        onChainHash: null,
        transactionHash: null,
        verifiedAt: null,
        createdAt: snippet.created_at,
      });
    }

    const result = await verifySnippetIntegrity(
      id,
      snippet.title,
      snippet.description || "",
      snippet.code,
      snippet.language,
      snippet.tags || [],
    );

    return NextResponse.json({
      verified: result.isValid,
      snippetId: id,
      message: result.message,
      onChainHash: snippet.on_chain_hash,
      transactionHash: snippet.transaction_hash,
      verifiedAt: snippet.verified_at,
      createdAt: snippet.created_at,
    });
  } catch (error) {
    console.error("[verify] Error verifying snippet:", error);
    return NextResponse.json(
      { error: "Failed to verify snippet integrity" },
      { status: 500 },
    );
  }
}