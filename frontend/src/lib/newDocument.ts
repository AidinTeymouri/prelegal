import { navigate } from "@/lib/route";

// A random id for a new document. crypto.randomUUID only exists on HTTPS and localhost.
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Documents started in this tab, which may not be saved yet: the editor doesn't try to load
// them, so it opens without a loading step.
const started = new Set<string>();
export const isStartedHere = (id: string) => started.has(id);
// Once its editor closes, a document has been saved (or there was nothing to save).
export const forgetStarted = (id: string) => started.delete(id);

export function startNewDocument() {
  const id = newId();
  started.add(id);
  navigate({ page: "editor", id });
}
