/**
 * Every Playwright run gets its own freshly created database, named from a run id that
 * playwright.config.ts fixes once (workers inherit it through the environment).
 * Nothing pre-existing is ever reset: global-setup creates + migrates + seeds the new
 * database, global-teardown drops exactly that database.
 */
process.env.E2E_RUN_ID ??= String(Date.now());

/** Connection to the server's maintenance database (used to CREATE / DROP the run's DB). */
export const ADMIN_DATABASE_URL =
  process.env.E2E_ADMIN_DATABASE_URL ?? "postgresql://erp:erp@localhost:5432/postgres";

export const TEST_DATABASE_NAME = `college_erp_e2e_${process.env.E2E_RUN_ID}`;
export const TEST_DB_NAME_PATTERN = /^college_erp_e2e_\d+$/;

export const TEST_DATABASE_URL = (() => {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${TEST_DATABASE_NAME}`;
  url.searchParams.set("schema", "public");
  return url.toString();
})();

export const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? "http://localhost:8001";

export const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe@123";
export const NEW_PASSWORD = "Fresh#Start2026";
