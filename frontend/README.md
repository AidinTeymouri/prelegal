# Prelegal – frontend

A Next.js app that fills in the [Common Paper Mutual NDA](https://commonpaper.com/standards/mutual-nda/1.0) from a form, shows a live preview, and downloads the completed agreement as a PDF. Users sign in first.

`npm run build` writes a static export to `out/`, which the FastAPI backend (`../backend`) serves together with the API. To run the whole app, use the scripts in `../scripts` (see the root README).

## Development

Start the backend (`cd ../backend && uv run uvicorn app.main:app --reload`), then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In development, `/api` requests are forwarded to the backend on port 8000 (see `next.config.ts`).

## How it works

- `src/app/page.tsx` – reads the standard terms from the repo-root `templates/Mutual-NDA.md` (CC BY 4.0) at build time.
- `src/components/App.tsx` – the page shell: asks the backend who is signed in, then shows the sign-in form (`AuthForm.tsx`) or the NDA creator.
- `src/lib/api.ts` – the backend API client.
- `src/lib/nda.ts` – the document model: form data and defaults, the cover page built from the form, and a parser that turns the standard terms markdown into blocks.
- `src/components/NdaPreview.tsx` and `src/components/NdaPdf.tsx` – render the same document model as HTML (live preview) and as a PDF (via `@react-pdf/renderer`, loaded only when downloading).
- `src/components/NdaBuilder.tsx` – holds the form state and ties the form, preview and download together.
- `public/fonts/` – Noto Serif (SIL Open Font License, see `NotoSerif-OFL.txt`), embedded in the PDF so names in Latin, Greek and Cyrillic scripts (e.g. Polish, Turkish, Vietnamese, Russian) print correctly. Other scripts, such as Chinese or Arabic, can't be drawn; the app lists any such characters under the Download button. `src/lib/pdf-font-coverage.ts` lists the characters the fonts cover. If you change the fonts, regenerate it with `node scripts/font-coverage.mjs`; a test fails if it is out of date.

## Testing

```bash
npm test            # unit and component tests (Vitest + React Testing Library), incl. a real PDF render
npm run test:e2e    # end-to-end tests (Playwright) against the static export served by the backend on port 3100
npm run lint && npm run typecheck
```

First-time E2E setup: `npx playwright install chromium`. The E2E tests also need [uv](https://docs.astral.sh/uv/) to run the backend.

- `src/**/*.test.ts(x)` – the document model, the standard terms template, the API client, each component, and the generated PDF's text (read back with `pdf-parse`). Tests run in the `America/Los_Angeles` time zone so date bugs show up.
- `e2e/auth.spec.ts` – signing up, in and out against the real backend.
- `e2e/nda.spec.ts` – the whole NDA flow in a browser (each test signs up first): live preview, validation, downloading and reading the PDF, keyboard use, time zones and phone layout.
- [`MANUAL_TESTING.md`](MANUAL_TESTING.md) – the checklist to run by hand before a release (visual checks, PDF viewers, printing, screen readers, browsers).
