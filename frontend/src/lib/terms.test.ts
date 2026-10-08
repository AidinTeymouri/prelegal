import { describe, expect, it } from "vitest";
import { buildCoverPage } from "@/lib/cover";
import type { Inline } from "@/lib/inline";
import { clauseLabel, parseStandardTerms, type TermsBlock } from "@/lib/terms";
import { data, DOCUMENTS, spec } from "@/testing/documents";

const contentOf = (block: TermsBlock): Inline[] => (block.kind === "heading" ? [] : block.content);
const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");
const clause = (number: string, text: string, depth = 0) => ({ kind: "clause", number, depth, content: [{ kind: "text", text }] });

describe("parseStandardTerms", () => {
  it("parses headings, numbered clauses and paragraphs", () => {
    const blocks = parseStandardTerms("# Standard Terms\n\n1. First clause.\n\n2. Second clause.\n\nClosing paragraph.");
    expect(blocks).toEqual([
      { kind: "heading", text: "Standard Terms" },
      clause("1", "First clause."),
      clause("2", "Second clause."),
      { kind: "paragraph", content: [{ kind: "text", text: "Closing paragraph." }] },
    ]);
  });

  it("parses headings of any level", () => {
    expect(parseStandardTerms("### Small")).toEqual([{ kind: "heading", text: "Small" }]);
  });

  it("keeps multi-digit clause numbers", () => {
    expect(parseStandardTerms("11. **General**. Text.")[0]).toMatchObject({ kind: "clause", number: "11" });
  });

  it("numbers nested clauses after their parents and keeps lettered markers", () => {
    const markdown = ["1. One", "    1. One one", "    2. One two", "        a. Letter", "            i. Roman", "2. Two", "    1. Two one"].join("\n");
    expect(parseStandardTerms(markdown)).toEqual([
      clause("1", "One"),
      clause("1.1", "One one", 1),
      clause("1.2", "One two", 1),
      clause("(a)", "Letter", 2),
      clause("(i)", "Roman", 3),
      clause("2", "Two"),
      clause("2.1", "Two one", 1),
    ]);
  });

  it("handles blank lines between nested clauses", () => {
    expect(parseStandardTerms("1. One\n\n    1. One one\n\n    2. One two").map((b) => b.kind === "clause" && b.number)).toEqual([
      "1",
      "1.1",
      "1.2",
    ]);
  });

  it("parses bold text", () => {
    expect(parseStandardTerms("1. **Introduction**. This (“**MNDA**”).")[0]).toEqual({
      kind: "clause",
      number: "1",
      depth: 0,
      content: [
        { kind: "text", text: "Introduction", bold: true },
        { kind: "text", text: ". This (“" },
        { kind: "text", text: "MNDA", bold: true },
        { kind: "text", text: "”)." },
      ],
    });
  });

  it("parses term references of every kind, keeping possessives as written", () => {
    const markdown =
      'the <span class="coverpage_link">Purpose</span>, <span class="orderform_link">Customer’s</span> and <span class="keyterms_link" id="5.5.a">Provider</span>';
    expect(parseStandardTerms(markdown)[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "the " },
        { kind: "term", text: "Purpose" },
        { kind: "text", text: ", " },
        { kind: "term", text: "Customer’s" },
        { kind: "text", text: " and " },
        { kind: "term", text: "Provider" },
      ],
    });
  });

  it("makes section and clause headings bold", () => {
    expect(parseStandardTerms('1. <span class="header_2" id="1">Pilot Access</span>')[0]).toMatchObject({
      content: [{ kind: "text", text: "Pilot Access", bold: true }],
    });
    expect(parseStandardTerms('    1. <span class="header_3">Access.</span>  Text')[0]).toMatchObject({
      content: [
        { kind: "text", text: "Access.", bold: true },
        { kind: "text", text: "  Text" },
      ],
    });
  });

  it("drops anchors but keeps what they wrap", () => {
    expect(parseStandardTerms('1. <span id="4.1"></span>**"AI"** means')[0]).toMatchObject({
      content: [
        { kind: "text", text: '"AI"', bold: true },
        { kind: "text", text: " means" },
      ],
    });
    expect(parseStandardTerms('1. <span id="4.1">**"Available Minutes"**</span> means')[0]).toMatchObject({
      content: [
        { kind: "text", text: '"Available Minutes"', bold: true },
        { kind: "text", text: " means" },
      ],
    });
  });

  it("makes terms inside bold text bold", () => {
    expect(parseStandardTerms('**not more than the <span class="orderform_link">General Cap Amount</span>.**')[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "not more than the ", bold: true },
        { kind: "term", text: "General Cap Amount", bold: true },
        { kind: "text", text: ".", bold: true },
      ],
    });
  });

  it("parses links and autolinks, and makes scheme-less links absolute", () => {
    expect(parseStandardTerms("See [Version 1.0](https://example.com/a_b) or <https://example.com/x> or [c](commonpaper.com/a).")[0]).toEqual({
      kind: "paragraph",
      content: [
        { kind: "text", text: "See " },
        { kind: "link", text: "Version 1.0", href: "https://example.com/a_b" },
        { kind: "text", text: " or " },
        { kind: "link", text: "https://example.com/x", href: "https://example.com/x" },
        { kind: "text", text: " or " },
        { kind: "link", text: "c", href: "https://commonpaper.com/a" },
        { kind: "text", text: "." },
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
    expect(parseStandardTerms("\r\n# Title\r\n\r\n\r\n   \r\n1. Clause.\r\n")).toEqual([{ kind: "heading", text: "Title" }, clause("1", "Clause.")]);
  });

  it("keeps single line breaks inside a block", () => {
    expect(parseStandardTerms("1. Line one\nline two")[0]).toEqual(clause("1", "Line one\nline two"));
    expect(parseStandardTerms("Para one\n  continued\n\nPara two")).toHaveLength(2);
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

describe("clauseLabel", () => {
  it("adds a period to numbers and leaves lettered markers alone", () => {
    expect(["1", "1.2", "(a)"].map(clauseLabel)).toEqual(["1.", "1.2.", "(a)"]);
  });
});

// The real templates the app ships with.
describe.each(DOCUMENTS.map((d) => [d.spec.filename, d] as const))("templates/%s", (_, { spec: document, terms }) => {
  it("starts with a heading and has numbered clauses", () => {
    expect(terms[0].kind).toBe("heading");
    expect(terms.filter((b) => b.kind === "clause").length).toBeGreaterThan(5);
  });

  it("leaves no raw markdown or HTML in the parsed text", () => {
    const text = terms.map((b) => (b.kind === "heading" ? b.text : plain(b.content))).join("\n");
    expect(text).not.toMatch(/\*\*|<\/?span|<https?:|\]\(|^#/m);
  });

  it("numbers sections 1, 2, 3... in order", () => {
    const sections = terms.filter((b) => b.kind === "clause" && b.depth === 0).map((b) => b.kind === "clause" && b.number);
    expect(sections).toEqual(sections.map((_, i) => String(i + 1)));
  });

  it("only nests clauses one level deeper than their parent", () => {
    let depth = 0;
    for (const block of terms) {
      if (block.kind !== "clause") continue;
      expect(block.depth).toBeLessThanOrEqual(depth + 1);
      depth = block.depth;
    }
  });

  it("only references terms the cover page defines", () => {
    const cover = buildCoverPage(document, data(document.id));
    const coverText = [...cover.partyLabels, ...cover.sections.flatMap((s) => [s.title, ...s.paragraphs.map(plain)]), "Notice Address"]
      .join("\n")
      .toLowerCase();
    const referenced = new Set(terms.flatMap(contentOf).filter((i) => i.kind === "term").map((i) => i.text.replace(/['’]s$|s$/, "")));
    for (const term of referenced) expect(coverText, term).toContain(term.toLowerCase());
  });
});

describe("templates/Mutual-NDA.md", () => {
  const terms = DOCUMENTS.find((d) => d.spec.id === "mutual-nda")!.terms;

  it("starts with the Standard Terms heading", () => {
    expect(terms[0]).toEqual({ kind: "heading", text: "Standard Terms" });
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
    expect(plain(contentOf(last))).toBe("Common Paper Mutual Non-Disclosure Agreement Version 1.0 free to use under CC BY 4.0.");
    expect(contentOf(last).filter((i) => i.kind === "link")).toEqual([
      { kind: "link", text: "Version 1.0", href: "https://commonpaper.com/standards/mutual-nda/1.0/" },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
    ]);
  });

  it("references the six cover page terms", () => {
    const referenced = new Set(terms.flatMap(contentOf).filter((i) => i.kind === "term").map((i) => i.text));
    expect([...referenced].sort()).toEqual(["Effective Date", "Governing Law", "Jurisdiction", "MNDA Term", "Purpose", "Term of Confidentiality"]);
  });
});

describe("templates/Pilot-Agreement.md", () => {
  const terms = DOCUMENTS.find((d) => d.spec.id === "pilot-agreement")!.terms;
  const find = (number: string) => terms.find((b) => b.kind === "clause" && b.number === number);

  it("nests clauses under sections", () => {
    expect(plain(contentOf(find("1")!))).toBe("Pilot Access");
    const clause = find("1.1")!;
    expect(clause).toMatchObject({ depth: 1 });
    expect(contentOf(clause)[0]).toEqual({ kind: "text", text: "Access and Use.", bold: true });
  });

  it("puts lettered sub-clauses under their clause", () => {
    const i = terms.indexOf(find("2.2")!);
    expect(terms.slice(i + 1, i + 4).map((b) => b.kind === "clause" && [b.number, b.depth])).toEqual([
      ["(a)", 2],
      ["(b)", 2],
      ["(c)", 2],
    ]);
  });

  it("uses the spec's party roles", () => {
    expect(spec("pilot-agreement").parties).toEqual(["Provider", "Customer"]);
  });
});
