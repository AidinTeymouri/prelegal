// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coverageRanges } from "../../scripts/font-coverage.mjs";
import { buildCoverPage, defaultFormData, parseStandardTerms, type Inline, type NdaFormData } from "@/lib/nda";
import { PDF_FONT_COVERAGE } from "@/lib/pdf-font-coverage";
import { unsupportedPdfCharacters } from "@/lib/pdf-fonts";

function withText(fields: Partial<NdaFormData>, company = ""): NdaFormData {
  const data = { ...defaultFormData(), ...fields };
  data.party1 = { ...data.party1, company };
  return data;
}

describe("PDF_FONT_COVERAGE", () => {
  it("matches the fonts in public/fonts (run `node scripts/font-coverage.mjs` after changing them)", () => {
    expect(coverageRanges(path.join(process.cwd(), "public", "fonts"))).toEqual(PDF_FONT_COVERAGE);
  });

  it("is sorted and non-overlapping, as the binary search needs", () => {
    for (let i = 0; i < PDF_FONT_COVERAGE.length; i++) {
      const [first, last] = PDF_FONT_COVERAGE[i];
      expect(first).toBeLessThanOrEqual(last);
      if (i > 0) expect(first).toBeGreaterThan(PDF_FONT_COVERAGE[i - 1][1] + 1);
    }
  });

  it("covers every character of the fixed agreement text", () => {
    const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");
    const terms = parseStandardTerms(readFileSync(path.join(process.cwd(), "templates", "Mutual-NDA.md"), "utf8"));
    const cover = buildCoverPage(defaultFormData());
    const text = [
      cover.title,
      cover.introHeading,
      plain(cover.intro),
      cover.signingStatement,
      plain(cover.attribution),
      ...cover.sections.flatMap((s) => [s.title, s.hint ?? "", ...s.paragraphs.map(plain)]),
      ...cover.signatureRows.flatMap((r) => [r.label, r.hint ?? ""]),
      ...terms.map((b) => (b.kind === "heading" ? b.text : plain(b.content))),
    ].join("");
    // Reuse the form check by putting the fixed text in a form field.
    expect(unsupportedPdfCharacters(withText({ purpose: text }))).toEqual([]);
  });
});

describe("unsupportedPdfCharacters", () => {
  it("accepts the default form", () => {
    expect(unsupportedPdfCharacters(defaultFormData())).toEqual([]);
  });

  it.each([
    ["Polish", "Łódź Spółka z o.o."],
    ["Turkish", "Şirket Ğüç İstanbul"],
    ["Czech", "Řeřicha s.r.o."],
    ["German", "Müller GmbH – Straße"],
    ["Greek", "Αθήνα Εταιρεία"],
    ["Russian", "ООО «Ромашка»"],
    ["Vietnamese", "Công ty Trách nhiệm Hữu hạn"],
    ["punctuation", "“Quotes” ‘and’ — dashes… €100 £5 ¥3 © ®"],
  ])("accepts %s", (_, company) => {
    expect(unsupportedPdfCharacters(withText({}, company))).toEqual([]);
  });

  it.each([
    ["Chinese and Japanese", "株式会社", ["株", "式", "会", "社"]],
    ["Korean", "삼성", ["삼", "성"]],
    ["Arabic", "شركة", ["ش", "ر", "ك", "ة"]],
    ["Hebrew", "חברה", ["ח", "ב", "ר", "ה"]],
    ["Thai", "บริษัท", ["บ", "ร", "ิ", "ษ", "ั", "ท"]],
  ])("flags %s", (_, company, expected) => {
    expect(unsupportedPdfCharacters(withText({}, company))).toEqual(expected);
  });

  it("treats an emoji outside the Basic Multilingual Plane as one character", () => {
    expect(unsupportedPdfCharacters(withText({ purpose: "Deal 🤝 done" }))).toEqual(["🤝"]);
  });

  it("lists each character once, in the order it first appears", () => {
    expect(unsupportedPdfCharacters(withText({ purpose: "会社 and 会社" }, "社長"))).toEqual(["会", "社", "長"]);
  });

  it("checks every free-text field, including both parties", () => {
    const data = defaultFormData();
    data.purpose = "一";
    data.governingLaw = "二";
    data.jurisdiction = "三";
    data.modifications = "四";
    data.party1 = { company: "五", name: "六", title: "七", noticeAddress: "八" };
    data.party2 = { company: "九", name: "十", title: "百", noticeAddress: "千" };
    expect(unsupportedPdfCharacters(data)).toEqual(["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千"]);
  });

  it("ignores line breaks, tabs and other whitespace", () => {
    expect(unsupportedPdfCharacters(withText({ modifications: "a\r\nb\tc d e" }))).toEqual([]);
  });
});
