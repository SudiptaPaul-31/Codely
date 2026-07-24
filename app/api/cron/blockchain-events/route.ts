import { NextResponse } from "next/server";
import { BlockchainEventListenerRepository } from "@/lib/blockchain-event-listener.repository";
import {
  BlockchainEventListenerService,
  HttpBlockchainEventSource,
} from "@/lib/blockchain-event-listener.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new BlockchainEventListenerService(
      new BlockchainEventListenerRepository(),
      new HttpBlockchainEventSource(),
    );
    const summary = await service.sync();

    return NextResponse.json({
      success: true,
      message: "Blockchain events synchronized successfully",
      data: summary,
    });
  } catch (error) {
    console.error("[Cron/BlockchainEvents] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Blockchain sync failed",
      },
      { status: 500 },
    );
  }
}
