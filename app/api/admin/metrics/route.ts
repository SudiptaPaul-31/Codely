import { NextResponse } from 'next/server';
import { neon } from "@neondatabase/serverless";
import { logEvent } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
      await logEvent("admin_unauthorized_access", "UNKNOWN", undefined, "Failed metrics export attempt");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json({ error: "Database misconfigured" }, { status: 500 });
    }

    const sql = neon(url);
    const logs = await sql`
      SELECT * FROM audits 
      ORDER BY created_at DESC 
      LIMIT 1000
    `;
    
    await logEvent("metrics_exported", "SYSTEM_ADMIN", undefined, `Exported ${logs.length} logs for monitoring`);

    return NextResponse.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error: any) {
    console.error('[Metrics Export] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
