import { NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { CleanupRepository } from "@/lib/cleanup.repository";
import { CleanupService, loadCleanupConfig } from "@/lib/cleanup.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new CleanupService(new CleanupRepository());
    const summary = await service.run(loadCleanupConfig());

    console.log("[Cron/Cleanup] Summary:", JSON.stringify(summary));
    await logEvent("cleanup_run", "system", undefined, JSON.stringify(summary));

    return NextResponse.json({
      success: true,
      message: "Cleanup completed successfully",
      data: summary,
    });
  } catch (error) {
    console.error("[Cron/Cleanup] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      },
      { status: 500 },
    );
  }
}
