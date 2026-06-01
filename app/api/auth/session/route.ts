import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/session
 * Verify the user's session.
 * The middleware already checks the JWT and auth_sessions database.
 * If this handler is reached, the session is valid.
 */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      valid: true,
      message: "Session is valid",
    },
    { status: 200 }
  );
}
