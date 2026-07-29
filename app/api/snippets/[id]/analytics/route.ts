import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "../../analytics.service";
import { OwnershipMiddleware } from "../../ownership.middleware";

const analyticsService = new AnalyticsService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    if (!body.actionType) {
      return NextResponse.json({ error: "actionType is required" }, { status: 400 });
    }
    
    // Optional wallet address extraction for the log
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req).catch(() => null);

    const data = {
      snippetId: id,
      walletAddress: walletAddress,
      actionType: body.actionType,
    };

    const result = await analyticsService.logAction(data);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("[Analytics API] POST Error:", error);
    if (error.message && error.message.includes("Invalid action type")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to log action" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const aggregations = await analyticsService.getSnippetAggregations(id);
    return NextResponse.json(aggregations);
  } catch (error) {
    console.error("[Analytics API] GET Error:", error);
    return NextResponse.json({ error: "Failed to fetch aggregations" }, { status: 500 });
  }
}
