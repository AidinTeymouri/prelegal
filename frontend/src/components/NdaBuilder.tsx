"use client";

import { useMemo, useState } from "react";
import { NdaForm } from "@/components/NdaForm";
import { NdaPreview } from "@/components/NdaPreview";
import { buildCoverPage, defaultFormData, missingRequiredFields, pdfFilename, type NdaFormData, type TermsBlock } from "@/lib/nda";

export function NdaBuilder({ terms }: { terms: TermsBlock[] }) {
  const [data, setData] = useState<NdaFormData>(defaultFormData);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cover = useMemo(() => buildCoverPage(data), [data]);
  const missing = missingRequiredFields(data);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      // Loaded on demand: the PDF renderer is large and only needed on download.
      const [{ pdf }, { NdaPdf }] = await Promise.all([import("@react-pdf/renderer"), import("@/components/NdaPdf")]);
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

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,460px)_1fr]">
      <aside className="border-zinc-200 bg-white px-6 pt-6 lg:h-[calc(100vh-57px)] lg:overflow-y-auto lg:border-r">
        <NdaForm data={data} onChange={setData} />

        <div className="sticky bottom-0 -mx-6 mt-6 border-t border-zinc-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={download}
            disabled={missing.length > 0 || downloading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          {missing.length > 0 && <p className="mt-2 text-xs text-zinc-500">Still needed: {missing.join(", ")}</p>}
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
