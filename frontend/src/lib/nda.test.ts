import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCoverPage,
  defaultFormData,
  formatDate,
  missingRequiredFields,
  parseStandardTerms,
  pdfFilename,
  type Inline,
  type NdaFormData,
} from "@/lib/nda";

const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

function completeFormData(overrides: Partial<NdaFormData> = {}): NdaFormData {
  return {
    ...defaultFormData(),
    effectiveDate: "2026-03-15",
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
    party2: { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St, Springfield" },
    ...overrides,
  };
}

function section(data: NdaFormData, title: string) {
  const found = buildCoverPage(data).sections.find((s) => s.title === title);
  if (!found) throw new Error(`No cover page section "${title}"`);
  return found;
}

function signatureRow(data: NdaFormData, label: string) {
  const found = buildCoverPage(data).signatureRows.find((r) => r.label === label);
  if (!found) throw new Error(`No signature row "${label}"`);
  return found;
}

describe("defaultFormData", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the Common Paper suggested defaults", () => {
    const data = defaultFormData();
    expect(data.purpose).toBe("Evaluating whether to enter into a business relationship with the other party.");
    expect(data.mndaTermType).toBe("expires");
    expect(data.mndaTermYears).toBe(1);
    expect(data.confidentialityType).toBe("years");
    expect(data.confidentialityYears).toBe(1);
    expect(data.governingLaw).toBe("");
    expect(data.jurisdiction).toBe("");
    expect(data.modifications).toBe("");
  });

  it("defaults the effective date to today's local date as yyyy-mm-dd", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)); // local time, late in the day
    expect(defaultFormData().effectiveDate).toBe("2026-01-05");
  });

  it("zero-pads single-digit months and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 8, 9, 0, 1));
    expect(defaultFormData().effectiveDate).toBe("2027-09-09");
  });

  it("starts both parties empty", () => {
    const data = defaultFormData();
    for (const party of [data.party1, data.party2]) {
      expect(party).toEqual({ name: "", title: "", company: "", noticeAddress: "" });
    }
  });

  it("returns independent party objects on every call", () => {
    const a = defaultFormData();
    const b = defaultFormData();
    a.party1.company = "Mutated";
    expect(a.party2.company).toBe("");
    expect(b.party1.company).toBe("");
    expect(defaultFormData().party1.company).toBe("");
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
  it("lists every required field for the default form", () => {
    expect(missingRequiredFields({ ...defaultFormData(), effectiveDate: "" })).toEqual([
      "Effective date",
      "Governing law",
      "Jurisdiction",
      "Party 1 company",
      "Party 2 company",
    ]);
  });

  it("is empty when all required fields are filled", () => {
    expect(missingRequiredFields(completeFormData())).toEqual([]);
  });

  it("does not require signatory name, title, notice address or modifications", () => {
    const data = completeFormData({
      modifications: "",
      party1: { name: "", title: "", company: "Acme", noticeAddress: "" },
      party2: { name: "", title: "", company: "Globex", noticeAddress: "" },
    });
    expect(missingRequiredFields(data)).toEqual([]);
  });

  it("treats whitespace-only values as missing", () => {
    const data = completeFormData({
      purpose: "   ",
      governingLaw: "\t",
      jurisdiction: "\n",
      party1: { ...completeFormData().party1, company: "  " },
    });
    expect(missingRequiredFields(data)).toEqual(["Purpose", "Governing law", "Jurisdiction", "Party 1 company"]);
  });

  it("treats an unparseable effective date as missing", () => {
    expect(missingRequiredFields(completeFormData({ effectiveDate: "garbage" }))).toEqual(["Effective date"]);
  });
});

