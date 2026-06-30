import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { FavoritesRepository } from "../favorites.repository";
import { FavoritesService } from "../favorites.service";
import { SnippetRepository } from "../../snippets/snippet.repository";

const favoritesRepository = new FavoritesRepository();
const snippetRepository = new SnippetRepository();
const favoritesService = new FavoritesService(favoritesRepository, snippetRepository);

async function handlerPOST(req: NextRequest, { params }: { params: Promise<{ snippetId: string }> }) {
  try {
    const { snippetId } = await params;
    const auth = (req as any).auth;
    const walletAddress = auth.walletAddress;

    const favorite = await favoritesService.addFavorite(walletAddress, snippetId);

    return NextResponse.json({ data: favorite, message: "Favorite added successfully" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Snippet not found") {
      return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Favorite already exists") {
      return NextResponse.json({ error: "Favorite already exists" }, { status: 409 });
    }
    console.error("[API] Error adding favorite:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

async function handlerDELETE(req: NextRequest, { params }: { params: Promise<{ snippetId: string }> }) {
  try {
    const { snippetId } = await params;
    const auth = (req as any).auth;
    const walletAddress = auth.walletAddress;

    const removed = await favoritesService.removeFavorite(walletAddress, snippetId);

    if (!removed) {
      return NextResponse.json({ message: "Favorite not found" }, { status: 200 });
    }

    return NextResponse.json({ message: "Favorite removed successfully" });
  } catch (error) {
    console.error("[API] Error removing favorite:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export const POST = withAuth(handlerPOST);
export const DELETE = withAuth(handlerDELETE);
