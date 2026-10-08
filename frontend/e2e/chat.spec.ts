import { expect, test, type Page, type Route } from "@playwright/test";
import { chooseDocument, isExpectedAuthError, signUp } from "./helpers";

// The model is faked in the browser, so these tests are fast and repeatable.
// backend/tests/test_chat_live.py covers the real model.
type Party = { name: string; title: string; company: string; noticeAddress: string };
type Fields = { values: Record<string, string | number>; parties: [Party, Party] };
type ChatRequest = { messages: { role: string; content: string }[]; document: string | null; fields: Fields | null; today: string };
type Turn = { reply: string; document?: string | null; change?: (f: Fields | null) => Fields | null };

const message = (page: Page) => page.getByRole("textbox", { name: "Message" });
const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const preview = (page: Page) => page.getByRole("article");
const picker = (page: Page) => page.getByRole("combobox", { name: "Document" });
const downloadButton = (page: Page) => page.getByRole("button", { name: /Download PDF|Generating PDF/ });

const EMPTY_PARTY: Party = { name: "", title: "", company: "", noticeAddress: "" };
// What the server returns for a newly chosen Mutual NDA (templates/documents.json defaults).
const NDA_DEFAULTS: Fields = {
  values: {
    purpose: "Evaluating whether to enter into a business relationship with the other party.",
    effectiveDate: "2026-10-07",
    mndaTermType: "expires",
    mndaTermYears: 1,
    confidentialityType: "years",
    confidentialityYears: 1,
    governingLaw: "",
    chosenCourts: "",
    modifications: "",
  },
  parties: [EMPTY_PARTY, EMPTY_PARTY],
};
const values = (extra: Fields["values"]) => (f: Fields | null): Fields => ({
  values: { ...f?.values, ...extra },
  parties: f?.parties ?? [EMPTY_PARTY, EMPTY_PARTY],
});
const companies = (one: string, two: string) => (f: Fields | null): Fields => ({
  values: f!.values,
  parties: [
    { ...f!.parties[0], company: one },
    { ...f!.parties[1], company: two },
  ],
});

// Answers each chat request with the next scripted reply, document and field changes.
async function fakeAssistant(page: Page, turns: Turn[]) {
  const requests: ChatRequest[] = [];
  await page.route("**/api/chat", async (route: Route) => {
    const body = route.request().postDataJSON() as ChatRequest;
    requests.push(body);
    const turn = turns.shift()!;
    const document = turn.document === undefined ? body.document : turn.document;
    const fields = turn.change ? turn.change(body.fields) : body.fields;
    await route.fulfill({ json: { reply: turn.reply, document, fields } });
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

  test("greets the user, chooses a document and fills it in from the conversation", async ({ page }) => {
    const requests = await fakeAssistant(page, [
      { reply: "That sounds like a Mutual NDA. Shall I draft one?" },
      {
        reply: "Great! Which state's law should govern, and where should disputes be heard?",
        document: "mutual-nda",
        // The server starts the newly chosen document from its defaults.
        change: () => companies("Acme Inc.", "Globex")(NDA_DEFAULTS),
      },
      {
        reply: "All set! You can download the NDA now.",
        change: values({ governingLaw: "Delaware", chosenCourts: "New Castle, DE", mndaTermYears: 2 }),
      },
    ]);

    await expect(log(page)).toContainText("What would you like to create?");
    await expect(message(page)).toBeFocused();
    await expect(page.getByRole("heading", { name: "What would you like to draft?" })).toBeVisible();
    await expect(downloadButton(page)).toBeDisabled();

    await message(page).fill("Acme Inc. and Globex want to share confidential information");
    await message(page).press("Enter");
    await expect(log(page)).toContainText("Shall I draft one?");
    await expect(picker(page)).toHaveValue("");
    expect(requests[0]).toMatchObject({ document: null, fields: null });
    expect(requests[0].messages.map((m) => m.role)).toEqual(["assistant", "user"]);
    expect(requests[0].today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await message(page).fill("Yes please");
    await message(page).press("Enter");
    await expect(log(page)).toContainText("Which state's law should govern");
    await expect(picker(page)).toHaveValue("mutual-nda");
    await expect(preview(page).getByText("Acme Inc.").first()).toBeVisible();
    await expect(page.getByText("Still needed: Governing Law, Jurisdiction")).toBeVisible();

    await expect(message(page)).toBeFocused();
    await page.keyboard.type("Delaware, New Castle. 2 years.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(log(page)).toContainText("All set!");
    expect(requests[2].document).toBe("mutual-nda");
    expect(requests[2].fields?.parties[0].company).toBe("Acme Inc.");
    expect(requests[2].messages).toHaveLength(6);
    await expect(preview(page)).toContainText("Expires 2 years from Effective Date.");

    // The Fields tab shows what the chat filled in.
    await page.getByRole("tab", { name: "Fields" }).click();
    await expect(page.getByLabel(/^Governing Law/)).toHaveValue("Delaware");
    await expect(page.getByLabel("MNDA term in years")).toHaveValue("2");
  });

  test("explains when it can't draft a document, and suggests the closest one", async ({ page }) => {
    await fakeAssistant(page, [
      { reply: "I can't draft an employment contract, but a Professional Services Agreement covers paid services. Want that?", document: null },
    ]);

    await message(page).fill("I need an employment contract");
    await message(page).press("Enter");

    await expect(log(page)).toContainText("can't draft an employment contract");
    await expect(picker(page)).toHaveValue("");
    await expect(preview(page)).toHaveCount(0);
  });

  test("moves to another document when asked, keeping the parties and shared details", async ({ page }) => {
    await chooseDocument(page, "mutual-nda");
    await page.getByRole("tab", { name: "Fields" }).click();
    await page.getByRole("group", { name: "Party 1" }).getByLabel(/^Company/).fill("Acme Inc.");
    await page.getByLabel(/^Governing Law/).fill("Delaware");
    await page.getByRole("tab", { name: "Chat" }).click();

    const requests = await fakeAssistant(page, [
      {
        reply: "Switched to a Pilot Agreement. What product is being trialled?",
        document: "pilot-agreement",
        // As the server does: the Pilot Agreement's defaults, the shared details carried over, then the reply's changes.
        change: (f) => ({
          values: {
            product: "",
            effectiveDate: f!.values.effectiveDate,
            pilotPeriod: "90 days",
            fees: "",
            generalCapAmount: "",
            governingLaw: f!.values.governingLaw,
            chosenCourts: "",
          },
          parties: f!.parties,
        }),
      },
    ]);
    await message(page).fill("Actually we need a 90-day pilot agreement");
    await message(page).press("Enter");

    await expect(log(page)).toContainText("Switched to a Pilot Agreement.");
    expect(requests[0].document).toBe("mutual-nda");
    await expect(picker(page)).toHaveValue("pilot-agreement");
    await expect(preview(page).getByRole("columnheader", { name: "PROVIDER" })).toBeVisible();
    await expect(preview(page).getByText("90 days")).toBeVisible();

    await page.getByRole("tab", { name: "Fields" }).click();
    await expect(page.getByRole("group", { name: "Provider" }).getByLabel(/^Company/)).toHaveValue("Acme Inc.");
    await expect(page.getByLabel(/^Governing Law/)).toHaveValue("Delaware");
  });

  test("shows an error with Retry when the assistant is unavailable", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/chat", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({ status: 502, json: { detail: "The AI assistant is unavailable right now. Please try again." } });
      } else {
        await route.fulfill({ json: { reply: "Back now. What do you need?", document: null, fields: null } });
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
