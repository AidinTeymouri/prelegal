"use client";

import dynamic from "next/dynamic";

// Rendered only in the browser: the form defaults the effective date to the
// user's local "today", which could differ from the server's date and cause a
// hydration mismatch.
export const DocumentBuilderClient = dynamic(() => import("@/components/DocumentBuilder").then((m) => m.DocumentBuilder), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-zinc-500">Loading…</p>,
});
