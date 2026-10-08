# Manual test plan – legal agreement creator

The automated tests (`npm test`, `npm run test:e2e`) check behaviour and the text in the PDF. This checklist covers what they can't: how things look, real browsers and PDF viewers, assistive technology, and whether the agreement reads correctly to a person.

Run it before each release, against the Docker container (from the repo root):

```bash
scripts/start-mac.sh    # or start-linux.sh / start-windows.ps1; open http://localhost:8000
```

Record the browser/OS versions, who ran it and the date in the PR. File anything that fails as a bug, with a screenshot.

## Test data

Sections 1–8 use the Mutual NDA (choose it in the **Document** picker); section 9 covers the other documents. Use these values unless a step says otherwise. They include accents, long text and line breaks on purpose.

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

## 0. Accounts

- [ ] The page shows the sign-in screen: a navy panel with the logo, what Prelegal does and the 11 agreements (on wide screens; on a phone just the logo and the form), and "Sign in to Prelegal". The footer shows the drafts disclaimer.
- [ ] **Create an account**: there is a **Confirm password** field, and the drafts disclaimer under the form. Different passwords: "The passwords don’t match." **Show password** shows both passwords as text.
- [ ] Create an account with a new email and an 8+ character password: **My documents** appears (empty, with **New document**), and the header shows the logo, **My documents**, your email and **Sign out**.
- [ ] Reload: you are still signed in.
- [ ] **Sign out**, then sign in with the wrong password: "Incorrect email or password." Sign in with the right one: **My documents** appears.
- [ ] Try to create a second account with the same email: "An account with this email already exists."
- [ ] Stop and start the container (`scripts/stop-mac.sh`, `scripts/start-mac.sh`) and reload: you are signed out and the account (and its documents) no longer exist.
- [ ] Stop the container while signed in, then click **Sign out**: "Can’t reach the server…" is shown next to the button and you stay on the page.

## 0a. My documents

- [ ] **New document** opens the editor with the greeting; the address bar ends in `#/documents/<id>`. Going back without typing anything or choosing a document leaves My documents empty.
- [ ] Choose a document and type a company: "Saving…" then "Saved" appears next to the Document picker. Click **My documents**: the document is listed as "<Document>: <company>" with a **Draft** badge and "Updated just now".
- [ ] Open it: the document, every field and the whole conversation are back, and nothing is saved again until you change something. Reload the page: still the same document.
- [ ] Fill in all required fields: on My documents the badge says **Ready**.
- [ ] Start a second document: the list shows the most recently changed first.
- [ ] **Delete** asks to confirm (Delete / Cancel), with focus on Cancel; Cancel keeps it and returns focus to Delete, Delete removes it, also after a reload.
- [ ] Change a field and click **Sign out** straight away: after signing back in, the change is there. With the server stopped, Sign out says the latest changes couldn’t be saved; clicking it again signs out.
- [ ] Sign in as another user in a private window: their list is empty, and pasting the first user's document address opens a blank document, not the first user's.
- [ ] Stop the container while editing and change a field: "Couldn’t save. Retry" appears next to the Document picker and you can keep editing. (Starting the container again resets the database, so this only checks the error.)
- [ ] Send a chat message and reload before the reply arrives: reopening shows "The assistant’s last reply didn’t arrive." with **Retry**.

## 0b. AI chat

Needs `OPENROUTER_API_KEY` in `.env`. Sign in first and click **New document**.

