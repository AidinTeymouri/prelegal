import { readFile } from "node:fs/promises";
import path from "node:path";
import { App } from "@/components/App";
import { parseStandardTerms } from "@/lib/nda";

// Runs at build time (static export): the standard terms are baked into the page.
export default async function Home() {
  const markdown = await readFile(path.join(process.cwd(), "..", "templates", "Mutual-NDA.md"), "utf8");
  return <App terms={parseStandardTerms(markdown)} />;
}
