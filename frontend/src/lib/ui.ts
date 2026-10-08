// Shared Tailwind classes, so buttons and inputs look the same on every screen.

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:bg-zinc-100 disabled:text-zinc-500";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed";

const BUTTON_VARIANTS = {
  // Submit and main actions use the brand purple.
  primary: "bg-brand-purple text-white shadow-sm hover:bg-brand-purple-dark disabled:bg-zinc-300 disabled:text-white",
  secondary: "border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-60",
  link: "text-brand-blue-dark hover:underline",
};

const BUTTON_SIZES = { sm: "px-3 py-1.5", md: "px-4 py-2.5" };

export function buttonClass(variant: keyof typeof BUTTON_VARIANTS = "primary", size: keyof typeof BUTTON_SIZES = "md"): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${variant === "link" ? "" : BUTTON_SIZES[size]}`;
}
