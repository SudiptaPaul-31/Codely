import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { FolderRepository } from "../folder.repository";
import { FolderService } from "../folder.service";
import { updateFolderSchema } from "../folder.validator";

const repo = new FolderRepository();
const service = new FolderService(repo);

function extractWallet(req: NextRequest): string | null {
  return (
    req.headers.get("x-wallet-address") ||
    req.headers.get("x-verified-wallet") ||
    null
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const folder = await service.getFolderById(id);

    const callerWallet = extractWallet(req);
    if (folder.owner_wallet_address !== callerWallet) {
      return NextResponse.json(
        { error: "Unauthorized: this folder is private" },
        { status: 403 },
      );
    }

    return NextResponse.json(folder);
  } catch (err) {
    const status = err instanceof Error && err.message === "Folder not found" ? 404 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const data = updateFolderSchema.parse(body);
    const updated = await service.updateFolder(id, data, callerWallet);

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.errors }, { status: 400 });
    }
    const status =
      err instanceof Error && err.message.startsWith("Unauthorized") ? 403 :
      err instanceof Error && err.message === "Folder not found" ? 404 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const callerWallet = extractWallet(req);
    if (!callerWallet) {
      return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    }

    await service.deleteFolder(id, callerWallet);
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
