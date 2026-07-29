import { NextRequest, NextResponse } from "next/server";
import { IPFSService } from "@/lib/ipfs.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  try {
    const { cid } = await params;
    if (!cid) {
      return NextResponse.json({ error: "CID is required" }, { status: 400 });
    }

    const content = await IPFSService.fetchFromIPFS(cid);
    return NextResponse.json({ content });
  } catch (error) {
    console.error("[IPFS API] Error fetching content:", error);
    return NextResponse.json(
      { error: "Failed to fetch content from IPFS" },
      { status: 500 }
    );
  }
}
