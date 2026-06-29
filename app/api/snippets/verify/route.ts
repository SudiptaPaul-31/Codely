import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "../verification.service";
import { VerificationRepository } from "../verification.repository";
import { verifySnippetSchema } from "../verification.validator";
import { ZodError } from "zod";
import { rateLimit } from "@/lib/rateLimiter";
import { ActivityLogger } from "@/lib/activity-logger";

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// Dependency Injection instantiation
const repository = new VerificationRepository();
const service = new VerificationService(repository);
const activityLogger = new ActivityLogger();

/**
 * Parse verification request from JSON body
 */
async function parseVerifyRequest(req: NextRequest): Promise<any> {
  return await req.json();
}

/**
 * Extract client IP address from request headers
 */
function extractIpAddress(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/snippets/verify
 * Verify ownership of a snippet by validating cryptographic signature
 */
export async function POST(req: NextRequest) {
  try {
    // Extract client IP for rate limiting and logging
    const ip = extractIpAddress(req);

    // Apply rate limiting
    const limit = rateLimit(`verify-snippet:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX_REQUESTS,
    });

    if (!limit.allowed) {
      console.warn("[security] Snippet verification rate limit exceeded:", {
        ip,
      });

      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          limit: RATE_LIMIT_MAX_REQUESTS,
          window: `${RATE_LIMIT_WINDOW_MS / 1000}s`,
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await parseVerifyRequest(req);

    // Validate request body using schema
    const validatedData = verifySnippetSchema.parse(body);

    // Call service to verify ownership
    const verificationRecord = await service.verifyOwnership(
      validatedData.snippetId,
      validatedData.walletAddress,
      validatedData.signature,
      validatedData.message,
      ip
    );

    

    console.log(
      `[API] Snippet verification successful for snippet: ${validatedData.snippetId}`
    );

    return NextResponse.json(verificationRecord, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("[API] Validation error in verify endpoint:", error.errors);
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("[API] Error verifying snippet:", errorMessage);

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}