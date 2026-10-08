import { afterEach, describe, expect, it, vi } from "vitest";
import { carryOver, defaultData, formatDate, missingRequiredFields, pdfFilename } from "@/lib/documents";
import { data, SPECS, spec } from "@/testing/documents";

const NDA = spec("mutual-nda");
const PILOT = spec("pilot-agreement");

const completeNda = (values: Record<string, string | number> = {}) =>
  data(
    "mutual-nda",
    { effectiveDate: "2026-03-15", governingLaw: "Delaware", chosenCourts: "New Castle, DE", ...values },
    [
      { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
      { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St, Springfield" },
    ],
  );

describe("defaultData", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the Common Paper suggested defaults for the NDA", () => {
    expect(defaultData(NDA).values).toMatchObject({
      purpose: "Evaluating whether to enter into a business relationship with the other party.",
      mndaTermType: "expires",
      mndaTermYears: 1,
      confidentialityType: "years",
      confidentialityYears: 1,
      governingLaw: "",
      chosenCourts: "",
      modifications: "",
    });
  });

  it("gives every field of every document a value", () => {
    for (const s of SPECS) {
      const values = defaultData(s).values;
      for (const section of s.sections) for (const field of section.fields) expect(values, `${s.id}.${field.key}`).toHaveProperty(field.key);
    }
  });

  it("defaults the effective date to today's local date as yyyy-mm-dd", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)); // local time, late in the day
    expect(defaultData(NDA).values.effectiveDate).toBe("2026-01-05");
    expect(defaultData(PILOT).values.effectiveDate).toBe("2026-01-05");
  });

  it("zero-pads single-digit months and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 8, 9, 0, 1));
    expect(defaultData(NDA).values.effectiveDate).toBe("2027-09-09");
  });

  it("starts both parties empty, as independent objects", () => {
    const a = defaultData(NDA);
    expect(a.parties).toEqual([
      { name: "", title: "", company: "", noticeAddress: "" },
      { name: "", title: "", company: "", noticeAddress: "" },
    ]);
    a.parties[0].company = "Mutated";
    expect(a.parties[1].company).toBe("");
    expect(defaultData(NDA).parties[0].company).toBe("");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as a long US date", () => {
    expect(formatDate("2026-03-15")).toBe("March 15, 2026");
    expect(formatDate("2026-12-01")).toBe("December 1, 2026");
  });

  it("does not shift the day across time zones (parses as a local date)", () => {
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("keeps years below 100 as typed instead of mapping them to the 1900s", () => {
    expect(formatDate("0020-03-15")).toBe("March 15, 20");
    expect(formatDate("0202-03-15")).toBe("March 15, 202");
  });

  it("handles leap days", () => {
    expect(formatDate("2028-02-29")).toBe("February 29, 2028");
  });

  it.each(["", "not-a-date", "2026-03", "2026", "--", "0000-00-00"])("returns an empty string for %j", (input) => {
    expect(formatDate(input)).toBe("");
  });
});

describe("missingRequiredFields", () => {
  it("lists every required field for the default NDA, then the party companies by role", () => {
    expect(missingRequiredFields(NDA, data("mutual-nda", { effectiveDate: "" }))).toEqual([
      "Effective Date",
      "Governing Law",
      "Jurisdiction",
      "Party 1 company",
      "Party 2 company",
    ]);
    expect(missingRequiredFields(PILOT, data("pilot-agreement"))).toEqual([
      "Product",
      "Pilot Period",
      "Governing Law",
      "Chosen Courts",
      "Provider company",
      "Customer company",
    ]);
  });

  it("is empty when all required fields are filled", () => {
    expect(missingRequiredFields(NDA, completeNda())).toEqual([]);
  });

  it("does not require signatory details or optional fields", () => {
    const d = data("mutual-nda", { governingLaw: "Delaware", chosenCourts: "New Castle, DE", modifications: "" }, [
      { company: "Acme" },
      { company: "Globex" },
    ]);
    expect(missingRequiredFields(NDA, d)).toEqual([]);
  });

  it("treats whitespace-only values as missing", () => {
    const d = completeNda({ purpose: "   ", governingLaw: "\t", chosenCourts: "\n" });
    d.parties[0].company = "  ";
    expect(missingRequiredFields(NDA, d)).toEqual(["Purpose", "Governing Law", "Jurisdiction", "Party 1 company"]);
  });

  it("treats an unparseable date as missing", () => {
    expect(missingRequiredFields(NDA, completeNda({ effectiveDate: "garbage" }))).toEqual(["Effective Date"]);
  });
});

