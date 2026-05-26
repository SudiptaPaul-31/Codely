import { NextRequest, NextResponse } from "next/server";
import { SnippetService } from "./snippet.service";
import { SnippetRepository } from "./snippet.repository";
import { OwnershipMiddleware } from "./ownership.middleware";
import { ZodError } from "zod";
import { rateLimit } from "@/lib/rateLimiter";
import { SearchSnippetsOptions } from "./snippet.repository";

// Default pagination settings
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

// Dependency Injection instantiation
const repository = new SnippetRepository();
const service = new SnippetService(repository);

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseSearchOptions(req: NextRequest): SearchSnippetsOptions {
  const { searchParams } = new URL(req.url);
  const rawTags = searchParams.get("tags");

  return {
    limit: parseBoundedInteger(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: parseBoundedInteger(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
    title: searchParams.get("title")?.trim() || undefined,
    language: searchParams.get("language")?.trim() || undefined,
    keyword: searchParams.get("keyword")?.trim() || undefined,
    tags:
      rawTags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) || undefined,
  };
}

function hasSearchFilters(options: SearchSnippetsOptions) {
  return Boolean(
    options.title ||
      options.language ||
      options.keyword ||
      (options.tags && options.tags.length > 0),
  );
}

export async function GET(req: NextRequest) {
  try {
    const options = parseSearchOptions(req);
    const result = hasSearchFilters(options)
      ? await service.searchSnippets(options)
      : await service.getAllSnippets({
          limit: options.limit,
          offset: options.offset,
        });

    return NextResponse.json({
      ...result,
      filters: {
        title: options.title ?? null,
        language: options.language ?? null,
        tags: options.tags ?? [],
        keyword: options.keyword ?? null,
      },
    });
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
