import { NextRequest, NextResponse } from "next/server";
import { createTransaction, getTransactionsByWallet } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const walletAddress = req.headers.get("x-wallet-address");
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address required" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");

    const data = await getTransactionsByWallet(walletAddress, page, pageSize);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[transactions] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = req.headers.get("x-wallet-address");
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address required" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { type, description, metadata } = body || {};

    if (!type) {
      return NextResponse.json(
        { error: "Transaction type is required" },
        { status: 400 },
      );
    }

    const tx = await createTransaction(
      walletAddress,
      type,
      description || null,
      metadata || null,
    );
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("[transactions] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 },
    );
  }
}
