import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// E2E tests run against the production setup: the static export (`next build`)
// served by the FastAPI backend, with its own throwaway database.
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
    command: `npm run build && cd ../backend && uv run uvicorn app.main:app --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: { DATABASE_PATH: path.join(os.tmpdir(), "prelegal-e2e.db") },
    // Always build and serve the current code; a leftover server on the port fails loudly.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
