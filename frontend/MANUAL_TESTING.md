# Manual test plan – Mutual NDA creator

The automated tests (`npm test`, `npm run test:e2e`) check behaviour and the text in the PDF. This checklist covers what they can't: how things look, real browsers and PDF viewers, assistive technology, and whether the agreement reads correctly to a person.

Run it before each release, against a production build:

```bash
npm run build && npm start
```

Record the browser/OS versions, who ran it and the date in the PR. File anything that fails as a bug, with a screenshot.

## Test data

Use these values unless a step says otherwise. They include accents, long text and line breaks on purpose.

| Field | Party 1 | Party 2 |
| --- | --- | --- |
| Company | Société Générale – Américas, Inc. | Globex |
| Signatory name | Ada King, Countess of Lovelace | *(leave empty)* |
| Title | Chief Executive Officer & Board Chair | *(leave empty)* |
| Notice address | Legal Department, 1209 Orange Street, Wilmington, DE 19801, United States of America | legal@globex.example |

- Governing law: `Delaware`
- Jurisdiction: `New Castle County, Delaware`
- MNDA modifications (two lines):
  ```
  1. Section 5 is amended to require 30 days' notice.
  2. Section 9: disputes go to arbitration in Wilmington.
  ```

## 1. First load

- [ ] The page loads with no errors in the browser console.
- [ ] The form is on the left and the preview on the right (desktop), each scrolling on its own.
- [ ] The effective date is today's date in your local time zone.
- [ ] The preview shows amber placeholders for Governing Law and Jurisdiction.
- [ ] **Download PDF** is greyed out, and "Still needed: Governing law, Jurisdiction, Party 1 company, Party 2 company" is shown under it.

## 2. Live preview

Fill in the test data one field at a time.

- [ ] Each value appears in the preview immediately, highlighted in indigo, replacing its amber placeholder.
- [ ] The "Still needed" list shrinks as each required field is filled, and the button becomes active once it is empty.
- [ ] The two lines of the modifications appear on two lines in the preview.
- [ ] Party 1's details are in the PARTY 1 column and Party 2's in the PARTY 2 column; Party 2's empty name and title cells are blank, not placeholders.
- [ ] Signature and Date rows are blank for both parties.
- [ ] Changing the effective date updates it in the preview as e.g. "March 15, 2026".
- [ ] Clearing a required field (e.g. type only spaces in Party 2 company) greys out the button again.

## 3. Term options

- [ ] MNDA term "Expires" with `2` → preview says "Expires 2 years from Effective Date."; with `1` it says "1 year" (singular).
- [ ] Choose "Continues until terminated" → the years box is disabled and the preview says "Continues until terminated in accordance with the terms of the MNDA."
- [ ] Switch back to "Expires" → the years box is enabled again with the earlier number.
- [ ] Term of confidentiality with `5` → "5 years from Effective Date, but in the case of trade secrets…"
- [ ] Choose "In perpetuity" → preview says "In perpetuity."
- [ ] In a years box, delete the number, then click elsewhere → the previous number comes back and the preview never showed an empty or zero value.
- [ ] Type `0`, `100` and `2.5` in turn → the preview keeps the last valid value; clicking away restores it in the box.
- [ ] The spinner arrows stay within 1–99.

## 4. Download

- [ ] Click **Download PDF**. The button briefly reads "Generating PDF…" and is disabled.
- [ ] The file is saved as `Mutual-NDA_Societe-Generale-Americas-Inc_Globex.pdf` (accents removed, no odd hyphens).
- [ ] Downloading twice in a row works, and the second file reflects any edits made in between.

Open the PDF and check:

