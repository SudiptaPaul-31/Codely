import { neon } from "@neondatabase/serverless";

/**
 * Database Schema Verification Utility
 *
 * This script verifies that all required authentication tables and indexes
 * are properly created in the database.
 *
 * Usage: npx ts-node lib/verify-db-schema.ts
 */

const sql = neon(process.env.DATABASE_URL!);

interface TableInfo {
  name: string;
  exists: boolean;
  columns?: string[];
  error?: string;
}

async function verifyDatabaseSchema() {
  console.log("🔍 Verifying Database Schema for Stellar Authentication...\n");

  try {
    // Check database connection
    console.log("📡 Testing database connection...");
    await sql`SELECT 1`;
    console.log("✅ Database connection successful\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }

  const tables: { [key: string]: string[] } = {
    users: ["id", "wallet_address", "created_at", "updated_at"],
    auth_sessions: [
      "id",
      "wallet_address",
      "token_hash",
      "nonce",
      "expires_at",
      "created_at",
    ],
    login_nonces: [
      "id",
      "nonce",
      "wallet_address",
      "used",
      "expires_at",
      "created_at",
    ],
    snippets: [
      "id",
      "title",
      "language",
      "code",
      "owner",
      "created_at",
      "updated_at",
    ],
  };

  const results: TableInfo[] = [];

  for (const [tableName, requiredColumns] of Object.entries(tables)) {
    try {
      console.log(`Checking table: ${tableName}...`);

      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${tableName}
        )
      `;

      if (!tableExists[0].exists) {
        results.push({
          name: tableName,
          exists: false,
          error: "Table does not exist",
        });
        console.log(`❌ Table ${tableName} does not exist\n`);
        continue;
      }

      // Get columns
      const columns = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((col: any) => col.column_name);
      const missingColumns = requiredColumns.filter(
        (col) => !columnNames.includes(col),
      );

      if (missingColumns.length > 0) {
        results.push({
          name: tableName,
          exists: true,
          columns: columnNames,
          error: `Missing columns: ${missingColumns.join(", ")}`,
        });
        console.log(
          `⚠️ Table ${tableName} missing columns: ${missingColumns.join(", ")}\n`,
        );
      } else {
        results.push({
          name: tableName,
          exists: true,
          columns: columnNames,
        });
        console.log(`✅ Table ${tableName} exists with all required columns`);
        console.log(`   Columns: ${columnNames.join(", ")}\n`);
      }
    } catch (error: any) {
      results.push({
        name: tableName,
        exists: false,
        error: error.message,
      });
      console.log(`❌ Error checking table ${tableName}: ${error.message}\n`);
    }
  }

  // Check indexes
  console.log("Checking indexes...");
  const requiredIndexes = [
    "idx_users_wallet_address",
    "idx_auth_sessions_wallet_address",
    "idx_auth_sessions_expires_at",
    "idx_login_nonces_nonce",
    "idx_snippets_owner",
  ];

  const indexesExist: { [key: string]: boolean } = {};

  try {
    const indexes = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `;

    const existingIndexes = indexes.map((idx: any) => idx.indexname);

    for (const indexName of requiredIndexes) {
      const exists = existingIndexes.includes(indexName);
      indexesExist[indexName] = exists;
      console.log(
        `${exists ? "✅" : "⚠️"} Index ${indexName}: ${exists ? "exists" : "missing"}`,
      );
    }
  } catch (error: any) {
    console.error("Error checking indexes:", error.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  let allPassed = true;

  for (const result of results) {
    if (!result.exists) {
      console.log(`❌ ${result.name}: ${result.error}`);
      allPassed = false;
    } else if (result.error) {
      console.log(`⚠️ ${result.name}: ${result.error}`);
      allPassed = false;
    } else {
      console.log(`✅ ${result.name}: OK`);
    }
  }

  const missingIndexes = requiredIndexes.filter((idx) => !indexesExist[idx]);
  if (missingIndexes.length > 0) {
    console.log(`\n⚠️ Missing indexes: ${missingIndexes.join(", ")}`);
    console.log("   These are recommended for performance but not critical.");
  } else {
    console.log("✅ All indexes exist");
  }

  console.log("\n" + "=".repeat(60));

  if (allPassed && missingIndexes.length === 0) {
    console.log("✅ DATABASE SCHEMA VERIFICATION PASSED");
    console.log("All required tables and indexes are properly configured.");
    process.exit(0);
  } else if (allPassed) {
    console.log("⚠️ DATABASE SCHEMA PARTIALLY VERIFIED");
    console.log("All required tables exist but some indexes are missing.");
    console.log(
      "Recommendation: Run add-auth-tables.sql to create missing indexes.",
    );
    process.exit(0);
  } else {
    console.log("❌ DATABASE SCHEMA VERIFICATION FAILED");
    console.log("Please run the migration script: scripts/add-auth-tables.sql");
    process.exit(1);
  }
}

// Run verification
verifyDatabaseSchema().catch((error) => {
  console.error("Verification error:", error);
  process.exit(1);
});
