import { afterEach, describe, expect, it } from "vitest";
import { forgetStarted, isStartedHere, newId, startNewDocument } from "@/lib/newDocument";
import { parseHash } from "@/lib/route";

describe("newId", () => {
  it("makes version 4 UUIDs", () => {
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("works without crypto.randomUUID (plain HTTP)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});

describe("startNewDocument", () => {
  afterEach(() => (window.location.hash = ""));

  it("opens a new document and remembers it was started here", () => {
    startNewDocument();
    const route = parseHash(window.location.hash);
    expect(route.page).toBe("editor");
    const id = route.page === "editor" ? route.id : "";
    expect(isStartedHere(id)).toBe(true);
    forgetStarted(id);
    expect(isStartedHere(id)).toBe(false);
  });
});
