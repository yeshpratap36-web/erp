import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./tests/e2e/env";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Students mostly use phones — key flows also run at mobile size.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Production build against the dedicated e2e database, on its own port.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
});
