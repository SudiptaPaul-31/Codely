import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

/**
 * Middleware to verify JWT token in requests
 * Usage: Add to middleware.ts for protected routes
 */
export async function verifyAuthentication(req: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT
    const verification = verifyJWT(token);
    if (!verification.valid) {
      return null;
    }

    const { payload } = verification;

    // Verify session exists in database
    try {
      const crypto = require("crypto");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const session = await sql`
        SELECT * FROM auth_sessions 
        WHERE token_hash = ${tokenHash} 
        AND expires_at > now()
      `;

      if (session.length === 0) {
        return null;
      }
    } catch (error) {
      console.error("Error verifying session:", error);
      return null;
    }

    return payload;
  } catch (error) {
    console.error("Authentication error:", error);
    return null;
  }
}

/**
 * Higher-order function to protect API routes
 * Usage: const protectedGET = withAuth(GET);
 */
export function withAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const auth = await verifyAuthentication(req);

    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid or missing authentication token" },
        { status: 401 },
      );
    }

    // Add auth payload to request for use in handler
    (req as any).auth = auth;
    return handler(req);
  };
}

/**
 * Middleware that checks JWT for all requests and returns 401 if invalid
 * Add to middleware.ts or use in route groups
 */
export function authMiddleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Define protected routes
  const protectedRoutes = ["/api/snippets", "/api/profile"];

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // For protected routes, verify authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized - Missing authentication token" },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7);
  const verification = verifyJWT(token);

  if (!verification.valid) {
    return NextResponse.json(
      { error: "Unauthorized - Invalid authentication token" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}
