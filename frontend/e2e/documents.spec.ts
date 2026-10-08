import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { chooseDocument, isExpectedAuthError, signUp } from "./helpers";

type Field = { key: string; label: string; type: string; required?: boolean };
type Spec = { id: string; name: string; filename: string; parties: [string, string]; sections: { title: string; fields: Field[] }[] };

const { documents } = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "templates", "documents.json"), "utf8")) as { documents: Spec[] };

// Every document can be chosen, filled in on the Fields tab and downloaded.
test.describe("every document", () => {
  for (const spec of documents) {
    test(`${spec.name}: fill in the required fields and download the PDF`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => msg.type() === "error" && !isExpectedAuthError(msg.text()) && consoleErrors.push(msg.text()));
      page.on("pageerror", (err) => consoleErrors.push(err.message));
      await signUp(page);
      await chooseDocument(page, spec.id);
      await page.getByRole("tab", { name: "Fields" }).click();

      const required = spec.sections.flatMap((s) => s.fields).filter((f) => f.required && (f.type === "text" || f.type === "longtext"));
      for (const field of required) await page.getByRole("textbox", { name: field.label, exact: true }).fill(`${field.label} value`);
      for (const [i, role] of spec.parties.entries()) {
        await page.getByRole("group", { name: role, exact: true }).getByLabel(/^Company/).fill(i === 0 ? "Acme Inc." : "Globex");
      }

      const preview = page.getByRole("article");
      await expect(preview.getByRole("columnheader")).toHaveText(spec.id === "mutual-nda" ? ["PARTY 1", "PARTY 2"] : spec.parties.map((p) => p.toUpperCase()));
      await expect(page.getByText(/Still needed/)).toHaveCount(0);

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download PDF" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${spec.filename.replace(/\.md$/, "")}_Acme-Inc_Globex.pdf`);

      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const parser = new PDFParse({ data: new Uint8Array(readFileSync(file)) });
      try {
        const text = (await parser.getText()).text.replace(/\s+/g, " ");
        expect(text).toContain(spec.name);
        expect(text).toContain("Acme Inc.");
        for (const field of required) expect(text).toContain(`${field.label} value`);
        expect(text).toContain("free to use under CC BY 4.0");
      } finally {
        await parser.destroy();
      }
      expect(consoleErrors).toEqual([]);
    });
  }
});