describe("pdfFilename", () => {
  it("includes both company names", () => {
    expect(pdfFilename(completeFormData())).toBe("Mutual-NDA_Acme-Inc_Globex.pdf");
  });

  it("replaces runs of special characters with a single hyphen and trims them from the ends", () => {
    const data = completeFormData();
    data.party1.company = "  O'Reilly & Sons, LLC.  ";
    data.party2.company = "--Foo///Bar--";
    expect(pdfFilename(data)).toBe("Mutual-NDA_O-Reilly-Sons-LLC_Foo-Bar.pdf");
  });

  it("drops accents instead of breaking words apart", () => {
    const data = completeFormData();
    data.party1.company = "Société Générale – Américas";
    data.party2.company = "Zürich Ångström";
    expect(pdfFilename(data)).toBe("Mutual-NDA_Societe-Generale-Americas_Zurich-Angstrom.pdf");
  });

  it("leaves out companies that are empty or have no ASCII letters or digits", () => {
    const data = completeFormData();
    data.party1.company = "";
    data.party2.company = "株式会社";
    expect(pdfFilename(data)).toBe("Mutual-NDA.pdf");
  });

  it("never produces path separators", () => {
    const data = completeFormData();
    data.party1.company = "../../etc/passwd";
    data.party2.company = "C:\\Windows";
    const name = pdfFilename(data);
    expect(name).not.toMatch(/[\\/]/);
    expect(name).toBe("Mutual-NDA_etc-passwd_C-Windows.pdf");
  });
});

