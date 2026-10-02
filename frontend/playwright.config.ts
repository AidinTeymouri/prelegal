import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// E2E tests run against a production build (`next build && next start`).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Always build and serve the current code; a leftover server on the port fails loudly.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
