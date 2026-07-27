import { NextResponse } from "next/server";
import { CleanupService } from "@/lib/cleanup.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    // Enforce cron job authorization
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cleanupService = new CleanupService();
    const result = await cleanupService.run();

    return NextResponse.json({
      success: true,
      message: "Scheduled cleanup jobs executed successfully.",
      data: result,
    });
  } catch (error) {
    console.error("[Cron/Cleanup] Error executing cleanup jobs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup execution failed",
      },
      { status: 500 }
    );
  }
}
