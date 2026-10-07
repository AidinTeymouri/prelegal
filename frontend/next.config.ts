import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// `next build` writes a static export to out/, which the FastAPI backend serves
// together with the API on one origin. `next dev` can't use rewrites with a
// static export, so in development it is a normal app that forwards /api to the
// backend on port 8000 (start it with `uv run uvicorn app.main:app` in backend/).
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }],
    };
  }
  return { output: "export" };
}
