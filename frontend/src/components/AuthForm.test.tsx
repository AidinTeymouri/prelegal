import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AuthForm } from "@/components/AuthForm";
import { ApiError, signIn, signUp, type User } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

const ada = { id: 1, email: "ada@example.com" };

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText(/^Password/), password);
}

describe("AuthForm", () => {
  let onSignedIn: Mock<(user: User) => void>;

  beforeEach(() => {
    onSignedIn = vi.fn<(user: User) => void>();
    render(<AuthForm onSignedIn={onSignedIn} documentNames={["Mutual Non-Disclosure Agreement", "Pilot Agreement"]} />);
  });

  afterEach(() => vi.clearAllMocks());

  it("starts on sign in", () => {
    expect(screen.getByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "current-password");
  });

  it("signs in and reports the user", async () => {
    vi.mocked(signIn).mockResolvedValue(ada);
    const user = userEvent.setup();

    await fill(user, "ada@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct horse" });
    expect(signUp).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith(ada);
  });

  it("switches to sign up and creates an account", async () => {
    vi.mocked(signUp).mockResolvedValue(ada);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create your Prelegal account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("minlength", "8");

    await fill(user, "ada@example.com", "correct horse");
    await user.type(screen.getByLabelText("Confirm password"), "correct horse");
    await user.keyboard("{Enter}");

    expect(signUp).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct horse" });
    expect(onSignedIn).toHaveBeenCalledWith(ada);
  });

  it("shows the server's error and lets the user try again", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new ApiError("Incorrect email or password.", 401)).mockResolvedValueOnce(ada);
    const user = userEvent.setup();

    await fill(user, "ada@example.com", "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignedIn).toHaveBeenCalledWith(ada);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a generic error for unexpected failures", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();

    await fill(user, "ada@example.com", "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("disables the button while submitting", async () => {
    let resolve!: (u: typeof ada) => void;
    vi.mocked(signIn).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();

    await fill(user, "ada@example.com", "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    resolve(ada);
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it("clears the error when switching mode", async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError("Incorrect email or password.", 401));
    const user = userEvent.setup();

    await fill(user, "ada@example.com", "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // What was typed is kept.
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("checks that the two passwords match before creating an account", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create an account" }));

    await fill(user, "ada@example.com", "correct horse");
    await user.type(screen.getByLabelText("Confirm password"), "correct hose");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The passwords don’t match.");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("aria-invalid", "true");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("only asks to confirm the password when signing up", async () => {
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("shows and hides the passwords", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    const toggle = screen.getByRole("button", { name: "Show password" });

    await user.click(toggle);
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-controls", "password confirm-password");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "password");
  });

  it("shows the drafts disclaimer when signing up", async () => {
    const user = userEvent.setup();
    expect(screen.queryByText(new RegExp(DISCLAIMER.slice(0, 40)))).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByText(/By creating an account you acknowledge/)).toHaveTextContent(DISCLAIMER);
  });

  it("lists the documents Prelegal can draft", () => {
    expect(screen.getByText("Pilot Agreement")).toBeInTheDocument();
    expect(screen.getByText("2 agreements to choose from")).toBeInTheDocument();
  });
});
