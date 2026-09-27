import { NextResponse } from "next/server";
import { SnippetRepository } from "../../snippet.repository";
import { SnippetService } from "../../snippet.service";

const service = new SnippetService(new SnippetRepository());

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json(await service.getOwnershipProof(id));
  } catch (error) {
    return NextResponse.json(
      { verified: false, error: error instanceof Error ? error.message : "Failed to verify ownership proof" },
      { status: 404 },
    );
  }
}