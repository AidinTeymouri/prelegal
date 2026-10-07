// Document model for the Common Paper Mutual NDA (Version 1.0).
// The HTML preview and the PDF both render from these structures, so they
// always show the same content.

export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type NdaFormData = {
  purpose: string;
  effectiveDate: string; // yyyy-mm-dd
  mndaTermType: "expires" | "until-terminated";
  mndaTermYears: number;
  confidentialityType: "years" | "perpetual";
  confidentialityYears: number;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

const emptyParty: Party = { name: "", title: "", company: "", noticeAddress: "" };

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Defaults mirror the suggestions in the Common Paper cover page template.
export function defaultFormData(): NdaFormData {
  return {
    purpose: "Evaluating whether to enter into a business relationship with the other party.",
    effectiveDate: todayIso(),
    mndaTermType: "expires",
    mndaTermYears: 1,
    confidentialityType: "years",
    confidentialityYears: 1,
    governingLaw: "",
    jurisdiction: "",
    modifications: "",
    party1: { ...emptyParty },
    party2: { ...emptyParty },
  };
}

// The fields that must be filled in before the NDA can be downloaded.
export function missingRequiredFields(data: NdaFormData): string[] {
  const required: [string, string][] = [
    ["Purpose", data.purpose],
    ["Effective date", formatDate(data.effectiveDate)],
    ["Governing law", data.governingLaw],
    ["Jurisdiction", data.jurisdiction],
    ["Party 1 company", data.party1.company],
    ["Party 2 company", data.party2.company],
  ];
  return required.filter(([, value]) => !value.trim()).map(([label]) => label);
}

// Latin letters that don't decompose into a base letter plus an accent.
const LATIN_LETTERS: Record<string, string> = {
  Ł: "L", ł: "l", Ø: "O", ø: "o", Đ: "D", đ: "d", Ħ: "H", ħ: "h", ı: "i",
  ß: "ss", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", Þ: "Th", þ: "th", Ð: "D", ð: "d",
};

// e.g. "Mutual-NDA_Acme-Inc_Globex.pdf"; accents are dropped ("Société" -> "Societe")
// and companies with no usable characters are left out.
export function pdfFilename(data: NdaFormData): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x00-\x7f]/g, (c) => LATIN_LETTERS[c] ?? c)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
  const parties = [data.party1.company, data.party2.company].map(slug).filter(Boolean);
  return ["Mutual-NDA", ...parties].join("_") + ".pdf";
}

// ---------------------------------------------------------------------------
// Inline text

export type Inline =
  | { kind: "text"; text: string; bold?: boolean }
  // A reference to a term defined on the cover page (e.g. "Purpose").
  | { kind: "term"; text: string }
  // A value from the form, or a placeholder shown while it is still empty.
  | { kind: "value"; text: string; placeholder: boolean }
  | { kind: "link"; text: string; href: string };

function value(text: string, placeholder: string): Inline {
  const trimmed = text.trim();
  return trimmed
    ? { kind: "value", text: trimmed, placeholder: false }
    : { kind: "value", text: placeholder, placeholder: true };
}

