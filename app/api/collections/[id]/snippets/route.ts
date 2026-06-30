import { NextRequest, NextResponse } from "next/server";
import { CollectionRepository } from "../../collection.repository";
import { CollectionService } from "../../collection.service";

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
    const callerWallet = extractWallet(req);
    const snippets = await service.getSnippets(params.id, callerWallet);
    return NextResponse.json({ data: snippets });
  } catch (err) {
    const status =
      err instanceof Error && err.message.startsWith("Unauthorized") ? 403 :
      err instanceof Error && err.message === "Collection not found" ? 404 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    }

    const { snippetId } = await req.json();
    if (!snippetId) {
      return NextResponse.json({ error: "snippetId is required" }, { status: 400 });
    }

    await service.addSnippet(params.id, snippetId, callerWallet);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const status =
      err instanceof Error && err.message.startsWith("Unauthorized") ? 403 : 500;
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

    const { snippetId } = await req.json();
    if (!snippetId) {
      return NextResponse.json({ error: "snippetId is required" }, { status: 400 });
    }

    await service.removeSnippet(params.id, snippetId, callerWallet);
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
