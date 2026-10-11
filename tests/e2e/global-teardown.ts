import pg from "pg";
import { ADMIN_DATABASE_URL, TEST_DATABASE_NAME, TEST_DB_NAME_PATTERN } from "./env";

/** Drop this run's database (set E2E_KEEP_DB=1 to keep it for debugging). */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DB === "1") {
    console.log(`Keeping e2e database ${TEST_DATABASE_NAME}`);
    return;
  }
  // Only ever drop a database this suite created.
  if (!TEST_DB_NAME_PATTERN.test(TEST_DATABASE_NAME))
    throw new Error(`Refusing to drop ${TEST_DATABASE_NAME}`);
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    // The web server may still hold connections at this point.
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
