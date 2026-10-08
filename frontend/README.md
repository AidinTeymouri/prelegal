# Prelegal – frontend

A Next.js app that drafts any of the [Common Paper](https://commonpaper.com/standards/) standard agreements listed in the repo-root `templates/documents.json` (Mutual NDA, Cloud Service Agreement, Pilot Agreement, DPA and more) by chatting with an AI assistant (or picking a document and editing the fields directly), shows a live preview, and downloads the completed agreement as a PDF. Users sign in first.

`npm run build` writes a static export to `out/`, which the FastAPI backend (`../backend`) serves together with the API. To run the whole app, use the scripts in `../scripts` (see the root README).

## Development

Start the backend (`cd ../backend && uv run uvicorn app.main:app --reload`), then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In development, `/api` requests are forwarded to the backend on port 8000 (see `next.config.ts`).

## How it works

- `templates/documents.json` (repo root) – the documents and their cover page fields: labels, types, required or not, defaults, and the descriptions the AI sees. The backend reads the same file. Adding a field there adds it to the form, the cover page and the AI's schema.
- `src/app/page.tsx` – reads `documents.json` and each document's standard terms (`templates/*.md`, CC BY 4.0) at build time.
- `src/components/App.tsx` – the page shell: asks the backend who is signed in, then shows the sign-in form (`AuthForm.tsx`) or the document creator.
- `src/lib/api.ts` – the backend API client.
- `src/lib/documents.ts` – the document model: spec types, field data and defaults, required fields, carrying values over when switching documents, and the PDF filename.
- `src/lib/terms.ts` and `src/lib/inline.ts` – parse the standard terms markdown (nested numbered clauses, `*_link` term spans, headings, bold and links) into blocks.
- `src/lib/cover.ts` – builds the cover page from the fields, except for the Mutual NDA, which keeps its own wording (from `templates/Mutual-NDA-coverpage.md`).
- `src/components/DocumentPreview.tsx` and `src/components/DocumentPdf.tsx` – render the same document model as HTML (live preview) and as a PDF (via `@react-pdf/renderer`, loaded only when downloading).
- `src/components/DocumentBuilder.tsx` – holds the draft (chosen document and its fields) and ties the document picker, the Chat and Fields tabs, preview and download together.
- `src/components/DocumentChat.tsx` and `src/lib/useDocumentChat.ts` – the AI chat: the conversation, sending it to `/api/chat`, and applying the reply (a newly chosen document, or the fields the assistant changed, keeping edits made on the Fields tab meanwhile).
- `src/components/DocumentForm.tsx` – the Fields tab, generated from the spec.
- `public/fonts/` – Noto Serif (SIL Open Font License, see `NotoSerif-OFL.txt`), embedded in the PDF so names in Latin, Greek and Cyrillic scripts (e.g. Polish, Turkish, Vietnamese, Russian) print correctly. Other scripts, such as Chinese or Arabic, can't be drawn; the app lists any such characters under the Download button. `src/lib/pdf-font-coverage.ts` lists the characters the fonts cover. If you change the fonts, regenerate it with `node scripts/font-coverage.mjs`; a test fails if it is out of date.

## Testing

```bash
npm test            # unit and component tests (Vitest + React Testing Library), incl. a real PDF render
npm run test:e2e    # end-to-end tests (Playwright) against the static export served by the backend on port 3100
npm run lint && npm run typecheck
```

First-time E2E setup: `npx playwright install chromium`. The E2E tests also need [uv](https://docs.astral.sh/uv/) to run the backend.

- `src/testing/documents.ts` – loads the real documents and templates for tests.
- `src/**/*.test.ts(x)` – the document model, every standard terms template, the API client, each component, and the generated PDF's text (read back with `pdf-parse`). Tests run in the `America/Los_Angeles` time zone so date bugs show up.
- `e2e/auth.spec.ts` – signing up, in and out against the real backend.
- `e2e/chat.spec.ts` – the AI chat (choosing a document, unsupported requests, switching documents), with `/api/chat` faked in the browser (`backend/tests/test_chat_live.py` covers the real model).
- `e2e/documents.spec.ts` – every document: fill in its required fields, download the PDF and read it back.
- `e2e/nda.spec.ts` – the whole Mutual NDA flow on the Fields tab in a browser (each test signs up first): live preview, validation, downloading and reading the PDF, keyboard use, time zones and phone layout.
- [`MANUAL_TESTING.md`](MANUAL_TESTING.md) – the checklist to run by hand before a release (visual checks, PDF viewers, printing, screen readers, browsers).
