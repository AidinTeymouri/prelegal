// The legal documents Prelegal can draft, as listed in templates/documents.json (read at
// build time by app/page.tsx). backend/app/documents.py reads the same file; the field
// data, required fields and carry-over rules here mirror it.

import type { TermsBlock } from "@/lib/terms";

export type FieldType = "text" | "longtext" | "date" | "enum" | "int";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  description: string;
  default?: string | number; // "today" for a date field means the current date
  placeholder?: string;
  terms?: string[];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  unit?: string; // shown after a number input, e.g. "year(s)"
  // Only applies when another field has this value; a number field is shown inside that option.
  enabledWhen?: { field: string; equals: string };
};

export type DocumentSpec = {
  id: string;
  name: string;
  filename: string;
  description: string;
  coverTitle: string;
  version?: string;
  url?: string;
  parties: [string, string];
  sections: { title: string; fields: FieldSpec[] }[];
};

// A document with its standard terms, as passed from the page to the app.
export type LoadedDocument = { spec: DocumentSpec; terms: TermsBlock[] };

export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

// A document's field data: the cover page values (by field key) and the two parties.
export type DocumentData = {
  values: Record<string, string | number>;
  parties: [Party, Party];
};

export const emptyParty = (): Party => ({ name: "", title: "", company: "", noticeAddress: "" });

export const fieldsOf = (spec: DocumentSpec): FieldSpec[] => spec.sections.flatMap((section) => section.fields);

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function defaultData(spec: DocumentSpec): DocumentData {
  const values: DocumentData["values"] = {};
  for (const field of fieldsOf(spec)) {
    values[field.key] = field.default === "today" ? todayIso() : (field.default ?? "");
  }
  return { values, parties: [emptyParty(), emptyParty()] };
}

const isBlank = (value: string | number | undefined) => typeof value !== "number" && !value?.trim();

// Whether a field applies, e.g. the number of years only when the term "expires".
export const isEnabled = (field: FieldSpec, data: DocumentData) =>
  !field.enabledWhen || data.values[field.enabledWhen.field] === field.enabledWhen.equals;

// The fields that must be filled in before the document can be downloaded.
export function missingRequiredFields(spec: DocumentSpec, data: DocumentData): string[] {
  const missing = fieldsOf(spec)
    .filter((field) => field.required && isBlank(field.type === "date" ? formatDate(String(data.values[field.key] ?? "")) : data.values[field.key]))
    .map((field) => field.label);
  spec.parties.forEach((role, i) => {
    if (!data.parties[i].company.trim()) missing.push(`${role} company`);
  });
  return missing;
}

// Switching documents keeps the parties and every non-blank value the two documents share.
export function carryOver(from: DocumentSpec | null, data: DocumentData | null, to: DocumentSpec): DocumentData {
  const result = defaultData(to);
  if (!from || !data) return result;
  const fromTypes = new Map(fieldsOf(from).map((field) => [field.key, field.type]));
  for (const field of fieldsOf(to)) {
    const value = data.values[field.key];
    if (fromTypes.get(field.key) === field.type && value !== undefined && !isBlank(value)) result.values[field.key] = value;
  }
  return { values: result.values, parties: [{ ...data.parties[0] }, { ...data.parties[1] }] };
}

// Latin letters that don't decompose into a base letter plus an accent.
const LATIN_LETTERS: Record<string, string> = {
  Ł: "L", ł: "l", Ø: "O", ø: "o", Đ: "D", đ: "d", Ħ: "H", ħ: "h", ı: "i",
  ß: "ss", Æ: "AE", æ: "ae", Œ: "OE", œ: "oe", Þ: "Th", þ: "th", Ð: "D", ð: "d",
};

// e.g. "Mutual-NDA_Acme-Inc_Globex.pdf", named after the template; accents are dropped
// ("Société" -> "Societe") and companies with no usable characters are left out.
export function pdfFilename(spec: DocumentSpec, data: DocumentData): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\x00-\x7f]/g, (c) => LATIN_LETTERS[c] ?? c)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
  const parties = data.parties.map((party) => slug(party.company)).filter(Boolean);
  return [spec.filename.replace(/\.md$/, ""), ...parties].join("_") + ".pdf";
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
