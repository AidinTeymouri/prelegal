import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, isExpectedAuthError, signUp, uniqueEmail } from "./helpers";

const signInHeading = (page: Page) => page.getByRole("heading", { name: "Sign in to Prelegal" });
// Scoped to the page content: Next.js adds an empty route announcer with role="alert".
const formError = (page: Page) => page.getByRole("main").getByRole("alert");

test.describe("accounts", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    // Wrong passwords, duplicate accounts and invalid emails are rejected with 401, 409 and 422.
    page.on("console", (msg) => msg.type() === "error" && !isExpectedAuthError(msg.text(), [401, 409, 422]) && consoleErrors.push(msg.text()));
    page.on("pageerror", (err) => consoleErrors.push(err.message));
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test("asks visitors to sign in before they can use the document creator", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Legal Agreement Creator · Prelegal");
    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  });

  test("signs up, stays signed in across reloads, signs out and signs back in", async ({ page, context }) => {
    const email = await signUp(page);
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

    const [cookie] = await context.cookies();
    expect(cookie).toMatchObject({ name: "prelegal_session", httpOnly: true, sameSite: "Lax" });

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(signInHeading(page)).toBeVisible();
    await page.reload();
    await expect(signInHeading(page)).toBeVisible();

    await page.getByLabel("Email").fill(email.toUpperCase());
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    const email = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(signInHeading(page)).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(formError(page)).toHaveText("Incorrect email or password.");
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  });

  test("won't create a second account for the same email", async ({ page }) => {
    const email = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(signInHeading(page)).toBeVisible();

    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(formError(page)).toHaveText("An account with this email already exists.");
  });

  test("shows the server's validation message", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
    // Passes the browser's own email check but not the server's.
    await page.getByLabel("Email").fill(`${uniqueEmail().split("@")[0]}@localhost`);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(formError(page)).toHaveText("Enter a valid email address.");
  });
});
