import { expect, test, type Page } from "@playwright/test";
import { chooseDocument, isExpectedAuthError, signUp, startNewDocument } from "./helpers";

// Saving documents and coming back to them, against the real backend (the chat model is faked).
const documentsList = (page: Page) => page.getByRole("list", { name: "Documents" });
const saved = (page: Page) => page.getByText("Saved", { exact: true });

async function fakeAssistant(page: Page, reply: string) {
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { reply, document: body.document, fields: body.fields } });
  });
}

test.describe("My documents", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => msg.type() === "error" && !isExpectedAuthError(msg.text()) && consoleErrors.push(msg.text()));
    page.on("pageerror", (err) => consoleErrors.push(err.message));
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test("saves a document as you work and reopens it with its conversation", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("subject to legal review");

    await startNewDocument(page);
    await fakeAssistant(page, "Happy to help with your pilot.");
    await chooseDocument(page, "pilot-agreement");
    await page.getByRole("textbox", { name: "Message" }).fill("We're running a 90 day pilot");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(page.getByRole("log")).toContainText("Happy to help with your pilot.");
    await page.getByRole("tab", { name: "Fields" }).click();
    await page.getByRole("group", { name: "Provider" }).getByLabel(/^Company/).fill("Acme Inc.");
    await page.getByLabel(/^Pilot Period/).fill("90 days");
    await expect(saved(page)).toBeVisible();
    const editorUrl = page.url();

    await page.getByRole("link", { name: "My documents" }).click();
    const row = documentsList(page).getByRole("listitem");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Pilot Agreement: Acme Inc.");
    await expect(row).toContainText("Draft");

    await row.getByRole("link").click();
    await expect(page).toHaveURL(editorUrl);
    await expect(page.getByRole("combobox", { name: "Document" })).toHaveValue("pilot-agreement");
    await expect(page.getByRole("log")).toContainText("We're running a 90 day pilot");
    await expect(page.getByRole("log")).toContainText("Happy to help with your pilot.");
    await page.getByRole("tab", { name: "Fields" }).click();
    await expect(page.getByLabel(/^Pilot Period/)).toHaveValue("90 days");

    // Reloading the page opens the same document.
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Document" })).toHaveValue("pilot-agreement");
    await expect(page.getByRole("article").getByText("90 days")).toBeVisible();
  });

  test("marks a document ready once its required fields are filled in", async ({ page }) => {
    await signUp(page);
    await startNewDocument(page);
    await chooseDocument(page, "mutual-nda");
    await page.getByRole("tab", { name: "Fields" }).click();
    await page.getByLabel(/^Governing Law/).fill("Delaware");
    await page.getByLabel(/^Jurisdiction/).fill("New Castle, DE");
    await page.getByRole("group", { name: "Party 1" }).getByLabel(/^Company/).fill("Acme");
    await page.getByRole("group", { name: "Party 2" }).getByLabel(/^Company/).fill("Globex");
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    await expect(page.getByRole("article").getByRole("note")).toContainText("subject to legal review");
    await expect(saved(page)).toBeVisible();

    await page.goBack();
    const row = documentsList(page).getByRole("listitem");
    await expect(row).toContainText("Mutual Non-Disclosure Agreement: Acme / Globex");
    await expect(row).toContainText("Ready");
  });

  test("deletes a document", async ({ page }) => {
    await signUp(page);
    await startNewDocument(page);
    await chooseDocument(page, "ai-addendum");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("link", { name: "My documents" }).click();

    await page.getByRole("button", { name: "Delete AI Addendum" }).click();
    await page.getByRole("button", { name: "Confirm deleting AI Addendum" }).click();
    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  });

  test("keeps each user's documents to themselves", async ({ page, browser }) => {
    await signUp(page);
    await startNewDocument(page);
    await chooseDocument(page, "pilot-agreement");
    await expect(saved(page)).toBeVisible();
    const documentUrl = page.url();

    // Someone else, in their own browser.
    const other = await (await browser.newContext()).newPage();
    await signUp(other);
    await expect(other.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    // Opening the first user's link gives them a blank document of their own, not the first user's.
    await other.goto(documentUrl);
    await expect(other.getByRole("combobox", { name: "Document" })).toHaveValue("");
    await other.close();
  });

  test("signing out and in again keeps the documents", async ({ page }) => {
    const email = await signUp(page);
    await startNewDocument(page);
    await chooseDocument(page, "service-level-agreement");
    await expect(saved(page)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to Prelegal" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(documentsList(page).getByRole("listitem")).toContainText("Service Level Agreement");
  });
});
