import { NextRequest, NextResponse } from "next/server";
import { LogRepository } from "./log.repository";
import { verifyJWT } from "@/lib/auth";

const repository = new LogRepository();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/logs
 *
 * Returns paginated, filtered activity log entries.
 * Requires a valid JWT in the Authorization header.
 *
 * Query parameters:
 *   page         – 1-based page number (default: 1)
 *   pageSize     – rows per page (default: 20, max: 100)
 *   action       – filter by action e.g. "snippet.created"
 *   actorWallet  – filter by wallet address
 *   resourceType – filter by resource type: "snippet" | "wallet"
 *   resourceId   – filter by resource ID
 *   from         – ISO date lower bound on created_at
 *   to           – ISO date upper bound on created_at
 */
export async function GET(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid Authorization header" },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7);
  const verification = await verifyJWT(token);
  if (!verification.valid) {
    return NextResponse.json(
      { error: "Unauthorized — invalid or expired token", details: verification.error },
      { status: 401 },
    );
  }

  // ── Parse query params ────────────────────────────────────
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10), 1),
      MAX_PAGE_SIZE,
    );

    const action = searchParams.get("action") ?? undefined;
    const actorWallet = searchParams.get("actorWallet") ?? undefined;
    const resourceType = searchParams.get("resourceType") ?? undefined;
    const resourceId = searchParams.get("resourceId") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;

    // Validate date params if provided
    if (from && isNaN(Date.parse(from))) {
      return NextResponse.json({ error: "Invalid 'from' date format" }, { status: 400 });
    }
    if (to && isNaN(Date.parse(to))) {
      return NextResponse.json({ error: "Invalid 'to' date format" }, { status: 400 });
    }

    const result = await repository.findAll({
      page,
      pageSize,
      action,
      actorWallet,
      resourceType,
      resourceId,
      from,
      to,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error fetching activity logs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
