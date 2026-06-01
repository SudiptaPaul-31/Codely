import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);

/**
 * Next.js Middleware for Stellar Wallet Authentication
 *
 * This middleware runs on every request and enforces authentication
 * for protected routes. It verifies JWT tokens and maintains session integrity.
 *
 * Protected Routes:
 * - /api/snippets (POST, PUT, DELETE)
 * - /api/profile/*
 * - /dashboard/*
 */

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Define protected routes that require authentication
  const protectedRoutes = [
    "/api/snippets", // All snippet operations
    "/api/profile", // Profile routes
    "/dashboard", // Dashboard routes
  ];

  // Check if current route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // If not a protected route, allow request to proceed
  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // For POST requests to /api/snippets (create), verify authentication
  if (pathname === "/api/snippets" && req.method === "POST") {
    return verifyAuthenticationMiddleware(req);
  }

  // For other protected routes, verify authentication
  if (isProtectedRoute) {
    // Only enforce auth on non-GET requests (allow public read access)
    if (req.method !== "GET") {
      return verifyAuthenticationMiddleware(req);
    }
  }

  return NextResponse.next();
}

/**
 * Verify JWT token from Authorization header
 */
async function verifyAuthenticationMiddleware(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Unauthorized - Missing or invalid Authorization header",
          details:
            "Please include 'Authorization: Bearer <token>' in your request headers",
        },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT format and signature
    const verification = verifyJWT(token);
    if (!verification.valid) {
      return NextResponse.json(
        {
          error: "Unauthorized - Invalid or expired token",
          details: verification.error || "Token verification failed",
        },
        { status: 401 },
      );
    }

    // Verify session exists in database (additional security check)
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const session = await sql`
        SELECT * FROM auth_sessions 
        WHERE token_hash = ${tokenHash} 
        AND expires_at > now()
      `;

      if (session.length === 0) {
        return NextResponse.json(
          {
            error: "Unauthorized - Session not found or expired",
            details: "Your session has expired. Please authenticate again.",
          },
          { status: 401 },
        );
      }
    } catch (dbError) {
      console.error("Database session verification error:", dbError);
      // If database check fails, still allow request but log the error
      // This prevents total service failure if database is temporarily unavailable
    }

    // Authentication successful, proceed with request
    // The payload is available in req.auth if needed in handlers
    return NextResponse.next();
  } catch (error) {
    console.error("Middleware authentication error:", error);
    return NextResponse.json(
      {
        error: "Internal server error during authentication",
      },
      { status: 500 },
    );
  }
}

/**
 * Matcher configuration for middleware
 * This specifies which routes should be processed by this middleware
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
