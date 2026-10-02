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

## Testing

```bash
npm test            # unit and component tests (Vitest + React Testing Library), incl. a real PDF render
npm run test:e2e    # end-to-end tests (Playwright) against a production build on port 3100
npm run lint && npm run typecheck
```

First-time E2E setup: `npx playwright install chromium`.

- `src/**/*.test.ts(x)` – the document model, the standard terms template, each component, and the generated PDF's text (read back with `pdf-parse`). Tests run in the `America/Los_Angeles` time zone so date bugs show up.
- `e2e/nda.spec.ts` – the whole flow in a browser: live preview, validation, downloading and reading the PDF, keyboard use, time zones and phone layout.
- [`MANUAL_TESTING.md`](MANUAL_TESTING.md) – the checklist to run by hand before a release (visual checks, PDF viewers, printing, screen readers, browsers).
