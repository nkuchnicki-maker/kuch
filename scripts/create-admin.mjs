// One-time bootstrap: creates the first admin user directly in the
// database, since there's no dashboard to do it from (unlike Supabase).
// After this, use the Admin page in the app to create everyone else.
//
// Usage:
//   node scripts/create-admin.mjs <email> <password> <username> <displayName>

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Next.js loads .env.local automatically; a standalone script has to do
// it manually.
function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const [, , email, password, username, displayName] = process.argv;

if (!email || !password || !username || !displayName) {
  console.error(
    "Usage: node scripts/create-admin.mjs <email> <password> <username> <displayName>",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("user:password@host")) {
  console.error("DATABASE_URL is not set in .env.local — set it first.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

const passwordHash = await bcrypt.hash(password, 10);

try {
  await pool.query(
    `insert into users (email, password_hash, username, display_name, is_admin, coin_balance)
     values ($1, $2, $3, $4, true, 1000)`,
    [email.toLowerCase().trim(), passwordHash, username.trim(), displayName.trim()],
  );
  console.log(`Admin user created: ${email}`);
} catch (err) {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
