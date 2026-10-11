import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./env";

/**
 * Resets the dedicated e2e database (never the dev DB) and seeds it.
 * Set E2E_SKIP_DB_RESET=1 when the database was already prepared (e.g. a fresh CI database
 * prepared with `prisma migrate deploy && prisma db seed`).
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_DB_RESET === "1") return;
  execSync("pnpm prisma migrate reset --force && pnpm prisma db seed", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
