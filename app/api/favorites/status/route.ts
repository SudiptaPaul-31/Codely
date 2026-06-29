import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../../snippets/ownership.middleware";
import { FavoriteRepository } from "../favorite.repository";
import { FavoriteService } from "../favorite.service";

const repository = new FavoriteRepository();
const service = new FavoriteService(repository);

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress) {
      return NextResponse.json({}, { status: 200 });
    }

    const body = await req.json();
    const { snippetIds } = body;

    if (!Array.isArray(snippetIds)) {
      return NextResponse.json(
        { error: "snippetIds must be an array" },
        { status: 400 }
      );
    }

    const statuses = await service.getFavoriteStatuses(walletAddress, snippetIds);
    return NextResponse.json(statuses);
  } catch (error) {
    console.error("[API] Error fetching favorite statuses:", error);
    return NextResponse.json({}, { status: 200 });
  }
}
