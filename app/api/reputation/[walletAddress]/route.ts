import { NextResponse } from "next/server";
import { getReputation, getReputationActions, getReputationBadge } from "@/lib/reputation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    const score = await getReputation(walletAddress);
    const actions = await getReputationActions(walletAddress);
    const badge = getReputationBadge(score);

    return NextResponse.json({
      score,
      badge,
      actions,
    });
  } catch (error: any) {
    console.error("Error fetching reputation API:", error);
    return NextResponse.json(
      { error: "Failed to fetch reputation data" },
      { status: 500 }
    );
  }
}
