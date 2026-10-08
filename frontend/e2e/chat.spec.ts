import { expect, test, type Page, type Route } from "@playwright/test";
import { isExpectedAuthError, signUp } from "./helpers";

// The model is faked in the browser, so these tests are fast and repeatable.
// backend/tests/test_chat_live.py covers the real model.
type Fields = Record<string, unknown> & { party1: Record<string, string>; party2: Record<string, string> };
type ChatRequest = { messages: { role: string; content: string }[]; fields: Fields; today: string };

const message = (page: Page) => page.getByRole("textbox", { name: "Message" });
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const preview = (page: Page) => page.getByRole("article");
const downloadButton = (page: Page) => page.getByRole("button", { name: /Download PDF|Generating PDF/ });

// Answers each chat request with the next scripted reply and field changes.
async function fakeAssistant(page: Page, turns: { reply: string; change: (f: Fields) => Fields }[]) {
  const requests: ChatRequest[] = [];
  await page.route("**/api/chat", async (route: Route) => {
    const body = route.request().postDataJSON() as ChatRequest;
    requests.push(body);
    const turn = turns.shift()!;
    await route.fulfill({ json: { reply: turn.reply, fields: turn.change(body.fields) } });
  });
  return requests;
}

test.describe("AI chat", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => msg.type() === "error" && !isExpectedAuthError(msg.text(), [401, 502]) && consoleErrors.push(msg.text()));
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    await signUp(page);
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test("greets the user and fills in the NDA from the conversation", async ({ page }) => {
    const requests = await fakeAssistant(page, [
      {
        reply: "Thanks! Which state's law should govern, and where should disputes be heard?",
        change: (f) => ({ ...f, party1: { ...f.party1, company: "Acme Inc." }, party2: { ...f.party2, company: "Globex" } }),
      },
      {
        reply: "All set! You can download the NDA now.",
        change: (f) => ({ ...f, governingLaw: "Delaware", jurisdiction: "New Castle, DE", mndaTermYears: 2 }),
      },
    ]);

    await expect(log(page)).toContainText("which two companies is it between");
    await expect(message(page)).toBeFocused();
    await expect(downloadButton(page)).toBeDisabled();

    await message(page).fill("Acme Inc. and Globex, to explore a partnership");
    await message(page).press("Enter");

    await expect(log(page)).toContainText("Which state's law should govern");
    await expect(preview(page).getByText("Acme Inc.").first()).toBeVisible();
    await expect(page.getByText("Still needed: Governing law, Jurisdiction")).toBeVisible();
    expect(requests[0].messages.map((m) => m.role)).toEqual(["assistant", "user"]);
    expect(requests[0].today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expect(message(page)).toBeFocused();
    await page.keyboard.type("Delaware, New Castle. 2 years.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(log(page)).toContainText("All set!");
    await expect(downloadButton(page)).toBeEnabled();
    await expect(preview(page)).toContainText("Expires 2 years from Effective Date.");
    expect(requests[1].messages).toHaveLength(4);

    // The Fields tab shows what the chat filled in.
    await page.getByRole("tab", { name: "Fields" }).click();
    await expect(page.getByLabel(/^Governing law/)).toHaveValue("Delaware");
    await expect(page.getByLabel("MNDA term in years")).toHaveValue("2");
  });

  test("shows an error with Retry when the assistant is unavailable", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/chat", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({ status: 502, json: { detail: "The AI assistant is unavailable right now. Please try again." } });
      } else {
        await route.fulfill({ json: { reply: "Back now. Which companies?", fields: (route.request().postDataJSON() as ChatRequest).fields } });
      }
    });

    await message(page).fill("Hello");
    await message(page).press("Enter");
    await expect(log(page).getByRole("alert")).toContainText("unavailable right now");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(log(page)).toContainText("Back now.");
    await expect(log(page).getByRole("alert")).toHaveCount(0);
  });
});
