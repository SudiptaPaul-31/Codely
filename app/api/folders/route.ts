import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { FolderRepository } from "./folder.repository";
import { FolderService } from "./folder.service";
import { createFolderSchema } from "./folder.validator";

const repo = new FolderRepository();
const service = new FolderService(repo);

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

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet query param or x-wallet-address header required" },
        { status: 400 },
      );
    }

    const folders = await service.getFoldersByOwner(wallet);
    return NextResponse.json({ data: folders });
  } catch (err) {
    console.error("[folders] GET error:", err);
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
        { error: "x-wallet-address header is required to create a folder" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const data = createFolderSchema.parse(body);
    const folder = await service.createFolder(data, callerWallet);

    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.errors },
        { status: 400 },
      );
    }
    console.error("[folders] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
