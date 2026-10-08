import { describe, expect, it } from "vitest";
import { parseHash, routeHref } from "@/lib/route";

const ID = "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90";

describe("parseHash", () => {
  it.each(["", "#", "#/", "#/documents", "#/documents/", "#/settings", "#/documents/42", `#/documents/${ID}/extra`])(
    "shows the documents list for %j",
    (hash) => {
      expect(parseHash(hash)).toEqual({ page: "documents" });
    },
  );

  it("opens a document by id", () => {
    expect(parseHash(`#/documents/${ID}`)).toEqual({ page: "editor", id: ID });
    expect(parseHash(`#/documents/${ID.toUpperCase()}`)).toEqual({ page: "editor", id: ID });
  });

  it("round-trips with routeHref", () => {
    for (const route of [{ page: "documents" as const }, { page: "editor" as const, id: ID }]) {
      expect(parseHash(routeHref(route))).toEqual(route);
    }
  });
});
