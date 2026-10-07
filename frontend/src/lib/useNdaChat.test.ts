import { describe, expect, it } from "vitest";
import { defaultFormData } from "@/lib/nda";
import { applyChanges } from "@/lib/useNdaChat";

describe("applyChanges", () => {
  const sent = { ...defaultFormData(), governingLaw: "Delaware" };

  it("applies the fields the assistant changed", () => {
    const returned = { ...sent, jurisdiction: "New Castle, DE", mndaTermYears: 2, party1: { ...sent.party1, company: "Acme" } };
    expect(applyChanges(sent, sent, returned)).toEqual(returned);
  });

  it("keeps edits made while waiting for the reply", () => {
    const current = { ...sent, purpose: "Hiring.", party1: { ...sent.party1, name: "Ada" } };
    const returned = { ...sent, jurisdiction: "New Castle, DE", party1: { ...sent.party1, company: "Acme" } };

    expect(applyChanges(current, sent, returned)).toEqual({
      ...sent,
      purpose: "Hiring.",
      jurisdiction: "New Castle, DE",
      party1: { ...sent.party1, name: "Ada", company: "Acme" },
    });
  });

  it("lets the assistant's change win when both changed the same field", () => {
    const current = { ...sent, governingLaw: "New York" };
    const returned = { ...sent, governingLaw: "California" };
    expect(applyChanges(current, sent, returned).governingLaw).toBe("California");
  });

  it("changes nothing when the assistant changed nothing", () => {
    const current = { ...sent, purpose: "Hiring." };
    expect(applyChanges(current, sent, sent)).toEqual(current);
  });
});
