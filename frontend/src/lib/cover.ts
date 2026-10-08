// The cover page that comes before the standard terms (called the Order Form or Key Terms
// in some documents). The Mutual NDA keeps the wording of templates/Mutual-NDA-coverpage.md;
// the other templates have no cover page, so theirs is built from the spec's fields.

import { fieldsOf, formatDate, type DocumentData, type DocumentSpec, type FieldSpec } from "@/lib/documents";
import { value, type Inline } from "@/lib/inline";

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
  partyLabels: [string, string];
  signatureRows: SignatureRow[];
  attribution: Inline[];
};

const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

export function buildCoverPage(spec: DocumentSpec, data: DocumentData): CoverPage {
  return spec.id === "mutual-nda" ? buildNdaCoverPage(spec, data) : buildGenericCoverPage(spec, data);
}

// The signature table, the same on every cover page. Empty party details are left
// blank (no placeholder) so they can be filled in by hand.
export function signatureRows(data: DocumentData): SignatureRow[] {
  const partyRow = (label: string, field: "name" | "title" | "company" | "noticeAddress", hint?: string): SignatureRow => ({
    label,
    hint,
    values: data.parties.map((p) => (p[field].trim() ? [value(p[field], "")] : [])) as [Inline[], Inline[]],
  });
  const blankRow = (label: string): SignatureRow => ({ label, values: [[], []] });
  return [
    blankRow("Signature"),
    partyRow("Print Name", "name"),
    partyRow("Title", "title"),
    partyRow("Company", "company"),
    partyRow("Notice Address", "noticeAddress", "Use either email or postal address"),
    blankRow("Date"),
  ];
}

export function attribution(spec: DocumentSpec): Inline[] {
  const version = spec.version ? ` (Version ${spec.version})` : "";
  return [
    { kind: "text", text: `Common Paper ${spec.name}${version} free to use under ` },
    { kind: "link", text: "CC BY 4.0", href: LICENSE_URL },
    { kind: "text", text: "." },
  ];
}

const optionLabel = (field: FieldSpec, raw: unknown) => field.options?.find((o) => o.value === raw)?.label ?? String(raw ?? "");

// A blank optional field prints "None": the standard terms say an unspecified variable
// means none or not applicable. A blank required field shows a placeholder until filled in.
function fieldValue(field: FieldSpec, data: DocumentData): Inline {
  const raw = data.values[field.key];
  const text = field.type === "date" ? formatDate(String(raw ?? "")) : field.type === "enum" ? optionLabel(field, raw) : String(raw ?? "");
  if (!text.trim() && !field.required) return { kind: "text", text: "None" };
  return value(text, field.placeholder ?? `[${field.label}]`);
}

function buildGenericCoverPage(spec: DocumentSpec, data: DocumentData): CoverPage {
  const standardTerms = `Common Paper ${spec.name} Standard Terms${spec.version ? ` Version ${spec.version}` : ""}`;
  const posted: Inline[] = spec.url
    ? [{ kind: "text", text: " identical to those posted at " }, { kind: "link", text: spec.url.replace(/^https:\/\//, ""), href: spec.url }]
    : [];
  const effective = fieldsOf(spec).some((field) => field.key === "effectiveDate") ? " as of the Effective Date" : "";
  return {
    title: spec.name,
    introHeading: `USING THIS ${spec.name.toUpperCase()}`,
    intro: [
      { kind: "text", text: `This ${spec.name} consists of: (1) this ${spec.coverTitle} (“` },
      { kind: "text", text: spec.coverTitle, bold: true },
      { kind: "text", text: `”) and (2) the ${standardTerms} (“` },
      { kind: "text", text: "Standard Terms", bold: true },
      { kind: "text", text: "”)" },
      ...posted,
      {
        kind: "text",
        text: `. Any modifications of the Standard Terms should be made on the ${spec.coverTitle}, which will control over conflicts with the Standard Terms.`,
      },
    ],
    sections: spec.sections.map((section) => ({
      title: section.title,
      paragraphs: section.fields.map((field) => [{ kind: "text", text: `${field.label}: `, bold: true }, fieldValue(field, data)]),
    })),
    signingStatement: `By signing this ${spec.coverTitle}, each party agrees to enter into this ${spec.name}${effective}.`,
    partyLabels: [spec.parties[0].toUpperCase(), spec.parties[1].toUpperCase()],
    signatureRows: signatureRows(data),
    attribution: attribution(spec),
  };
}

// ---------------------------------------------------------------------------
// The Mutual NDA, with the wording of templates/Mutual-NDA-coverpage.md

function years(n: number): string {
  return n === 1 ? "1 year" : `${n} years`;
}

function buildNdaCoverPage(spec: DocumentSpec, data: DocumentData): CoverPage {
  const v = (key: string) => String(data.values[key] ?? "");
  const n = (key: string) => Number(data.values[key]);

  const mndaTerm: Inline[] =
    v("mndaTermType") === "expires"
      ? [{ kind: "text", text: "Expires " }, value(years(n("mndaTermYears")), "[number of years]"), { kind: "text", text: " from Effective Date." }]
      : [{ kind: "text", text: "Continues until terminated in accordance with the terms of the MNDA." }];

  const confidentiality: Inline[] =
    v("confidentialityType") === "years"
      ? [
          value(years(n("confidentialityYears")), "[number of years]"),
          {
            kind: "text",
            text: " from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.",
          },
        ]
      : [{ kind: "text", text: "In perpetuity." }];

  return {
    title: spec.name,
    introHeading: "USING THIS MUTUAL NON-DISCLOSURE AGREEMENT",
    intro: [
      { kind: "text", text: "This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“" },
      { kind: "text", text: "Cover Page", bold: true },
      { kind: "text", text: "”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“" },
      { kind: "text", text: "Standard Terms", bold: true },
      { kind: "text", text: "”) identical to those posted at " },
      { kind: "link", text: "commonpaper.com/standards/mutual-nda/1.0", href: spec.url ?? "" },
      {
        kind: "text",
        text: ". Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.",
      },
    ],
    sections: [
      { title: "Purpose", hint: "How Confidential Information may be used", paragraphs: [[value(v("purpose"), "[Purpose]")]] },
      { title: "Effective Date", paragraphs: [[value(formatDate(v("effectiveDate")), "[Effective Date]")]] },
      { title: "MNDA Term", hint: "The length of this MNDA", paragraphs: [mndaTerm] },
      { title: "Term of Confidentiality", hint: "How long Confidential Information is protected", paragraphs: [confidentiality] },
      {
        title: "Governing Law & Jurisdiction",
        paragraphs: [
          [{ kind: "text", text: "Governing Law: " }, value(v("governingLaw"), "[Fill in state]")],
          [{ kind: "text", text: "Jurisdiction: " }, value(v("chosenCourts"), "[Fill in city or county and state]")],
        ],
      },
      {
        title: "MNDA Modifications",
        paragraphs: [[v("modifications").trim() ? value(v("modifications"), "") : { kind: "text", text: "None." }]],
      },
    ],
    signingStatement: "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    partyLabels: ["PARTY 1", "PARTY 2"],
    signatureRows: signatureRows(data),
    attribution: attribution(spec),
  };
}
