"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DocumentChat } from "@/components/DocumentChat";
import { DocumentForm } from "@/components/DocumentForm";
import { DocumentPreview } from "@/components/DocumentPreview";
import type { Draft } from "@/lib/api";
import { buildCoverPage } from "@/lib/cover";
import { carryOver, missingRequiredFields, pdfFilename, type LoadedDocument } from "@/lib/documents";
import { unsupportedPdfCharacters } from "@/lib/pdf-fonts";
import { useDocumentChat } from "@/lib/useDocumentChat";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "fields", label: "Fields" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function DocumentBuilder({ documents }: { documents: LoadedDocument[] }) {
  const [draft, setDraft] = useState<Draft>({ document: null, fields: null });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const chat = useDocumentChat(draft, setDraft);

  const current = documents.find((d) => d.spec.id === draft.document);
  const data = current && draft.fields;
  const cover = useMemo(() => current && data && buildCoverPage(current.spec, data), [current, data]);
  const missing = current && data ? missingRequiredFields(current.spec, data) : [];
  const unsupported = data ? unsupportedPdfCharacters(data) : [];

  // Switching keeps the parties and the details both documents share.
  function choose(id: string) {
    const next = documents.find((d) => d.spec.id === id);
    if (!next) return;
    setDraft((d) => {
      const previous = documents.find((doc) => doc.spec.id === d.document)?.spec ?? null;
      return { document: id, fields: carryOver(previous, d.fields, next.spec) };
    });
  }

  async function download() {
    if (!current || !data || !cover) return;
    setDownloading(true);
    setError(null);
    try {
      // Loaded on demand: the PDF renderer is large and only needed on download.
      const [{ pdf }, { DocumentPdf, registerPdfFonts }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/DocumentPdf")]);
      registerPdfFonts("/fonts");
      const blob = await pdf(<DocumentPdf cover={cover} terms={current.terms} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename(current.spec, data);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error(e);
      setError("Something went wrong generating the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  // Left and right arrows move between the tabs, as in the WAI-ARIA tabs pattern.
  function onTabKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,460px)_1fr]">
      <aside className="flex flex-col border-zinc-200 bg-white lg:h-[calc(100vh-57px)] lg:border-r">
        <div className="shrink-0 border-b border-zinc-200 px-6 py-3">
          <div className="flex items-center gap-3 text-sm">
            <label htmlFor="document" className="font-medium text-zinc-800">
              Document
            </label>
            <select
              id="document"
              value={draft.document ?? ""}
              onChange={(e) => choose(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            >
              <option value="" disabled>
                Choose a document…
              </option>
              {documents.map(({ spec }) => (
                <option key={spec.id} value={spec.id}>
                  {spec.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div role="tablist" aria-label="How to fill in the document" className="flex shrink-0 gap-6 border-b border-zinc-200 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKeyDown}
              className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                tab === t.id ? "border-brand-blue text-brand-navy" : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted so switching tabs keeps focus, scroll position and unsent text. */}
        <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== "chat"} className="flex min-h-0 flex-1 flex-col">
          <DocumentChat messages={chat.messages} pending={chat.pending} error={chat.error} onSend={chat.send} onRetry={chat.retry} />
        </div>
        <div
          role="tabpanel"
          id="panel-fields"
          aria-labelledby="tab-fields"
          hidden={tab !== "fields"}
          className="min-h-0 flex-1 px-6 pt-6 pb-6 lg:overflow-y-auto"
        >
          {current && data ? (
            // Keyed by document so number inputs don't keep a draft from another document.
            <DocumentForm key={current.spec.id} spec={current.spec} data={data} onChange={(fields) => setDraft({ document: current.spec.id, fields })} />
          ) : (
            <p className="text-sm text-zinc-500">Choose a document above, or tell the assistant on the Chat tab what you need.</p>
          )}
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={download}
            disabled={!current || missing.length > 0 || downloading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          {missing.length > 0 && <p className="mt-2 text-xs text-zinc-500">Still needed: {missing.join(", ")}</p>}
          {unsupported.length > 0 && (
            <p role="status" className="mt-2 text-xs text-amber-700">
              The PDF can’t show these characters, so they will come out garbled: {unsupported.join(" ")}. Latin, Greek and Cyrillic
              letters work. Consider a romanized spelling.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      </aside>

      <section className="bg-zinc-100 px-4 py-8 lg:h-[calc(100vh-57px)] lg:overflow-y-auto">
        {current && cover ? (
          <div className="mx-auto max-w-[8.5in] bg-white px-10 py-12 shadow-md sm:px-16">
            <DocumentPreview cover={cover} terms={current.terms} />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <h2 className="text-lg font-semibold text-brand-navy">What would you like to draft?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Tell the assistant what you need, or pick one of the Common Paper standard agreements to start from.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {documents.map(({ spec }) => (
                <li key={spec.id}>
                  <button
                    type="button"
                    onClick={() => choose(spec.id)}
                    className="flex h-full w-full flex-col justify-start rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm hover:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                  >
                    <span className="block text-sm font-semibold text-brand-navy">{spec.name}</span>
                    <span className="mt-1 block text-xs text-zinc-600">{spec.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
