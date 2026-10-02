# Prelegal – Mutual NDA creator

A Next.js app that fills in the [Common Paper Mutual NDA](https://commonpaper.com/standards/mutual-nda/1.0) from a form, shows a live preview, and downloads the completed agreement as a PDF.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- `templates/Mutual-NDA.md` – a copy of the standard terms from the repo-root `templates/` directory (CC BY 4.0, see `templates/LICENSE.txt`).
- `src/lib/nda.ts` – the document model: form data and defaults, the cover page built from the form, and a parser that turns the standard terms markdown into blocks.
- `src/components/NdaPreview.tsx` and `src/components/NdaPdf.tsx` – render the same document model as HTML (live preview) and as a PDF (via `@react-pdf/renderer`, loaded only when downloading).
- `src/components/NdaBuilder.tsx` – holds the form state and ties the form, preview and download together.
