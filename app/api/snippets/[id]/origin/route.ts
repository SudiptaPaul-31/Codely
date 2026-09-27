import { NextRequest, NextResponse } from "next/server";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";

const repository = new SnippetRepository();
const service = new SnippetService(repository);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const origin = await service.getSnippetOrigin(id);
    return NextResponse.json({
      snippetId: id,
      origin,
      isFork: Boolean(origin),
    });
  } catch (error) {
    console.error("[API] Error fetching snippet origin:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch snippet origin" },
      { status: 500 },
    );
  }
}
