import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

const preview = (page: Page) => page.getByRole("article");
const party = (page: Page, n: 1 | 2) => page.getByRole("group", { name: `Party ${n}` });
const downloadButton = (page: Page) => page.getByRole("button", { name: /Download PDF|Generating PDF/ });

async function fillForm(page: Page) {
  await page.getByLabel(/^Purpose/).fill("Exploring a joint venture for widgets.");
  await page.getByLabel(/^Effective date/).fill("2026-03-15");
  await page.getByLabel(/^Governing law/).fill("Delaware");
  await page.getByLabel(/^Jurisdiction/).fill("New Castle, DE");
  await page.getByLabel(/^MNDA modifications/).fill("Section 9 is governed by New York law.");
  for (const [n, p] of [
    [1, { company: "Acme Inc.", name: "Ada Lovelace", title: "CEO", address: "legal@acme.test" }],
    [2, { company: "Globex", name: "Alan Turing", title: "CTO", address: "1 Main St, Springfield" }],
  ] as const) {
    await party(page, n).getByLabel(/^Company/).fill(p.company);
    await party(page, n).getByLabel(/^Signatory name/).fill(p.name);
    await party(page, n).getByLabel(/^Title/).fill(p.title);
    await party(page, n).getByLabel(/^Notice address/).fill(p.address);
  }
}

async function pdfText(path: string) {
  const parser = new PDFParse({ data: new Uint8Array(await readFile(path)) });
  try {
    const result = await parser.getText();
    return { text: result.text.replace(/\s+/g, " "), pages: result.pages.length };
  } finally {
    await parser.destroy();
  }
}

