// Test helpers: the real documents and templates from the repo's templates/ folder,
// loaded as app/page.tsx loads them at build time.
import { readFileSync } from "node:fs";
import path from "node:path";
import { defaultData, type DocumentData, type DocumentSpec, type LoadedDocument, type Party } from "@/lib/documents";
import { parseStandardTerms } from "@/lib/terms";

export const TEMPLATES = path.join(process.cwd(), "..", "templates");

export const readTemplate = (filename: string) => readFileSync(path.join(TEMPLATES, filename), "utf8");

export const SPECS: DocumentSpec[] = JSON.parse(readTemplate("documents.json")).documents;

export const DOCUMENTS: LoadedDocument[] = SPECS.map((spec) => ({ spec, terms: parseStandardTerms(readTemplate(spec.filename)) }));

export function spec(id: string): DocumentSpec {
  const found = SPECS.find((s) => s.id === id);
  if (!found) throw new Error(`No document ${id}`);
  return found;
}

// A document's default data with some values and party details changed.
export function data(id: string, values: DocumentData["values"] = {}, parties: Partial<Party>[] = []): DocumentData {
  const defaults = defaultData(spec(id));
  return {
    values: { ...defaults.values, ...values },
    parties: [{ ...defaults.parties[0], ...parties[0] }, { ...defaults.parties[1], ...parties[1] }],
  };
}
