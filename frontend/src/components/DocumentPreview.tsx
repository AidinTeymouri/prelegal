import type { CoverPage } from "@/lib/cover";
import type { Inline } from "@/lib/inline";
import { clauseLabel, type TermsBlock } from "@/lib/terms";

function Inlines({ content }: { content: Inline[] }) {
  return content.map((inline, i) => {
    switch (inline.kind) {
      case "text":
        return inline.bold ? <strong key={i}>{inline.text}</strong> : <span key={i}>{inline.text}</span>;
      case "term":
        return (
          <span key={i} className={`underline decoration-zinc-400 underline-offset-2 ${inline.bold ? "font-bold" : "font-medium"}`}>
            {inline.text}
          </span>
        );
      case "value":
        return inline.placeholder ? (
          <span key={i} className="rounded bg-amber-100 px-1 text-amber-800">
            {inline.text}
          </span>
        ) : (
          <span key={i} className="rounded bg-indigo-50 px-1 font-medium text-indigo-900">
            {inline.text}
          </span>
        );
      case "link":
        return (
          <a key={i} href={inline.href} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
            {inline.text}
          </a>
        );
    }
  });
}

export function DocumentPreview({ cover, terms }: { cover: CoverPage; terms: TermsBlock[] }) {
  return (
    <article className="space-y-4 font-serif text-[13px] leading-relaxed text-zinc-900">
      <h1 className="text-center text-xl font-bold">{cover.title}</h1>
      <h2 className="font-bold">{cover.introHeading}</h2>
      <p>
        <Inlines content={cover.intro} />
      </p>

      {cover.sections.map((section) => (
        <section key={section.title}>
          <h2 className="font-bold">
            {section.title}
            {section.hint && <span className="ml-2 text-xs font-normal italic text-zinc-500">{section.hint}</span>}
          </h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              <Inlines content={p} />
            </p>
          ))}
        </section>
      ))}

      <p>{cover.signingStatement}</p>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <td className="w-1/4 border border-zinc-300 p-2" />
            {cover.partyLabels.map((label) => (
              <th key={label} scope="col" className="border border-zinc-300 p-2 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cover.signatureRows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="border border-zinc-300 p-2 align-top font-semibold">
                {row.label}
                {row.hint && <div className="text-xs font-normal italic text-zinc-500">{row.hint}</div>}
              </th>
              {row.values.map((cell, i) => (
                <td key={i} className="h-10 border border-zinc-300 p-2 align-top">
                  <Inlines content={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-zinc-500">
        <Inlines content={cover.attribution} />
      </p>

      <hr className="my-8 border-zinc-300" />

      {terms.map((block, i) => {
        switch (block.kind) {
          case "heading":
            return (
              <h1 key={i} className="text-center text-xl font-bold">
                {block.text}
              </h1>
            );
          case "clause":
            return (
              <p key={i} className="flex gap-2" style={{ marginLeft: `${block.depth * 1.5}rem` }}>
                <span className="shrink-0">{clauseLabel(block.number)}</span>
                <span>
                  <Inlines content={block.content} />
                </span>
              </p>
            );
          case "paragraph":
            return (
              <p key={i} className="text-xs text-zinc-500">
                <Inlines content={block.content} />
              </p>
            );
        }
      })}
    </article>
  );
}
