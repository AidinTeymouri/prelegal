import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AuthForm } from "@/components/AuthForm";
import { ApiError, signIn, signUp, type User } from "@/lib/api";

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
    render(<AuthForm onSignedIn={onSignedIn} />);
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
});
