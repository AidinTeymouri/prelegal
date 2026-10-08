// The Prelegal mark (a document with a folded corner) and wordmark.
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="7" className={inverted ? "fill-white" : "fill-brand-navy"} />
        <path d="M10 7h9l5 5v13a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" className={inverted ? "fill-brand-navy" : "fill-white"} />
        <path d="M19 7v5h5Z" className="fill-brand-yellow" />
        <path d="M12 16h9M12 19.5h9M12 23h5" strokeWidth="1.6" strokeLinecap="round" className={inverted ? "stroke-white" : "stroke-brand-navy"} />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-brand-navy"}`}>Prelegal</span>
    </span>
  );
}
