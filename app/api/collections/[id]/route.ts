import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { CollectionRepository } from "../collection.repository";
import { CollectionService } from "../collection.service";
import { updateCollectionSchema } from "../collection.validator";

const repo = new CollectionRepository();
const service = new CollectionService(repo);

function extractWallet(req: NextRequest): string | null {
  return (
    req.headers.get("x-wallet-address") ||
    req.headers.get("x-verified-wallet") ||
    null
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const collection = await service.getCollectionById(params.id);
    return NextResponse.json(collection);
  } catch (err) {
    const status = err instanceof Error && err.message === "Collection not found" ? 404 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const data = updateCollectionSchema.parse(body);
    const updated = await service.updateCollection(params.id, data, callerWallet);

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    const status =
      err instanceof Error && err.message.startsWith("Unauthorized") ? 403 :
      err instanceof Error && err.message === "Collection not found" ? 404 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    }

    await service.deleteCollection(params.id, callerWallet);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status =
      err instanceof Error && err.message.startsWith("Unauthorized") ? 403 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}
