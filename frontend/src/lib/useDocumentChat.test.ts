import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/api";
import { applyChanges } from "@/lib/useDocumentChat";
import { data } from "@/testing/documents";

describe("applyChanges", () => {
  const sent: Draft = { document: "mutual-nda", fields: data("mutual-nda", { governingLaw: "Delaware" }) };
  const nda = (values: Record<string, string | number>, parties: { name?: string; company?: string }[] = []): Draft => ({
    document: "mutual-nda",
    fields: data("mutual-nda", { governingLaw: "Delaware", ...values }, parties),
  });

  it("applies the fields the assistant changed", () => {
    const returned = nda({ chosenCourts: "New Castle, DE", mndaTermYears: 2 }, [{ company: "Acme" }]);
    expect(applyChanges(sent, sent, returned)).toEqual(returned);
  });

  it("keeps edits made while waiting for the reply", () => {
    const current = nda({ purpose: "Hiring." }, [{ name: "Ada" }]);
    const returned = nda({ chosenCourts: "New Castle, DE" }, [{ company: "Acme" }]);

    expect(applyChanges(current, sent, returned)).toEqual(nda({ purpose: "Hiring.", chosenCourts: "New Castle, DE" }, [{ name: "Ada", company: "Acme" }]));
  });

  it("lets the assistant's change win when both changed the same field", () => {
    const current = nda({ governingLaw: "New York" });
    const returned = nda({ governingLaw: "California" });
    expect(applyChanges(current, sent, returned).fields?.values.governingLaw).toBe("California");
  });

  it("changes nothing when the assistant changed nothing", () => {
    const current = nda({ purpose: "Hiring." });
    expect(applyChanges(current, sent, sent)).toEqual(current);
  });

  it("takes the assistant's draft when it chose a document", () => {
    const none: Draft = { document: null, fields: null };
    const returned: Draft = { document: "pilot-agreement", fields: data("pilot-agreement", { pilotPeriod: "90 days" }) };
    expect(applyChanges(none, none, returned)).toEqual(returned);
    expect(applyChanges(sent, sent, returned)).toEqual(returned);
  });

  it("keeps the user's choice if they picked another document while waiting", () => {
    const current: Draft = { document: "cloud-service-agreement", fields: data("cloud-service-agreement") };
    const returned: Draft = { document: "pilot-agreement", fields: data("pilot-agreement") };
    expect(applyChanges(current, sent, returned)).toBe(current);
    expect(applyChanges(current, sent, nda({ chosenCourts: "New Castle, DE" }))).toBe(current);
  });

  it("keeps the draft when the assistant is still helping choose a document", () => {
    const none: Draft = { document: null, fields: null };
    expect(applyChanges(none, none, none)).toEqual(none);
  });
});
