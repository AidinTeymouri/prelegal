const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

// "just now", "5 minutes ago", "yesterday", then the date after a week.
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds >= 7 * 86_400) return then.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const format = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const [unit, size] = UNITS.find(([, size]) => seconds >= size)!;
  return format.format(-Math.floor(seconds / size), unit);
}
