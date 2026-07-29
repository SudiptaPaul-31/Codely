import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "../snippets/analytics.service";

const analyticsService = new AnalyticsService();

export async function GET(req: NextRequest) {
  try {
    const aggregations = await analyticsService.getGlobalAggregations();
    return NextResponse.json(aggregations);
  } catch (error) {
    console.error("[Analytics API] Global GET Error:", error);
    return NextResponse.json({ error: "Failed to fetch global aggregations" }, { status: 500 });
  }
}