describe("carryOver", () => {
  it("starts from the defaults when there was no document", () => {
    expect(carryOver(null, null, PILOT)).toEqual(defaultData(PILOT));
  });

  it("keeps the parties and the non-blank values both documents have", () => {
    const nda = completeNda({ purpose: "Talks" });
    const result = carryOver(NDA, nda, PILOT);
    expect(result.parties).toEqual(nda.parties);
    expect(result.parties[0]).not.toBe(nda.parties[0]);
    expect(result.values).toEqual({
      ...defaultData(PILOT).values,
      effectiveDate: "2026-03-15",
      governingLaw: "Delaware",
      chosenCourts: "New Castle, DE",
    });
  });

  it("does not carry blank values", () => {
    const result = carryOver(PILOT, data("pilot-agreement", { governingLaw: " " }), spec("cloud-service-agreement"));
    expect(result.values.governingLaw).toBe("");
  });

  it("carries values back and forth between documents", () => {
    const csa = carryOver(PILOT, data("pilot-agreement", { fees: "$500", product: "Analytics" }), spec("cloud-service-agreement"));
    expect(csa.values.fees).toBe("$500");
    expect(csa.values.cloudService).toBe("");
  });
});

describe("pdfFilename", () => {
  it("names the file after the template and both companies", () => {
    expect(pdfFilename(NDA, completeNda())).toBe("Mutual-NDA_Acme-Inc_Globex.pdf");
    expect(pdfFilename(spec("cloud-service-agreement"), completeNda())).toBe("CSA_Acme-Inc_Globex.pdf");
  });

  it("replaces runs of special characters with a single hyphen and trims them from the ends", () => {
    const d = completeNda();
    d.parties[0].company = "  O'Reilly & Sons, LLC.  ";
    d.parties[1].company = "--Foo///Bar--";
    expect(pdfFilename(NDA, d)).toBe("Mutual-NDA_O-Reilly-Sons-LLC_Foo-Bar.pdf");
  });

  it("drops accents instead of breaking words apart", () => {
    const d = completeNda();
    d.parties[0].company = "Société Générale – Américas";
    d.parties[1].company = "Zürich Ångström";
    expect(pdfFilename(NDA, d)).toBe("Mutual-NDA_Societe-Generale-Americas_Zurich-Angstrom.pdf");
  });

  it("spells out Latin letters that have no separate accent", () => {
    const d = completeNda();
    d.parties[0].company = "Łódź Spółka Øresund";
    d.parties[1].company = "Straße Đà Nẵng Œuvre";
    expect(pdfFilename(NDA, d)).toBe("Mutual-NDA_Lodz-Spolka-Oresund_Strasse-Da-Nang-OEuvre.pdf");
  });

  it("leaves out companies that are empty or have no ASCII letters or digits", () => {
    const d = completeNda();
    d.parties[0].company = "";
    d.parties[1].company = "株式会社";
    expect(pdfFilename(NDA, d)).toBe("Mutual-NDA.pdf");
  });

  it("never produces path separators", () => {
    const d = completeNda();
    d.parties[0].company = "../../etc/passwd";
    d.parties[1].company = "C:\\Windows";
    const name = pdfFilename(NDA, d);
    expect(name).not.toMatch(/[\\/]/);
    expect(name).toBe("Mutual-NDA_etc-passwd_C-Windows.pdf");
  });
});
