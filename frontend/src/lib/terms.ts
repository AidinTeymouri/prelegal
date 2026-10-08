import { parseInline, type Inline } from "@/lib/inline";

// The standard terms, parsed from a Common Paper template in templates/ (Markdown with
// inline HTML). Clauses are numbered lists nested by four-space indents:
//   1. <span class="header_2">Section</span>
//       1. <span class="header_3">Clause.</span> Text...       -> 1.1
//           a. Text...                                         -> (a)

export type TermsBlock =
  | { kind: "heading"; text: string }
  // number is "1", "1.2", "(a)" or "(i)"; depth is 0 for top-level clauses.
  | { kind: "clause"; number: string; depth: number; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] };

// How a clause number is shown: "1.", "1.2." or "(a)".
export const clauseLabel = (number: string) => (/^\d/.test(number) ? `${number}.` : number);

const LIST_ITEM = /^( *)(\d+|[a-z]+)\.\s+(.*)$/;

export function parseStandardTerms(markdown: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  // The number of the latest numbered clause at each depth, for "1.2"-style numbers.
  const numbers: string[] = [];
  // The clause or paragraph a following line continues, until a blank line.
  let open: { block: TermsBlock & { content: Inline[] }; text: string } | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      open = null;
      continue;
    }
    const heading = line.match(/^#+\s+(.*)$/);
    const item = line.match(LIST_ITEM);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1].trim() });
      open = null;
    } else if (item) {
      const [, indent, marker, text] = item;
      const depth = Math.floor(indent.length / 4);
      let number: string;
      if (/^\d+$/.test(marker)) {
        number = depth > 0 && numbers[depth - 1] ? `${numbers[depth - 1]}.${marker}` : marker;
        numbers[depth] = number;
        numbers.length = depth + 1;
      } else {
        number = `(${marker})`;
      }
      const block = { kind: "clause" as const, number, depth, content: parseInline(text.trim()) };
      blocks.push(block);
      open = { block, text: text.trim() };
    } else if (open) {
      open.text += `\n${line.trim()}`;
      open.block.content = parseInline(open.text);
    } else {
      const block = { kind: "paragraph" as const, content: parseInline(line.trim()) };
      blocks.push(block);
      open = { block, text: line.trim() };
    }
  }
  return blocks;
}
