#!/usr/bin/env node
/**
 * Relai CRM — Interactive Setup Wizard
 *
 * Usage: npx tsx scripts/setup.ts
 *
 * Walks through:
 * 1. Database connection
 * 2. Run migrations
 * 3. Create admin user
 * 4. Create organization
 */

import { createInterface } from "readline";
import { execSync } from "child_process";
import crypto from "crypto";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("");
  console.log("  Relai CRM — Setup Wizard");
  console.log("  ========================");
  console.log("");

  // Step 1: Database
  const dbUrl = await ask("? Database URL", "postgres://relai:relai_password@localhost:5432/relai");
  if (!dbUrl) {
    console.error("Database URL is required.");
    process.exit(1);
  }

  console.log("");
  console.log("  Connecting to database...");

  // Verify connection
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
    await sql`SELECT 1`;
    await sql.end();
    console.log("  ✓ Connected to database");
  } catch (err: any) {
    console.error(`  ✗ Connection failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Run migrations
  console.log("");
  console.log("  Running migrations...");

  const postgres = (await import("postgres")).default;
  const sql = postgres(dbUrl, { max: 5 });

  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Read and run migration files
  const fs = await import("fs");
  const path = await import("path");
  const migrationsDir = path.resolve(import.meta.dirname || ".", "../supabase/migrations");

  let migrationFiles: string[] = [];
  try {
    migrationFiles = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.error("  ✗ Could not read migrations directory. Run this script from the repo root.");
    process.exit(1);
  }

  const applied = await sql`SELECT name FROM _migrations`;
  const appliedSet = new Set(applied.map((r) => r.name));

  let ranCount = 0;
  for (const file of migrationFiles) {
    if (appliedSet.has(file)) continue;

    const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    // Skip Supabase-specific migrations in self-hosted mode
    if (content.includes("auth.users") || content.includes("supabase_realtime") || content.includes("pg_cron")) {
      console.log(`  - Skipped ${file} (Supabase-specific)`);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      continue;
    }

    try {
      await sql.unsafe(content);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      ranCount++;
    } catch (err: any) {
      // Some migrations may fail if tables already exist — continue
      if (err.message?.includes("already exists")) {
        await sql`INSERT INTO _migrations (name) VALUES (${file})`;
        continue;
      }
      console.error(`  ✗ Migration ${file} failed: ${err.message}`);
      // Continue with other migrations
    }
  }

  console.log(`  ✓ Ran ${ranCount} migrations (${migrationFiles.length} total, ${migrationFiles.length - ranCount} already applied or skipped)`);

  // Step 3: Create admin user
  console.log("");
  const adminEmail = await ask("? Admin email", "admin@example.com");
  const adminPassword = await askPassword("? Admin password");

  if (!adminPassword || adminPassword.length < 6) {
    console.error("  Password must be at least 6 characters.");
    process.exit(1);
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const userId = crypto.randomUUID();

  try {
    await sql`
      INSERT INTO app_users (id, email, password_hash, email_confirmed_at)
      VALUES (${userId}, ${adminEmail}, ${passwordHash}, now())
      ON CONFLICT (email) DO NOTHING
    `;
    console.log("  ✓ Created admin user");
  } catch (err: any) {
    if (err.message?.includes("duplicate") || err.message?.includes("already exists")) {
      console.log("  ✓ Admin user already exists");
      const existing = await sql`SELECT id FROM app_users WHERE email = ${adminEmail} LIMIT 1`;
      if (existing[0]) {
        (userId as any) = existing[0].id;
      }
    } else {
      console.error(`  ✗ Failed to create admin user: ${err.message}`);
    }
  }

  // Step 4: Create organization
  console.log("");
  const orgName = await ask("? Organization name", "My Company");
  const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "org";
  const orgId = crypto.randomUUID();

  try {
    await sql`
      INSERT INTO organizations (id, name, slug, plan)
      VALUES (${orgId}, ${orgName}, ${orgSlug + "-" + Date.now().toString(36)}, 'free')
    `;

    // Create profile + role for admin
    await sql`
      INSERT INTO profiles (user_id, email, full_name, org_id)
      VALUES (${userId}, ${adminEmail}, 'Admin', ${orgId})
      ON CONFLICT (user_id) DO UPDATE SET org_id = ${orgId}
    `;

    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${userId}, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING
    `;

    console.log("  ✓ Created organization");
  } catch (err: any) {
    console.error(`  ✗ Failed to create organization: ${err.message}`);
  }

  await sql.end();

  // Step 5: Generate .env
  const authSecret = crypto.randomBytes(32).toString("hex");

  console.log("");
  console.log("  ✓ Setup complete!");
  console.log("");
  console.log("  Add these to your .env file:");
  console.log("  ─────────────────────────────");
  console.log(`  VITE_CRM_MODE=self-hosted`);
  console.log(`  VITE_API_URL=http://localhost:3001`);
  console.log(`  DATABASE_URL=${dbUrl}`);
  console.log(`  AUTH_SECRET=${authSecret}`);
  console.log(`  API_PORT=3001`);
  console.log(`  CORS_ORIGIN=http://localhost:8080`);
  console.log("");
  console.log("  Then run:");
  console.log("    pnpm --filter @relai/api dev   # Start API server");
  console.log("    pnpm --filter web dev           # Start frontend");
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
