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
    const forks = await service.getSnippetForks(id);
    return NextResponse.json({
      snippetId: id,
      forks,
      total: forks.length,
    });
  } catch (error) {
    console.error("[API] Error fetching snippet forks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch snippet forks" },
      { status: 500 },
    );
  }
}
