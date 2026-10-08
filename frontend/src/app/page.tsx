import { readFile } from "node:fs/promises";
import path from "node:path";
import { App } from "@/components/App";
import type { DocumentSpec, LoadedDocument } from "@/lib/documents";
import { parseStandardTerms } from "@/lib/terms";

const TEMPLATES = path.join(process.cwd(), "..", "templates");

// Runs at build time (static export): the documents and their standard terms are baked into the page.
export default async function Home() {
  const { documents } = JSON.parse(await readFile(path.join(TEMPLATES, "documents.json"), "utf8")) as { documents: DocumentSpec[] };
  const loaded: LoadedDocument[] = await Promise.all(
    documents.map(async (spec) => ({ spec, terms: parseStandardTerms(await readFile(path.join(TEMPLATES, spec.filename), "utf8")) })),
  );
  return <App documents={loaded} />;
}
