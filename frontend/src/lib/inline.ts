// Inline text shared by the cover page and the standard terms. The HTML preview and
// the PDF both render from these structures, so they always show the same content.

export type Inline =
  | { kind: "text"; text: string; bold?: boolean }
  // A reference to a term defined on the cover page (e.g. "Purpose" or "Customer's").
  | { kind: "term"; text: string; bold?: boolean }
  // A value from the form, or a placeholder shown while it is still empty.
  | { kind: "value"; text: string; placeholder: boolean }
  | { kind: "link"; text: string; href: string };

export function value(text: string, placeholder: string): Inline {
  const trimmed = text.trim();
  return trimmed ? { kind: "value", text: trimmed, placeholder: false } : { kind: "value", text: placeholder, placeholder: true };
}

// The markup in the Common Paper templates, in order of precedence:
//   <span class="header_2|header_3" id="1.1">Heading</span>  a section or clause heading (bold)
//   <span class="coverpage_link|orderform_link|...">Term</span>  a term defined on the cover page
//   <span id="4.1">...</span>  an anchor, possibly wrapping other markup
//   **bold**, [text](url) and <https://...>
const INLINE_PATTERN =
  /<span class="header_\d"[^>]*>(.*?)<\/span>|<span class="\w+_link"[^>]*>(.*?)<\/span>|<span id="[^"]*">(.*?)<\/span>|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|<(https?:\/\/[^>]+)>/g;

function withBold(inlines: Inline[]): Inline[] {
  return inlines.map((inline) => (inline.kind === "text" || inline.kind === "term" ? { ...inline, bold: true } : inline));
}

// One template link has no scheme ("commonpaper.com/..."), which a browser would treat as a relative path.
const absolute = (href: string) => (/^[a-z]+:/i.test(href) ? href : `https://${href}`);

export function parseInline(source: string): Inline[] {
  const inlines: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_PATTERN)) {
    if (match.index > last) inlines.push({ kind: "text", text: source.slice(last, match.index) });
    const [, heading, term, anchored, bold, linkText, href, autolink] = match;
    if (heading !== undefined) inlines.push(...withBold(parseInline(heading)));
    else if (term !== undefined) inlines.push({ kind: "term", text: term.replaceAll("**", "") });
    else if (anchored !== undefined) inlines.push(...parseInline(anchored));
    else if (bold !== undefined) inlines.push(...withBold(parseInline(bold)));
    else if (autolink !== undefined) inlines.push({ kind: "link", text: autolink, href: autolink });
    else inlines.push({ kind: "link", text: linkText, href: absolute(href) });
    last = match.index + match[0].length;
  }
  if (last < source.length) inlines.push({ kind: "text", text: source.slice(last) });
  return inlines;
}
