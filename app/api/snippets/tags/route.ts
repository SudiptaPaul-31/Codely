import { NextResponse } from "next/server";
import { SnippetRepository } from "../snippet.repository";

const repository = new SnippetRepository();

/**
 * GET /api/snippets/tags
 *
 * Returns all unique tags in use across non-deleted snippets,
 * ordered by usage count descending.
 *
 * Response:
 * {
 *   tags: Array<{ tag: string; count: number }>,
 *   total: number
 * }
 *
 * Usage:
 *   GET /api/snippets/tags
 *
 * Then filter snippets by tag:
 *   GET /api/snippets?tags=React,DSA
 */
export async function GET() {
  try {
    const tags = await repository.findAllTags();

    return NextResponse.json({
      tags,
      total: tags.length,
    });
  } catch (error) {
    console.error("[API] Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 },
    );
  }
}