function years(n: number): string {
  return n === 1 ? "1 year" : `${n} years`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  // new Date() maps years 0–99 to 1900–1999, e.g. while a year is half typed.
  date.setFullYear(y);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Cover page (wording from templates/Mutual-NDA-coverpage.md in the repo root)

export type CoverSection = {
  title: string;
  hint?: string;
  paragraphs: Inline[][];
};

export type SignatureRow = {
  label: string;
  hint?: string;
  values: [Inline[], Inline[]];
};

export type CoverPage = {
  title: string;
  introHeading: string;
  intro: Inline[];
  sections: CoverSection[];
  signingStatement: string;
  signatureRows: SignatureRow[];
  attribution: Inline[];
};

const STANDARD_TERMS_URL = "https://commonpaper.com/standards/mutual-nda/1.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

export function buildCoverPage(data: NdaFormData): CoverPage {
  const mndaTerm: Inline[] =
    data.mndaTermType === "expires"
      ? [{ kind: "text", text: "Expires " }, value(years(data.mndaTermYears), "[number of years]"), { kind: "text", text: " from Effective Date." }]
      : [{ kind: "text", text: "Continues until terminated in accordance with the terms of the MNDA." }];

  const confidentiality: Inline[] =
    data.confidentialityType === "years"
      ? [
          value(years(data.confidentialityYears), "[number of years]"),
          {
            kind: "text",
            text: " from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.",
          },
        ]
      : [{ kind: "text", text: "In perpetuity." }];

  const partyRow = (label: string, field: keyof Party, hint?: string): SignatureRow => ({
    label,
    hint,
    // Empty party details are left blank (no placeholder) so they can be filled in by hand.
    values: [data.party1[field], data.party2[field]].map((v) => (v.trim() ? [value(v, "")] : [])) as [Inline[], Inline[]],
  });
  const blankRow = (label: string): SignatureRow => ({ label, values: [[], []] });

  return {
    title: "Mutual Non-Disclosure Agreement",
    introHeading: "USING THIS MUTUAL NON-DISCLOSURE AGREEMENT",
    intro: [
      { kind: "text", text: "This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“" },
      { kind: "text", text: "Cover Page", bold: true },
      { kind: "text", text: "”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“" },
      { kind: "text", text: "Standard Terms", bold: true },
      { kind: "text", text: "”) identical to those posted at " },
      { kind: "link", text: "commonpaper.com/standards/mutual-nda/1.0", href: STANDARD_TERMS_URL },
      {
        kind: "text",
        text: ". Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.",
      },
    ],
    sections: [
      { title: "Purpose", hint: "How Confidential Information may be used", paragraphs: [[value(data.purpose, "[Purpose]")]] },
      { title: "Effective Date", paragraphs: [[value(formatDate(data.effectiveDate), "[Effective Date]")]] },
      { title: "MNDA Term", hint: "The length of this MNDA", paragraphs: [mndaTerm] },
      { title: "Term of Confidentiality", hint: "How long Confidential Information is protected", paragraphs: [confidentiality] },
      {
        title: "Governing Law & Jurisdiction",
        paragraphs: [
          [{ kind: "text", text: "Governing Law: " }, value(data.governingLaw, "[Fill in state]")],
          [{ kind: "text", text: "Jurisdiction: " }, value(data.jurisdiction, "[Fill in city or county and state]")],
        ],
      },
      {
        title: "MNDA Modifications",
        paragraphs: [[data.modifications.trim() ? value(data.modifications, "") : { kind: "text", text: "None." }]],
      },
    ],
    signingStatement: "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    signatureRows: [
      blankRow("Signature"),
      partyRow("Print Name", "name"),
      partyRow("Title", "title"),
      partyRow("Company", "company"),
      partyRow("Notice Address", "noticeAddress", "Use either email or postal address"),
      blankRow("Date"),
    ],
    attribution: [
      { kind: "text", text: "Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under " },
      { kind: "link", text: "CC BY 4.0", href: LICENSE_URL },
      { kind: "text", text: "." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Standard terms (parsed from templates/Mutual-NDA.md)

export type TermsBlock =
  | { kind: "heading"; text: string }
  | { kind: "clause"; number: string; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] };

// Matches **bold**, <span class="coverpage_link">Term</span> and [text](url).
const INLINE_PATTERN = /\*\*(.+?)\*\*|<span class="coverpage_link">(.+?)<\/span>|\[([^\]]+)\]\(([^)]+)\)/g;

function parseInline(source: string): Inline[] {
  const inlines: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    if (match.index > last) inlines.push({ kind: "text", text: source.slice(last, match.index) });
    const [, bold, term, linkText, href] = match;
    if (bold !== undefined) inlines.push({ kind: "text", text: bold, bold: true });
    else if (term !== undefined) inlines.push({ kind: "term", text: term });
    else inlines.push({ kind: "link", text: linkText, href });
    last = match.index + match[0].length;
  }
  if (last < source.length) inlines.push({ kind: "text", text: source.slice(last) });
  return inlines;
}

export function parseStandardTerms(markdown: string): TermsBlock[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): TermsBlock => {
      const heading = block.match(/^#+\s+(.*)$/);
      if (heading) return { kind: "heading", text: heading[1] };
      const clause = block.match(/^(\d+)\.\s+([\s\S]*)$/);
      if (clause) return { kind: "clause", number: clause[1], content: parseInline(clause[2]) };
      return { kind: "paragraph", content: parseInline(block) };
    });
}
