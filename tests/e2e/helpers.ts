import { expect, type Browser, type Page } from "@playwright/test";
import { NEW_PASSWORD, SEED_PASSWORD } from "./env";

/** The form's own alert (Next.js also renders a hidden role="alert" route announcer). */
export const formAlert = (page: Page) => page.locator('[data-slot="alert"]');

export async function login(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Login ID or email").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function changePassword(page: Page, current: string, next: string) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Save password" }).click();
}

/** Signs a seeded account in, completing the forced password change if it's the first login. */
export async function signInFresh(page: Page, identifier: string) {
  await login(page, identifier, SEED_PASSWORD);
  try {
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
  } catch {
    // Surface the form's message (e.g. a sign-in error) instead of a bare timeout.
    const alert = await formAlert(page)
      .allInnerTexts()
      .catch(() => []);
    throw new Error(
      `Sign-in as ${identifier} did not leave /login. Form says: ${alert.join(" | ") || "(nothing)"}`,
    );
  }
  if (new URL(page.url()).pathname === "/change-password") {
    await changePassword(page, SEED_PASSWORD, NEW_PASSWORD);
    await page.waitForURL((url) => url.pathname !== "/change-password");
  }
}

/** A new, isolated browser session (cookies) for another user. */
export async function newUserPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

/** Today's date (YYYY-MM-DD) in the institution's timezone. */
export function todayKey(timeZone = process.env.APP_TIMEZONE ?? "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function expectSuccess(page: Page) {
  await expect(page.locator('[data-testid="form-success"]')).toBeVisible();
}