- [ ] The Chat tab is selected and shows the assistant's greeting; the message box has focus. The **Document** picker says "Choose a document…" and the preview area lists every document as a card.
- [ ] Describe a need without naming a document, e.g. "We're letting a customer trial our analytics product for 90 days before they buy." The assistant suggests the Pilot Agreement with a reason. Confirm: the picker switches to Pilot Agreement, the preview shows its Order Form, and the assistant asks for what's still needed (and has already filled in the 90 days).
- [ ] Ask for a document it can't draft ("I need an employment contract"): it says it can't, suggests the closest supported document and asks whether you want it; nothing is chosen until you agree.
- [ ] Start another new document and ask for an NDA. Answer in free form, e.g. "Acme Inc. and Globex, we're exploring a joint product. Delaware law, disputes in New Castle County. Start next Monday, 2 years, confidentiality forever." The reply arrives within a few seconds ("Assistant is typing…" meanwhile), confirms what it filled in, and asks for anything still missing. The preview shows the values, the purpose describes the joint product, and "next Monday" is the right date.
- [ ] Once nothing required is missing, the assistant says the document is ready to download and offers the optional details; **Download PDF** is enabled.
- [ ] Give a signatory's name, title and email: they appear in the signature table.
- [ ] Change something ("make it 3 years instead"): the preview updates.
- [ ] Ask to switch ("actually make it a Cloud Service Agreement"): the picker switches, the companies, effective date, governing law and courts are kept, and the assistant asks about the new document.
- [ ] Ask something unrelated ("write me a poem"): the assistant steers back to the agreement.
- [ ] Shift+Enter adds a line; Enter sends. The conversation scrolls to the newest message.
- [ ] Switch to **Fields**: the values match. Change the governing law there, go back to **Chat**: the conversation and any unsent text are still there, and the assistant knows about the change if asked.
- [ ] Start the app without `OPENROUTER_API_KEY`, send a message: an error explains the assistant isn't set up, with **Retry**.

## 1. First load

Sign in first, click **New document**, choose **Mutual Non-Disclosure Agreement** in the **Document** picker and open the **Fields** tab.

- [ ] The page loads with no errors in the browser console (a 401 for `/api/auth/me` before signing in is expected).
- [ ] The form is on the left and the preview on the right (desktop), each scrolling on its own.
- [ ] The effective date is today's date in your local time zone.
- [ ] The preview shows amber placeholders for Governing Law and Jurisdiction.
- [ ] **Download PDF** is greyed out, and "Still needed: Governing Law, Jurisdiction, Party 1 company, Party 2 company" is shown under it.

## 2. Live preview

Fill in the test data one field at a time.

- [ ] Each value appears in the preview immediately, highlighted in light blue, replacing its amber placeholder.
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

## 9. Other documents

For each document in the **Document** picker (or a sample of them: one Order Form document such as the Pilot Agreement, one Key Terms document such as the BAA, and the Professional Services Agreement, the largest):

- [ ] The Fields tab has a group per cover page section and one per party, named by role (e.g. Provider and Customer). Optional fields say "Optional".
- [ ] The preview's cover page has the document's name, an intro naming its Order Form / Cover Page / Key Terms and the Common Paper standard terms (with a working link when the template has one), every field as "Label: value", and a signature table with the role names as column headings.
- [ ] Blank required fields show an amber placeholder; blank optional fields show "None".
- [ ] The standard terms are word-for-word the same as the template in `templates/`, with sections numbered 1, 2, 3…, clauses 1.1, 1.2… indented under them, and lettered items (a), (b)… indented further. Section and clause headings are bold; terms defined on the cover page (Provider, Customer, Pilot Period…) are underlined.
- [ ] Fill in the required fields: **Download PDF** is enabled. The PDF is named after the template and the companies (e.g. `Pilot-Agreement_Acme-Inc_Globex.pdf`), and its numbering and indentation match the preview, with no clause cut off at a page break.
- [ ] Switch from one document to another with the picker: the companies, signatories and shared fields (effective date, governing law, courts…) are kept; the other fields start fresh.

## 10. Disclaimer and look

- [ ] The drafts disclaimer ("…drafts… not legal advice and are subject to legal review…") appears: under the sign-up form, in the footer of every screen, in a yellow note at the top of the preview, and at the foot of every page of the downloaded PDF (it does not overlap the text).
- [ ] Buttons are consistent: purple for main actions (Sign in, New document, Download PDF, Send), white with a border for secondary ones (Sign out, Delete, Cancel). There is no indigo left anywhere.
- [ ] Tab through each screen: every button and link shows a visible focus ring.
- [ ] On a wide screen the editor fills the window between the header and footer; the chat or fields and the preview scroll separately, and the Download button stays in view.