describe("buildCoverPage", () => {
  it("has the title, intro and signing statement from the Common Paper cover page", () => {
    const cover = buildCoverPage(completeFormData());
    expect(cover.title).toBe("Mutual Non-Disclosure Agreement");
    expect(cover.introHeading).toBe("USING THIS MUTUAL NON-DISCLOSURE AGREEMENT");
    expect(plain(cover.intro)).toContain("Common Paper Mutual NDA Standard Terms Version 1.0");
    expect(cover.signingStatement).toBe(
      "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    );
  });

  it("links to the standard terms and the CC BY 4.0 license", () => {
    const cover = buildCoverPage(completeFormData());
    const links = [...cover.intro, ...cover.attribution].filter((i) => i.kind === "link");
    expect(links).toEqual([
      { kind: "link", text: "commonpaper.com/standards/mutual-nda/1.0", href: "https://commonpaper.com/standards/mutual-nda/1.0" },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
    ]);
  });

  it("has the cover page sections in order", () => {
    expect(buildCoverPage(completeFormData()).sections.map((s) => s.title)).toEqual([
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]);
  });

  describe("form values", () => {
    it("fills in the purpose, trimmed", () => {
      const s = section(completeFormData({ purpose: "  Evaluating a partnership.  " }), "Purpose");
      expect(s.paragraphs).toEqual([[{ kind: "value", text: "Evaluating a partnership.", placeholder: false }]]);
    });

    it("formats the effective date", () => {
      expect(section(completeFormData(), "Effective Date").paragraphs[0]).toEqual([
        { kind: "value", text: "March 15, 2026", placeholder: false },
      ]);
    });

    it("fills in governing law and jurisdiction", () => {
      const [law, jurisdiction] = section(completeFormData(), "Governing Law & Jurisdiction").paragraphs;
      expect(plain(law)).toBe("Governing Law: Delaware");
      expect(plain(jurisdiction)).toBe("Jurisdiction: New Castle, DE");
    });
  });

  describe("placeholders for empty fields", () => {
    it("shows a placeholder for each empty required field", () => {
      const data = { ...defaultFormData(), purpose: "", effectiveDate: "" };
      const values = buildCoverPage(data)
        .sections.flatMap((s) => s.paragraphs.flat())
        .filter((i) => i.kind === "value");
      expect(values).toEqual([
        { kind: "value", text: "[Purpose]", placeholder: true },
        { kind: "value", text: "[Effective Date]", placeholder: true },
        { kind: "value", text: "1 year", placeholder: false },
        { kind: "value", text: "1 year", placeholder: false },
        { kind: "value", text: "[Fill in state]", placeholder: true },
        { kind: "value", text: "[Fill in city or county and state]", placeholder: true },
      ]);
    });

    it("treats whitespace-only values as empty", () => {
      expect(section(completeFormData({ governingLaw: "   " }), "Governing Law & Jurisdiction").paragraphs[0][1]).toEqual({
        kind: "value",
        text: "[Fill in state]",
        placeholder: true,
      });
    });
  });

  describe("MNDA term", () => {
    it("expires after a number of years", () => {
      const s = section(completeFormData({ mndaTermType: "expires", mndaTermYears: 3 }), "MNDA Term");
      expect(plain(s.paragraphs[0])).toBe("Expires 3 years from Effective Date.");
      expect(s.paragraphs[0]).toContainEqual({ kind: "value", text: "3 years", placeholder: false });
    });

    it("uses the singular for one year", () => {
      expect(plain(section(completeFormData({ mndaTermYears: 1 }), "MNDA Term").paragraphs[0])).toBe(
        "Expires 1 year from Effective Date.",
      );
    });

    it("continues until terminated, ignoring the number of years", () => {
      const s = section(completeFormData({ mndaTermType: "until-terminated", mndaTermYears: 7 }), "MNDA Term");
      expect(plain(s.paragraphs[0])).toBe("Continues until terminated in accordance with the terms of the MNDA.");
      expect(plain(s.paragraphs[0])).not.toContain("7");
    });
  });

  describe("term of confidentiality", () => {
    it("lasts a number of years, with trade secrets protected for longer", () => {
      const s = section(completeFormData({ confidentialityType: "years", confidentialityYears: 5 }), "Term of Confidentiality");
      expect(plain(s.paragraphs[0])).toBe(
        "5 years from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.",
      );
    });

    it("can be perpetual, ignoring the number of years", () => {
      const s = section(completeFormData({ confidentialityType: "perpetual", confidentialityYears: 5 }), "Term of Confidentiality");
      expect(plain(s.paragraphs[0])).toBe("In perpetuity.");
    });

    it("is independent of the MNDA term", () => {
      const data = completeFormData({ mndaTermType: "until-terminated", confidentialityType: "years", confidentialityYears: 2 });
      expect(plain(section(data, "Term of Confidentiality").paragraphs[0])).toMatch(/^2 years from Effective Date/);
    });
  });

  describe("MNDA modifications", () => {
    it('says "None." when there are no modifications', () => {
      expect(section(completeFormData({ modifications: "  " }), "MNDA Modifications").paragraphs).toEqual([
        [{ kind: "text", text: "None." }],
      ]);
    });

    it("shows the modifications as a value, keeping inner line breaks", () => {
      const s = section(completeFormData({ modifications: "\nSection 5 is deleted.\nSection 9: New York.\n" }), "MNDA Modifications");
      expect(s.paragraphs).toEqual([[{ kind: "value", text: "Section 5 is deleted.\nSection 9: New York.", placeholder: false }]]);
    });
  });

  describe("signature table", () => {
    it("has the rows from the Common Paper cover page", () => {
      expect(buildCoverPage(completeFormData()).signatureRows.map((r) => r.label)).toEqual([
        "Signature",
        "Print Name",
        "Title",
        "Company",
        "Notice Address",
        "Date",
      ]);
    });

    it("leaves signature and date blank to be signed by hand", () => {
      for (const label of ["Signature", "Date"]) {
        expect(signatureRow(completeFormData(), label).values).toEqual([[], []]);
      }
    });

    it("puts each party's details in its own column", () => {
      const data = completeFormData();
      const column = (label: string, i: 0 | 1) => plain(signatureRow(data, label).values[i]);
      expect(column("Print Name", 0)).toBe("Ada Lovelace");
      expect(column("Print Name", 1)).toBe("Alan Turing");
      expect(column("Title", 0)).toBe("CEO");
      expect(column("Title", 1)).toBe("CTO");
      expect(column("Company", 0)).toBe("Acme Inc.");
      expect(column("Company", 1)).toBe("Globex");
      expect(column("Notice Address", 0)).toBe("legal@acme.test");
      expect(column("Notice Address", 1)).toBe("1 Main St, Springfield");
    });

    it("leaves empty party details blank instead of showing a placeholder", () => {
      const data = completeFormData();
      data.party2 = { name: " ", title: "", company: "", noticeAddress: "" };
      for (const label of ["Print Name", "Title", "Company", "Notice Address"]) {
        expect(signatureRow(data, label).values[1]).toEqual([]);
      }
      expect(signatureRow(data, "Company").values[0]).toEqual([{ kind: "value", text: "Acme Inc.", placeholder: false }]);
    });

    it("hints that the notice address can be email or postal", () => {
      expect(signatureRow(completeFormData(), "Notice Address").hint).toBe("Use either email or postal address");
    });
  });

  it("does not interpret markdown or HTML in user input", () => {
    const purpose = '**bold** <span class="coverpage_link">x</span> [link](javascript:alert(1)) <script>alert(1)</script>';
    const cover = buildCoverPage(completeFormData({ purpose }));
    expect(cover.sections[0].paragraphs).toEqual([[{ kind: "value", text: purpose, placeholder: false }]]);
  });

  it("does not mutate the form data", () => {
    const data = completeFormData();
    const snapshot = structuredClone(data);
    buildCoverPage(data);
    expect(data).toEqual(snapshot);
  });
});

describe("parseStandardTerms", () => {
  it("parses headings, numbered clauses and paragraphs", () => {
    const blocks = parseStandardTerms("# Standard Terms\n\n1. First clause.\n\n2. Second clause.\n\nClosing paragraph.");
    expect(blocks).toEqual([
      { kind: "heading", text: "Standard Terms" },
      { kind: "clause", number: "1", content: [{ kind: "text", text: "First clause." }] },
      { kind: "clause", number: "2", content: [{ kind: "text", text: "Second clause." }] },
      { kind: "paragraph", content: [{ kind: "text", text: "Closing paragraph." }] },
    ]);
  });

  it("parses headings of any level", () => {
    expect(parseStandardTerms("### Small")).toEqual([{ kind: "heading", text: "Small" }]);
  });

  it("keeps multi-digit clause numbers", () => {
    expect(parseStandardTerms("11. **General**. Text.")[0]).toMatchObject({ kind: "clause", number: "11" });
  });

  it("parses bold text", () => {
    expect(parseStandardTerms("1. **Introduction**. This (“**MNDA**”).")[0]).toEqual({
      kind: "clause",
      number: "1",
      content: [
        { kind: "text", text: "Introduction", bold: true },
        { kind: "text", text: ". This (“" },
        { kind: "text", text: "MNDA", bold: true },
        { kind: "text", text: "”)." },
      ],
    });
  });

  it("parses cover page term references", () => {
    expect(parseStandardTerms('for the <span class="coverpage_link">Purpose</span>; and')[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "for the " },
        { kind: "term", text: "Purpose" },
        { kind: "text", text: "; and" },
      ],
    });
  });

  it("parses links", () => {
    expect(parseStandardTerms("See [Version 1.0](https://example.com/a_b) now.")[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "See " },
        { kind: "link", text: "Version 1.0", href: "https://example.com/a_b" },
        { kind: "text", text: " now." },
      ],
    });
  });

  it("handles inline markup at the very start and end of a block", () => {
    expect(parseStandardTerms("**A** and **B**")[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "A", bold: true },
        { kind: "text", text: " and " },
        { kind: "text", text: "B", bold: true },
      ],
    });
  });

  it("handles Windows line endings and extra blank lines", () => {
    expect(parseStandardTerms("\r\n# Title\r\n\r\n\r\n   \r\n1. Clause.\r\n")).toEqual([
      { kind: "heading", text: "Title" },
      { kind: "clause", number: "1", content: [{ kind: "text", text: "Clause." }] },
    ]);
  });

  it("keeps single line breaks inside a block", () => {
    expect(parseStandardTerms("1. Line one\nline two")[0]).toEqual({
      kind: "clause",
      number: "1",
      content: [{ kind: "text", text: "Line one\nline two" }],
    });
  });

  it("returns no blocks for empty input", () => {
    expect(parseStandardTerms("")).toEqual([]);
    expect(parseStandardTerms("\n\n  \n")).toEqual([]);
  });

  it("returns fresh results on every call (the global regex keeps no state between calls)", () => {
    const md = "1. **A** and **B**.";
    expect(parseStandardTerms(md)).toEqual(parseStandardTerms(md));
  });
});
