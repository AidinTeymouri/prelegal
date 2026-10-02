import { PDF_FONT_COVERAGE } from "@/lib/pdf-font-coverage";
import type { NdaFormData } from "@/lib/nda";

function canDraw(codePoint: number): boolean {
  let lo = 0;
  let hi = PDF_FONT_COVERAGE.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, last] = PDF_FONT_COVERAGE[mid];
    if (codePoint < first) hi = mid - 1;
    else if (codePoint > last) lo = mid + 1;
    else return true;
  }
  return false;
}

// Characters in the form that the PDF fonts can't draw (e.g. Chinese, Arabic or
// emoji), in the order they first appear. They would come out garbled in the PDF.
export function unsupportedPdfCharacters(data: NdaFormData): string[] {
  const text = [
    data.purpose,
    data.governingLaw,
    data.jurisdiction,
    data.modifications,
    ...[data.party1, data.party2].flatMap((p) => [p.company, p.name, p.title, p.noticeAddress]),
  ].join("");
  const unsupported = new Set<string>();
  for (const char of text) {
    if (/\s/.test(char)) continue; // line breaks and spaces are laid out, not drawn
    if (!canDraw(char.codePointAt(0)!)) unsupported.add(char);
  }
  return [...unsupported];
}
