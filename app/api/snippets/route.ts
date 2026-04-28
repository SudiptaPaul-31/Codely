import { NextRequest, NextResponse } from "next/server";
import { SnippetService } from "./snippet.service";
import { SnippetRepository } from "./snippet.repository";
import { OwnershipMiddleware } from "./ownership.middleware";
import { ZodError } from "zod";
import { rateLimit } from "@/lib/rateLimiter";

// Default pagination settings
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

// Dependency Injection instantiation
const repository = new SnippetRepository();
const service = new SnippetService(repository);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Parse pagination parameters with validation
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10),
      MAX_LIMIT
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // Handle backward compatibility: if no pagination params, return all (first page)
    const result = await service.getAllSnippets({ limit, offset });
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Error fetching snippets:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const limit = rateLimit(`snippet-create:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX_REQUESTS,
    });

    if (!limit.allowed) {
      console.warn('[security] Snippet creation rate limit exceeded:', { ip });

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          limit: RATE_LIMIT_MAX_REQUESTS,
          window: `${RATE_LIMIT_WINDOW_MS / 1000}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();

    // Extract and inject the wallet address securely from headers
    const walletAddress = OwnershipMiddleware.extractWalletAddress(req);
    if (walletAddress) {
      body.ownerWalletAddress = walletAddress;
    }

    const snippet = await service.createSnippet(body);

    return NextResponse.json(snippet, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}