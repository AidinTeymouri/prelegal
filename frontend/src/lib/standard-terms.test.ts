// Tests against the real templates/Mutual-NDA.md that the app ships with.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCoverPage, defaultFormData, parseStandardTerms, type Inline, type TermsBlock } from "@/lib/nda";

const markdown = readFileSync(path.join(process.cwd(), "templates", "Mutual-NDA.md"), "utf8");
const terms = parseStandardTerms(markdown);

const contentOf = (block: TermsBlock): Inline[] => (block.kind === "heading" ? [] : block.content);
const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

describe("templates/Mutual-NDA.md", () => {
  it("is identical to the copy in the repo-root templates directory", () => {
    const original = readFileSync(path.join(process.cwd(), "..", "templates", "Mutual-NDA.md"), "utf8");
    expect(markdown).toBe(original);
  });

  it("starts with the Standard Terms heading", () => {
    expect(terms[0]).toEqual({ kind: "heading", text: "Standard Terms" });
  });

  it("has clauses 1 to 11 in order", () => {
    const clauses = terms.filter((b) => b.kind === "clause");
    expect(clauses.map((c) => c.number)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });

  it("gives every clause a bold title", () => {
    const titles = terms.filter((b) => b.kind === "clause").map((c) => c.content[0]);
    expect(titles.map((t) => t.kind === "text" && t.bold && t.text)).toEqual([
      "Introduction",
      "Use and Protection of Confidential Information",
      "Exceptions",
      "Disclosures Required by Law",
      "Term and Termination",
      "Return or Destruction of Confidential Information",
      "Proprietary Rights",
      "Disclaimer",
      "Governing Law and Jurisdiction",
      "Equitable Relief",
      "General",
    ]);
  });

  it("ends with the attribution paragraph and its links", () => {
    const last = terms.at(-1)!;
    expect(last.kind).toBe("paragraph");
    expect(plain(contentOf(last))).toBe(
      "Common Paper Mutual Non-Disclosure Agreement Version 1.0 free to use under CC BY 4.0.",
    );
    expect(contentOf(last).filter((i) => i.kind === "link")).toEqual([
      { kind: "link", text: "Version 1.0", href: "https://commonpaper.com/standards/mutual-nda/1.0/" },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
    ]);
  });

  it("leaves no raw markdown or HTML in the parsed text", () => {
    const text = terms.map((b) => (b.kind === "heading" ? b.text : plain(b.content))).join("\n");
    expect(text).not.toMatch(/\*\*|<\/?span|\]\(|^#/m);
  });

  it("only references terms that the cover page defines", () => {
    const referenced = new Set(terms.flatMap(contentOf).filter((i) => i.kind === "term").map((i) => i.text));
    expect([...referenced].sort()).toEqual([
      "Effective Date",
      "Governing Law",
      "Jurisdiction",
      "MNDA Term",
      "Purpose",
      "Term of Confidentiality",
    ]);

    const cover = buildCoverPage(defaultFormData());
    const coverText = [...cover.sections.map((s) => s.title), ...cover.sections.flatMap((s) => s.paragraphs.map(plain))].join("\n");
    for (const term of referenced) expect(coverText).toContain(term);
  });
});
