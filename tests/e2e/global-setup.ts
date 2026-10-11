import { execSync } from "node:child_process";
import pg from "pg";
import {
  ADMIN_DATABASE_URL,
  TEST_DATABASE_NAME,
  TEST_DATABASE_URL,
  TEST_DB_NAME_PATTERN,
} from "./env";

/** Create this run's database, apply migrations, seed it. Never touches existing databases. */
export default async function globalSetup() {
  if (!TEST_DB_NAME_PATTERN.test(TEST_DATABASE_NAME))
    throw new Error(`Unexpected test DB name ${TEST_DATABASE_NAME}`);
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } finally {
    await admin.end();
  }
  execSync("pnpm prisma migrate deploy && pnpm prisma db seed", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
