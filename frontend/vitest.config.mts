import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // West of UTC, so parsing a date as UTC instead of local shifts it back a day
    // and the tests catch it. e2e/nda.spec.ts also covers a zone east of UTC.
    env: { TZ: "America/Los_Angeles" },
    // Long enough for the real PDF render in NdaPdf.test.tsx.
    testTimeout: 20_000,
  },
});