test.describe("Mutual NDA creator", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()));
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    await page.goto("/");
    await expect(page.getByLabel(/^Purpose/)).toBeVisible();
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test("loads with the form, the preview and the standard terms", async ({ page }) => {
    await expect(page).toHaveTitle("Mutual NDA Creator · Prelegal");
    await expect(page.getByText("Mutual NDA creator")).toBeVisible();
    await expect(preview(page).getByRole("heading", { name: "Mutual Non-Disclosure Agreement", exact: true })).toBeVisible();
    await expect(preview(page).getByRole("heading", { name: "Standard Terms" })).toBeAttached();
    await expect(preview(page).getByText("Equitable Relief", { exact: true })).toBeAttached();
    await expect(downloadButton(page)).toBeDisabled();
    await expect(page.getByText("Still needed: Governing law, Jurisdiction, Party 1 company, Party 2 company")).toBeVisible();
  });

  test("defaults the effective date to today", async ({ page }) => {
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await expect(page.getByLabel(/^Effective date/)).toHaveValue(today);
  });

  test("updates the preview as the form is filled in", async ({ page }) => {
    await expect(preview(page).getByText("[Fill in state]")).toBeVisible();
    await fillForm(page);

    await expect(preview(page).getByText("[Fill in state]")).toHaveCount(0);
    for (const text of ["Exploring a joint venture for widgets.", "March 15, 2026", "Delaware", "New Castle, DE", "Section 9 is governed by New York law."]) {
      await expect(preview(page).getByText(text, { exact: true })).toBeVisible();
    }
    const companyRow = preview(page).getByRole("row", { name: /^Company/ });
    await expect(companyRow.getByRole("cell")).toHaveText(["Acme Inc.", "Globex"]);
    await expect(downloadButton(page)).toBeEnabled();
    await expect(page.getByText(/Still needed/)).toHaveCount(0);
  });

  test("switches between the MNDA term and confidentiality options", async ({ page }) => {
    const termYears = page.getByRole("spinbutton", { name: "MNDA term in years" });
    const confidentialityYears = page.getByRole("spinbutton", { name: "Term of confidentiality in years" });

    await termYears.fill("3");
    await expect(preview(page).getByText("3 years", { exact: true })).toBeVisible();

    await page.getByRole("radio", { name: "Continues until terminated" }).check();
    await expect(termYears).toBeDisabled();
    await expect(preview(page).getByText("Continues until terminated in accordance with the terms of the MNDA.")).toBeVisible();

    await confidentialityYears.fill("5");
    await expect(preview(page).getByText("5 years", { exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "In perpetuity" }).check();
    await expect(confidentialityYears).toBeDisabled();
    await expect(preview(page).getByText("In perpetuity.")).toBeVisible();

    await page.getByRole("radio", { name: /^Expires/ }).check();
    await expect(termYears).toBeEnabled();
    await expect(termYears).toHaveValue("3");
    await expect(preview(page).locator("p", { hasText: "Expires 3 years from Effective Date." })).toBeVisible();
  });

  test("restores the number of years after an invalid entry", async ({ page }) => {
    const termYears = page.getByRole("spinbutton", { name: "MNDA term in years" });
    await termYears.fill("4");
    await termYears.fill("0");
    await expect(preview(page).getByText("4 years", { exact: true })).toBeVisible();
    await termYears.blur();
    await expect(termYears).toHaveValue("4");

    await termYears.fill("");
    await page.getByLabel(/^Governing law/).click();
    await expect(termYears).toHaveValue("4");
  });

  test("blocks the download again when a required field is cleared", async ({ page }) => {
    await fillForm(page);
    await expect(downloadButton(page)).toBeEnabled();
    await party(page, 2).getByLabel(/^Company/).fill("   ");
    await expect(downloadButton(page)).toBeDisabled();
    await expect(page.getByText("Still needed: Party 2 company")).toBeVisible();
  });

  test("downloads a PDF with the details that were entered", async ({ page }, testInfo) => {
    await fillForm(page);
    const downloadPromise = page.waitForEvent("download");
    await downloadButton(page).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("Mutual-NDA_Acme-Inc_Globex.pdf");
    const file = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(file);

    const { text, pages } = await pdfText(file);
    expect(pages).toBeGreaterThanOrEqual(2);
    for (const value of [
      "Mutual Non-Disclosure Agreement",
      "Exploring a joint venture for widgets.",
      "March 15, 2026",
      "Expires 1 year from Effective Date.",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 9 is governed by New York law.",
      "Ada Lovelace",
      "Alan Turing",
      "legal@acme.test",
      "1 Main St, Springfield",
      "11. General.",
    ]) {
      expect(text).toContain(value);
    }
    await expect(downloadButton(page)).toHaveText("Download PDF");
    // Not getByRole("alert"): Next.js adds an empty route announcer with that role to every page.
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
  });

  test("can be used with the keyboard alone", async ({ page }) => {
    await page.getByLabel(/^Purpose/).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/^Effective date/)).toBeFocused();

    await page.getByRole("radio", { name: /^Expires/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Continues until terminated" })).toBeChecked();

    await page.getByLabel(/^Governing law/).focus();
    await page.keyboard.type("Delaware");
    await page.keyboard.press("Enter"); // must not submit the form or reload the page
    await expect(page.getByLabel(/^Governing law/)).toHaveValue("Delaware");
  });

  test("opens the Common Paper and license links in a new tab", async ({ page }) => {
    const links = preview(page).getByRole("link");
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  test("shows user input as text, never as HTML", async ({ page }) => {
    let dialog = false;
    page.on("dialog", (d) => {
      dialog = true;
      void d.dismiss();
    });
    const payload = '<img src=x onerror="alert(1)">';
    await page.getByLabel(/^Purpose/).fill(payload);
    await expect(preview(page).getByText(payload)).toBeVisible();
    await expect(preview(page).locator("img")).toHaveCount(0);
    expect(dialog).toBe(false);
  });
});

test.describe("time zones", () => {
  for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    test.describe(timezoneId, () => {
      test.use({ timezoneId });

      test("uses the browser's local date without hydration errors", async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
        page.on("pageerror", (err) => errors.push(err.message));
        await page.goto("/");
        const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
        await expect(page.getByLabel(/^Effective date/)).toHaveValue(today);
        expect(errors).toEqual([]);
      });
    });
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("stacks the form above the preview without horizontal scrolling", async ({ page }) => {
    await page.goto("/");
    const form = page.getByLabel(/^Purpose/);
    await expect(form).toBeVisible();
    const formBox = (await form.boundingBox())!;
    const previewBox = (await preview(page).boundingBox())!;
    expect(previewBox.y).toBeGreaterThan(formBox.y);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
