"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { NdaChat } from "@/components/NdaChat";
import { NdaForm } from "@/components/NdaForm";
import { NdaPreview } from "@/components/NdaPreview";
import { buildCoverPage, defaultFormData, missingRequiredFields, pdfFilename, type NdaFormData, type TermsBlock } from "@/lib/nda";
import { unsupportedPdfCharacters } from "@/lib/pdf-fonts";
import { useNdaChat } from "@/lib/useNdaChat";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "fields", label: "Fields" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function NdaBuilder({ terms }: { terms: TermsBlock[] }) {
  const [data, setData] = useState<NdaFormData>(defaultFormData);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const chat = useNdaChat(data, setData);

  const cover = useMemo(() => buildCoverPage(data), [data]);
  const missing = missingRequiredFields(data);
  const unsupported = unsupportedPdfCharacters(data);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      // Loaded on demand: the PDF renderer is large and only needed on download.
      const [{ pdf }, { NdaPdf, registerPdfFonts }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/NdaPdf")]);
      registerPdfFonts("/fonts");
      const blob = await pdf(<NdaPdf cover={cover} terms={terms} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename(data);
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
        <div role="tablist" aria-label="How to fill in the NDA" className="flex shrink-0 gap-6 border-b border-zinc-200 px-6">
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
          <NdaChat messages={chat.messages} pending={chat.pending} error={chat.error} onSend={chat.send} onRetry={chat.retry} />
        </div>
        <div
          role="tabpanel"
          id="panel-fields"
          aria-labelledby="tab-fields"
          hidden={tab !== "fields"}
          className="min-h-0 flex-1 px-6 pt-6 pb-6 lg:overflow-y-auto"
        >
          <NdaForm data={data} onChange={setData} />
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={download}
            disabled={missing.length > 0 || downloading}
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
        <div className="mx-auto max-w-[8.5in] bg-white px-10 py-12 shadow-md sm:px-16">
          <NdaPreview cover={cover} terms={terms} />
        </div>
      </section>
    </div>
  );
}
