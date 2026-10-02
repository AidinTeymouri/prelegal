import { readFile } from "node:fs/promises";
import path from "node:path";
import { NdaBuilderClient } from "@/components/NdaBuilderClient";
import { parseStandardTerms } from "@/lib/nda";

export default async function Home() {
  const markdown = await readFile(path.join(process.cwd(), "templates", "Mutual-NDA.md"), "utf8");
  const terms = parseStandardTerms(markdown);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[57px] items-center justify-between border-b border-zinc-200 bg-white px-6">
        <div>
          <span className="font-semibold text-zinc-900">Prelegal</span>
          <span className="ml-3 text-sm text-zinc-500">Mutual NDA creator</span>
        </div>
        <span className="text-xs text-zinc-400">Template by Common Paper · CC BY 4.0</span>
      </header>
      <NdaBuilderClient terms={terms} />
    </div>
  );
}
