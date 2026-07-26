import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function buildAuditTable() {
  console.log(" Allocating database sectors for Audit Logging...");
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS audits (
        id SERIAL PRIMARY KEY,
        event VARCHAR(50) NOT NULL,
        wallet VARCHAR(255) NOT NULL,
        target VARCHAR(255),
        details TEXT,
        time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    console.log(" Building high-speed query indexes...");
    await sql`CREATE INDEX IF NOT EXISTS idx_audits_event ON audits(event);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audits_wallet ON audits(wallet);`;
    
    console.log(" Audit table architecture successfully deployed.");
  } catch (error) {
    console.error(" Database execution failed:", error);
  }
}

buildAuditTable().catch(console.error);
