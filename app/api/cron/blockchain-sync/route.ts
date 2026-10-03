import { NextResponse } from "next/server";
import { BlockchainSyncService } from "@/lib/blockchain-sync.service";

export const maxDuration = 300; // max Vercel timeout 5 minutes

export async function GET(request: Request) {
  try {
    // Optionally verify cron secret here if configured
    const authHeader = request.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const service = new BlockchainSyncService();
    await service.runSyncJob();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Cron/BlockchainSync] Error running job:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
