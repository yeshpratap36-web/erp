export const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://erp:erp@localhost:5432/college_erp_test?schema=public";

export const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe@123";
export const NEW_PASSWORD = "Fresh#Start2026";
