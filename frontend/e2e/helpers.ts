import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery";

// Every test gets its own account, so tests can run in parallel against one server.
export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

export async function signUp(page: Page, email = uniqueEmail()) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "My documents" })).toBeVisible();
  return email;
}

// From My documents, starts a new document and waits for the editor.
export async function startNewDocument(page: Page) {
  await page.getByRole("button", { name: "New document" }).first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

// The browser logs every 4xx response as a console error, including the expected
// 401 from /api/auth/me when nobody is signed in yet.
export const isExpectedAuthError = (text: string, statuses = [401]) =>
  statuses.some((status) => text.includes(`the server responded with a status of ${status}`));

// Picks a document from the picker above the Chat and Fields tabs.
export async function chooseDocument(page: Page, id: string) {
  await page.getByRole("combobox", { name: "Document" }).selectOption(id);
}
