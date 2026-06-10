import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

async function runMigration() {
  try {
    console.log("Starting database initialization...");

    // 1. Run base tables (init-db.sql)
    const initDbPath = path.join(process.cwd(), "scripts", "init-db.sql");
    if (fs.existsSync(initDbPath)) {
      console.log("Applying init-db.sql...");
      const initDbSql = fs.readFileSync(initDbPath, "utf-8");
      
      // Neon serverless driver does not support running multiple statements in one query easily
      // if they contain complex types. We can split them by semicolon and run them one by one.
      // A better way is to use the transaction feature but neon() is a single connection stateless.
      // For simple init, we will try running the whole string.
      await sql(initDbSql);
      console.log("✅ init-db.sql applied successfully");
    }

    // 2. Run activity logs tables
    const activityLogsPath = path.join(process.cwd(), "scripts", "add-activity-logs.sql");
    if (fs.existsSync(activityLogsPath)) {
      console.log("Applying add-activity-logs.sql...");
      const activityLogsSql = fs.readFileSync(activityLogsPath, "utf-8");
      await sql(activityLogsSql);
      console.log("✅ add-activity-logs.sql applied successfully");
    }

    console.log("Database initialized successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
}

runMigration();