- [ ] Page 1 is the cover page; the standard terms start on a new page with the "Standard Terms" heading.
- [ ] Every value matches the preview, including the two-line modifications and the accents in Party 1's company.
- [ ] The long notice address wraps inside its table cell; nothing is cut off or overlaps the border.
- [ ] No cover page section or the signature table is split across two pages.
- [ ] All 11 clauses are present and numbered 1–11; clause titles are bold; cover page terms (Purpose, Effective Date, MNDA Term, Term of Confidentiality, Governing Law, Jurisdiction) are underlined.
- [ ] Words are not hyphenated across lines.
- [ ] The links (commonpaper.com, CC BY 4.0) are clickable.
- [ ] The document title in the viewer's properties is "Mutual Non-Disclosure Agreement".
- [ ] Printing on US Letter gives the same pages with nothing clipped at the margins. Printing on A4 is still readable with nothing clipped.

Repeat the PDF checks in: macOS Preview, Adobe Acrobat Reader, and the browser's built-in PDF viewer.

### Other alphabets

- [ ] Set Party 1 company to `Łódź Spółka Şirket`, Party 1 name to `Nguyễn Văn Hữu`, and Party 2 company to `ООО «Ромашка»`. No warning appears under the button; in the PDF all three print exactly as typed, in the same typeface as the rest of the document. The file is named `Mutual-NDA_Lodz-Spolka-Sirket.pdf` (the Cyrillic company has no Latin letters, so it is left out).
- [ ] Add `株式会社` to Party 2 company: an amber note under the button lists `株 式 会 社` and says they will come out garbled; **Download PDF** still works. Remove them: the note disappears.

## 5. Legal content

Compare the preview and the PDF against the Common Paper sources in the repo-root `templates/` directory (`Mutual-NDA-coverpage.md` and `Mutual-NDA.md`).

- [ ] The cover page wording matches the template (apart from the filled-in values).
- [ ] The standard terms are word-for-word the same as `Mutual-NDA.md`, including curly quotes and apostrophes.
- [ ] The CC BY 4.0 attribution appears on both the cover page and at the end of the standard terms.

## 6. Keyboard and screen reader

- [ ] Tab moves through every field in a sensible order, with a visible focus ring, and reaches **Download PDF**.
- [ ] Arrow keys switch between the radio options in each group.
- [ ] Pressing Enter in a text field does not reload the page or clear the form.
- [ ] With VoiceOver (macOS: Cmd+F5) every field is announced with its label; the two years boxes are distinguishable by context (MNDA term vs confidentiality).
- [ ] The "Something went wrong" message, if triggered, is announced (see §8).
- [ ] In the preview, VoiceOver reads the signature table with PARTY 1/PARTY 2 as column headers and Signature, Print Name, … as row headers.

## 7. Browsers, screen sizes and time zones

Run sections 1–4 in each of: Chrome, Safari, Firefox (latest), plus Safari on iPhone and Chrome on Android.

- [ ] On a phone the form is above the preview, there is no sideways scrolling, and the download bar stays pinned to the bottom of the form.
- [ ] On a phone the header text does not overlap or get cut off.
- [ ] Zoom the desktop browser to 200%: everything is still usable and readable.
- [ ] Set your computer's time zone to one far ahead of UTC (e.g. Pacific/Kiritimati, UTC+14) and reload shortly before midnight UTC, then to one far behind (e.g. Pacific/Pago_Pago, UTC−11): the default effective date is your local date both times.

## 8. Failure handling

- [ ] In Chrome DevTools → Network, set throttling to "Slow 4G", reload, and download: the page shows "Loading…" first, then the form; the PDF still downloads (it may take a few seconds) and the button shows "Generating PDF…" until it does.
- [ ] Load the page, then go offline (DevTools → Network → Offline) *before the first download* and click **Download PDF**: a red "Something went wrong generating the PDF. Please try again." message appears and the button becomes clickable again. Go back online and retry: the message disappears and the PDF downloads.
- [ ] Paste `<img src=x onerror="alert(1)">` into Purpose: it is shown as plain text in the preview and the PDF, and no alert pops up.
- [ ] Paste a very long purpose (several paragraphs): the preview and PDF wrap it, and the cover page flows onto a second page without overlapping text.
