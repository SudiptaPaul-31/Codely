import { NextRequest, NextResponse } from "next/server";
import { ShareRepository } from "../../share.repository";
import { SnippetRepository } from "../../snippet.repository";
import { ShareService } from "../../share.service";

const repository = new SnippetRepository();
const shareRepository = new ShareRepository();
const shareService = new ShareService(shareRepository, repository);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Share token is required" },
        { status: 400 },
      );
    }

    const result = await shareService.getSharedSnippet(token);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired share link" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      snippet: result.snippet,
      isReadOnly: result.isReadOnly,
      shareUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/snippets/shared/${token}`,
    });
  } catch (error) {
    console.error("[Shared] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch shared snippet" },
      { status: 500 },
    );
  }
}