/**
 * Examint — Set User Role CLI
 *
 * One-off / recovery tool to set a user's role directly in the database,
 * bypassing the app. Needed to create the very first DEVELOPER account
 * (who can then use the in-app User Management page to manage everyone
 * else), and useful again if the last Developer account is ever lost.
 *
 * Usage:
 *   node scripts/set-user-role.mjs <email> <ROLE>
 *   node scripts/set-user-role.mjs aakash8585raj@gmail.com DEVELOPER
 *
 * <ROLE> must be one of: ADMINISTRATOR, DEVELOPER, TEACHER, MANAGEMENT
 * (case-insensitive).
 *
 * Reads DATABASE_URL from `.env` in the project root if it isn't already
 * set in the environment, so it works the same way `npm run db:migrate`
 * does without requiring a separate `dotenv` dependency.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Loads KEY="value" pairs from `.env` into process.env if not already set. */
function loadEnvFile() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.trim().replace(/^"(.*)"$/, "$1");
    }
  }
}

const VALID_ROLES = ["ADMINISTRATOR", "DEVELOPER", "TEACHER", "MANAGEMENT"];

async function main() {
  loadEnvFile();

  const [, , email, role] = process.argv;

  if (!email || !role) {
    console.error("Usage: node scripts/set-user-role.mjs <email> <ROLE>");
    console.error(`<ROLE> must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const normalizedRole = role.toUpperCase();
  if (!VALID_ROLES.includes(normalizedRole)) {
    console.error(
      `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`
    );
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.error(`No user found with email "${normalizedEmail}".`);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { role: normalizedRole },
    });

    console.log(`Updated ${updated.email} -> role "${updated.role}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to update user role:", error);
  process.exit(1);
});
