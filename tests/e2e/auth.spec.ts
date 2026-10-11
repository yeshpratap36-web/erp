import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { NEW_PASSWORD, SEED_PASSWORD, TEST_DATABASE_URL } from "./env";

// Each project (desktop / mobile) gets its own seeded accounts so runs don't collide.
function accounts(projectName: string) {
  const mobile = projectName === "mobile";
  return {
    faculty: mobile ? "FAC002" : "FAC001",
    student: mobile ? "26CSE002" : "26CSE001",
    lockout: mobile ? "26CSE011" : "26CSE010",
  };
}

// The form's own alert (Next.js also renders a hidden role="alert" route announcer).
const formAlert = (page: Page) => page.locator('[data-slot="alert"]');

async function login(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Save password" }).click();
}

test("anonymous users are sent to login, APIs get 401", async ({ page, request }) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fstudent$/);
  const res = await request.get("/api/me");
  expect(res.status()).toBe(401);
});

test("wrong password shows a generic error", async ({ page }) => {
  await login(page, "nobody-here", "wrong-password");
  await expect(formAlert(page)).toContainText("Incorrect login ID or password");
});

test("faculty: forced password change, then role-scoped access", async ({ page }, testInfo) => {
  const { faculty } = accounts(testInfo.project.name);

  await login(page, faculty, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/change-password$/);

  // Nothing else is reachable before the password is changed.
  await page.goto("/faculty");
  await expect(page).toHaveURL(/\/change-password$/);

  // Weak password is rejected server-side.
  await changePassword(page, SEED_PASSWORD, "weakpass");
  await expect(page.locator("#newPassword-error")).toHaveText("At least 10 characters");

  await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/faculty$/);
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

  // Other role areas bounce back home; the API reports the right role.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/faculty$/);
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).data.role).toBe("FACULTY");

  // Old password no longer works; new one does.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, faculty, SEED_PASSWORD);
  await expect(formAlert(page)).toBeVisible();
  await login(page, faculty, NEW_PASSWORD);
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
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(403);
});

test("account locks after repeated failures", async ({ page }, testInfo) => {
  const { lockout } = accounts(testInfo.project.name);

  for (let i = 0; i < 4; i++) {
    await login(page, lockout, "Wrong#Password1");
    await expect(formAlert(page)).toContainText("Incorrect login ID or password");
  }
  await login(page, lockout, "Wrong#Password1");
  await expect(formAlert(page)).toContainText("temporarily locked");

  // Even the correct password is refused while locked.
  await login(page, lockout, SEED_PASSWORD);
  await expect(formAlert(page)).toContainText("temporarily locked");
});

test("revoked sessions are rejected on the next request", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses the single admin account");

  await login(page, "admin", SEED_PASSWORD);
  await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  // Simulate an admin password reset / deactivation elsewhere: bump sessionVersion in the DB.
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query(
    `UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE "loginId" = 'admin'`,
  );
  await db.end();

  // The JWT is still cryptographically valid, but the server-side check rejects it.
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});
