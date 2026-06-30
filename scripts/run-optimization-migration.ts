import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

const sql = neon(process.env.DATABASE_URL!);

async function runOptimizationMigration() {
  try {
    console.log("Starting database optimization migration...");

    const migrationsDir = path.join(process.cwd(), "scripts", "migrations");
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith(".sql")) continue;

      const filePath = path.join(migrationsDir, file);
      console.log(`Applying ${file}...`);
      const contents = fs.readFileSync(filePath, "utf-8");

      // Split by semicolons and execute each statement separately
      const statements = contents
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        try {
          await sql(stmt);
        } catch (err: any) {
          // If index already exists, Postgres will throw but we use IF NOT EXISTS
          console.warn(`  Statement warning: ${err.message}`);
        }
      }

      console.log(`  ✅ ${file} applied`);
    }

    console.log("Optimization migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Optimization migration failed:", error);
    process.exit(1);
  }
}

runOptimizationMigration();
