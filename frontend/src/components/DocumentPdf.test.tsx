// @vitest-environment node
// Renders the real PDF and reads its text back, so this covers @react-pdf/renderer
// itself (fonts, layout, page breaks), not just our components.
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { DocumentPdf, registerPdfFonts } from "@/components/DocumentPdf";
import { buildCoverPage } from "@/lib/cover";
import type { DocumentData } from "@/lib/documents";
import { data as documentData, DOCUMENTS } from "@/testing/documents";

registerPdfFonts(path.join(process.cwd(), "public", "fonts"));

function completeFormData(values: Record<string, string | number> = {}): DocumentData {
  return documentData(
    "mutual-nda",
    {
      purpose: "Exploring a joint venture for widgets.",
      effectiveDate: "2026-03-15",
      mndaTermYears: 2,
      confidentialityYears: 5,
      governingLaw: "Delaware",
      chosenCourts: "New Castle, DE",
      modifications: "Section 9 is governed by New York law.",
      ...values,
    },
    [
      { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
      { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St, Springfield" },
    ],
  );
}

async function renderPdf(data: DocumentData, id = "mutual-nda") {
  const { spec, terms } = DOCUMENTS.find((d) => d.spec.id === id)!;
  const buffer = await renderToBuffer(<DocumentPdf cover={buildCoverPage(spec, data)} terms={terms} />);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    // Sequential: the parser transfers the data to its worker, so concurrent calls fail.
    const text = await parser.getText();
    const info = await parser.getInfo();
    // Collapse whitespace so assertions don't depend on where lines wrap.
    const flat = text.text.replace(/\s+/g, " ");
    return { buffer, text: flat, pages: text.pages.map((p) => p.text.replace(/\s+/g, " ")), info: info.info };
  } finally {
    await parser.destroy();
  }
}

describe("DocumentPdf", () => {
  it("produces a valid PDF with the agreement title as metadata", async () => {
    const { buffer, info } = await renderPdf(completeFormData());
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(info.Title).toBe("Mutual Non-Disclosure Agreement");
    expect(info.Author).toBe("Prelegal");
  });

  it("embeds Noto Serif regular, bold and italic instead of the built-in PDF fonts", async () => {
    const { buffer } = await renderPdf(completeFormData());
    // Embedded fonts are named like /BaseFont /ABCDEF+NotoSerif-Bold (a subset prefix, then the font).
    const fonts = new Set([...buffer.toString("latin1").matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([\w-]+)/g)].map((m) => m[1]));
    expect([...fonts].sort()).toEqual(["NotoSerif-Bold", "NotoSerif-Italic", "NotoSerif-Regular"]);
  });

  it("puts the cover page first and the standard terms on following pages", async () => {
    const { pages } = await renderPdf(completeFormData());
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toContain("Mutual Non-Disclosure Agreement");
    expect(pages[0]).toContain("PARTY 1");
    const termsStart = pages.findIndex((p) => p.includes("1. Introduction."));
    expect(termsStart).toBeGreaterThan(0);
    expect(pages[termsStart]).toMatch(/^\s*Standard Terms 1\. Introduction\./);
  });

  it("includes every form value", async () => {
    const { text } = await renderPdf(completeFormData());
    for (const value of [
      "Exploring a joint venture for widgets.",
      "March 15, 2026",
      "Expires 2 years from Effective Date.",
      "5 years from Effective Date",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 9 is governed by New York law.",
      "Ada Lovelace",
      "Alan Turing",
      "CEO",
      "CTO",
      "Acme Inc.",
      "Globex",
      "legal@acme.test",
      "1 Main St, Springfield",
    ]) {
      expect(text).toContain(value);
    }
  });

  it("includes the signature table rows in order, with each party's details", async () => {
    const { text } = await renderPdf(completeFormData());
    expect(text).toContain(
      "PARTY 1 PARTY 2 Signature Print Name Ada Lovelace Alan Turing Title CEO CTO Company Acme Inc. Globex " +
        "Notice Address Use either email or postal address legal@acme.test 1 Main St, Springfield Date",
    );
  });

  it("includes all 11 clauses of the standard terms and the attribution", async () => {
    const { text } = await renderPdf(completeFormData());
    for (const title of ["1. Introduction.", "5. Term and Termination.", "9. Governing Law and Jurisdiction.", "11. General."]) {
      expect(text).toContain(title);
    }
    expect(text).toContain("This MNDA may be executed in counterparts");
    expect(text).toContain("free to use under CC BY 4.0");
  });

  it("shows the alternative terms when chosen", async () => {
    const data = completeFormData({ mndaTermType: "until-terminated", confidentialityType: "perpetual", modifications: "" });
    const { text } = await renderPdf(data);
    expect(text).toContain("Continues until terminated in accordance with the terms of the MNDA.");
    expect(text).toContain("In perpetuity.");
    expect(text).toContain("None.");
    expect(text).not.toContain("Expires 2 years");
  });

  it("shows placeholders for empty fields", async () => {
    const { text } = await renderPdf(documentData("mutual-nda", { purpose: "", effectiveDate: "" }));
    for (const placeholder of ["[Purpose]", "[Effective Date]", "[Fill in state]", "[Fill in city or county and state]"]) {
      expect(text).toContain(placeholder);
    }
  });

  it("renders Latin, Greek and Cyrillic characters outside Latin-1", async () => {
    const data = completeFormData();
    data.parties[0].company = "Łódź Spółka Şirket Řeřicha";
    data.parties[0].name = "Nguyễn Văn Hữu";
    data.parties[1].company = "ООО «Ромашка»";
    data.parties[1].name = "Αθήνα Εταιρεία";
    data.values.modifications = "Section 9: courts of Kraków, Poland.";
    const { text } = await renderPdf(data);
    for (const value of ["Łódź Spółka Şirket Řeřicha", "Nguyễn Văn Hữu", "ООО «Ромашка»", "Αθήνα Εταιρεία", "Kraków"]) {
      expect(text).toContain(value);
    }
  });

  it("renders long, multi-line and Latin-1 accented input without failing", async () => {
    const data = completeFormData();
    data.values.purpose = "Evaluating a partnership. ".repeat(60);
    data.values.modifications = "Line one.\nLine two.\nLine three.";
    data.parties[0].company = "Société Générale – “Quotes” & Co.";
    const { text, pages } = await renderPdf(data);
    expect(text).toContain("Line one. Line two. Line three.");
    expect(text).toContain("Société Générale");
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it("renders another document with role columns and nested clause numbers", async () => {
    const data = documentData("pilot-agreement", { pilotPeriod: "90 days" }, [{ company: "Acme" }, { company: "Globex" }]);
    const { text, info } = await renderPdf(data, "pilot-agreement");
    expect(info.Title).toBe("Pilot Agreement");
    expect(text).toContain("PROVIDER CUSTOMER Signature");
    expect(text).toContain("Pilot Period: 90 days");
    expect(text).toContain("1. Pilot Access 1.1. Access and Use.");
    expect(text).toMatch(/\(a\) /);
  });

  it.each(DOCUMENTS.map((d) => [d.spec.name, d.spec.id]))("renders the %s", async (_, id) => {
    const { pages } = await renderPdf(documentData(id), id);
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });
});
