import { describe, expect, it } from "vitest";
import { buildCoverPage } from "@/lib/cover";
import type { DocumentData } from "@/lib/documents";
import type { Inline } from "@/lib/inline";
import { data as documentData, spec } from "@/testing/documents";

const NDA = spec("mutual-nda");
const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

function completeFormData(values: Record<string, string | number> = {}): DocumentData {
  return documentData(
    "mutual-nda",
    { effectiveDate: "2026-03-15", governingLaw: "Delaware", chosenCourts: "New Castle, DE", ...values },
    [
      { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
      { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St, Springfield" },
    ],
  );
}

const ndaCover = (data: DocumentData) => buildCoverPage(NDA, data);

function section(data: DocumentData, title: string) {
  const found = ndaCover(data).sections.find((s) => s.title === title);
  if (!found) throw new Error(`No cover page section "${title}"`);
  return found;
}

function signatureRow(data: DocumentData, label: string) {
  const found = ndaCover(data).signatureRows.find((r) => r.label === label);
  if (!found) throw new Error(`No signature row "${label}"`);
  return found;
}

describe("the Mutual NDA cover page", () => {
  it("has the title, intro and signing statement from the Common Paper cover page", () => {
    const cover = ndaCover(completeFormData());
    expect(cover.title).toBe("Mutual Non-Disclosure Agreement");
    expect(cover.introHeading).toBe("USING THIS MUTUAL NON-DISCLOSURE AGREEMENT");
    expect(plain(cover.intro)).toContain("Common Paper Mutual NDA Standard Terms Version 1.0");
    expect(cover.signingStatement).toBe(
      "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    );
  });

  it("links to the standard terms and the CC BY 4.0 license", () => {
    const cover = ndaCover(completeFormData());
    const links = [...cover.intro, ...cover.attribution].filter((i) => i.kind === "link");
    expect(links).toEqual([
      { kind: "link", text: "commonpaper.com/standards/mutual-nda/1.0", href: "https://commonpaper.com/standards/mutual-nda/1.0" },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
    ]);
  });

  it("labels the signature columns Party 1 and Party 2", () => {
    expect(ndaCover(completeFormData()).partyLabels).toEqual(["PARTY 1", "PARTY 2"]);
  });

  it("has the cover page sections in order", () => {
    expect(ndaCover(completeFormData()).sections.map((s) => s.title)).toEqual([
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
      const data = documentData("mutual-nda", { purpose: "", effectiveDate: "" });
      const values = ndaCover(data)
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
      expect(ndaCover(completeFormData()).signatureRows.map((r) => r.label)).toEqual([
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
      data.parties[1] = { name: " ", title: "", company: "", noticeAddress: "" };
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
    const cover = ndaCover(completeFormData({ purpose }));
    expect(cover.sections[0].paragraphs).toEqual([[{ kind: "value", text: purpose, placeholder: false }]]);
  });

  it("does not mutate the form data", () => {
    const data = completeFormData();
    const snapshot = structuredClone(data);
    ndaCover(data);
    expect(data).toEqual(snapshot);
  });
});
