import { neon } from "@neondatabase/serverless";

export async function logEvent(event: string, wallet: string, target?: string, details?: string) {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const sql = neon(url);
  
  try {
    await sql`
      INSERT INTO audits (event, wallet, target, details)
      VALUES (${event}, ${wallet}, ${target || null}, ${details || null})
    `;
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}
