import { NextRequest, NextResponse } from "next/server";
import { OwnershipMiddleware } from "../snippets/ownership.middleware";
import { FavoriteRepository } from "./favorite.repository";
import { FavoriteService } from "./favorite.service";

const repository = new FavoriteRepository();
const service = new FavoriteService(repository);

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address not found" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "20", 10), 1),
      100
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const result = await service.getFavorites(walletAddress, { limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error fetching favorites:", error);
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await OwnershipMiddleware.extractWalletAddress(req);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { snippetId } = body;

    if (!snippetId) {
      return NextResponse.json(
        { error: "Snippet ID is required" },
        { status: 400 }
      );
    }

    const result = await service.toggleFavorite(walletAddress, snippetId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error toggling favorite:", error);
    return NextResponse.json(
      { error: "Failed to toggle favorite" },
      { status: 500 }
    );
  }
}
