import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { CollectionRepository } from "./collection.repository";
import { CollectionService } from "./collection.service";
import { createCollectionSchema } from "./collection.validator";

const repo = new CollectionRepository();
const service = new CollectionService(repo);

function extractWallet(req: NextRequest): string | null {
  return (
    req.headers.get("x-wallet-address") ||
    req.headers.get("x-verified-wallet") ||
    null
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet") || extractWallet(req);
    const publicOnly = searchParams.get("public") === "true";

    if (publicOnly) {
      const collections = await service.getPublicCollections();
      return NextResponse.json({ data: collections });
    }

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet query param or x-wallet-address header required" },
        { status: 400 },
      );
    }

    const collections = await service.getCollectionsByOwner(wallet);
    return NextResponse.json({ data: collections });
  } catch (err) {
    console.error("[collections] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json(
        { error: "x-wallet-address header is required to create a collection" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const data = createCollectionSchema.parse(body);
    const collection = await service.createCollection(data, callerWallet);

    return NextResponse.json(collection, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.errors },
        { status: 400 },
      );
    }
    console.error("[collections] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
