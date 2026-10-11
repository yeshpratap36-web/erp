import { expect, test } from "@playwright/test";
import pg from "pg";
import { NEW_PASSWORD, SEED_PASSWORD, TEST_DATABASE_URL } from "./env";
import { changePassword, formAlert, login } from "./helpers";

// Seeded accounts used here (feature specs use others): FAC002, 26CSE001/002, 26CSE010/011, 26CSE012.
const accounts = (project: string) =>
  project === "mobile"
    ? { student: "26CSE002", lockout: "26CSE011" }
    : { student: "26CSE001", lockout: "26CSE010" };

test("anonymous users are sent to login, APIs get 401", async ({ page, request }) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fstudent$/);
  expect((await request.get("/api/me")).status()).toBe(401);
});

test("wrong password shows a generic error", async ({ page }) => {
  await login(page, "nobody-here", "wrong-password");
  await expect(formAlert(page)).toContainText("Incorrect login ID or password");
});

test("faculty: forced password change, then role-scoped access", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses a shared faculty account");
  await login(page, "FAC002", SEED_PASSWORD);
  await expect(page).toHaveURL(/\/change-password$/);

  await page.goto("/faculty");
  await expect(page).toHaveURL(/\/change-password$/);

  await changePassword(page, SEED_PASSWORD, "weakpass");
  await expect(page.locator("#newPassword-error")).toHaveText("At least 10 characters");

  await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/faculty$/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/faculty$/);
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).data.role).toBe("FACULTY");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "FAC002", SEED_PASSWORD);
  await expect(formAlert(page)).toBeVisible();
  await login(page, "FAC002", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/faculty$/);
});

test("student: after password change, onboarding blocks the dashboard", async ({
  page,
}, testInfo) => {
  const { student } = accounts(testInfo.project.name);
  await login(page, student.toLowerCase(), SEED_PASSWORD); // login ID is case-insensitive
  await expect(page).toHaveURL(/\/change-password$/);
  await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/onboarding\/consent$/);

  await page.goto("/student");
  await expect(page).toHaveURL(/\/onboarding\/consent$/);
  expect((await page.request.get("/api/me")).status()).toBe(403);
});

test("account locks after repeated failures", async ({ page }, testInfo) => {
  const { lockout } = accounts(testInfo.project.name);
  for (let i = 0; i < 4; i++) {
    await login(page, lockout, "Wrong#Password1");
    await expect(formAlert(page)).toContainText("Incorrect login ID or password");
  }
  await login(page, lockout, "Wrong#Password1");
  await expect(formAlert(page)).toContainText("temporarily locked");
  await login(page, lockout, SEED_PASSWORD);
  await expect(formAlert(page)).toContainText("temporarily locked");
});

test("revoked sessions are rejected on the next request", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses a single account");
  await login(page, "26CSE012", SEED_PASSWORD);
  await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/onboarding\/consent$/);

  // Simulate an admin password reset / deactivation elsewhere.
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query(
    `UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE "loginId" = '26CSE012'`,
  );
  await db.end();

  // Denied either by proxy.ts (this user is mid-onboarding → 403) or by the server-side
  // session check (401). The page visit below proves the session itself is dead.
  expect([401, 403]).toContain((await page.request.get("/api/me")).status());
  await page.goto("/onboarding/consent");
  await expect(page).toHaveURL(/\/login$/);
});
