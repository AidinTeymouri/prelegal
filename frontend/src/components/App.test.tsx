import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/components/App";
import { ApiError, getCurrentUser, signIn, signOut } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));
// The document creator itself is covered by DocumentBuilder.test.tsx.
vi.mock("@/components/DocumentBuilderClient", () => ({ DocumentBuilderClient: () => <p>Document creator</p> }));

const ada = { id: 1, email: "ada@example.com" };

describe("App", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows Loading until it knows whether someone is signed in", async () => {
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
    render(<App documents={[]} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByText("Prelegal")).toBeInTheDocument();
  });

  it("shows the sign-in form when nobody is signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(<App documents={[]} />);

    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(screen.queryByText("Document creator")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows the document creator to a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    render(<App documents={[]} />);

    expect(await screen.findByText("Document creator")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Legal agreement creator")).toBeInTheDocument();
  });

  it("shows the document creator after signing in, and the sign-in form after signing out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(signIn).mockResolvedValue(ada);
    vi.mocked(signOut).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.type(await screen.findByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText(/^Password/), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Document creator")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(screen.queryByText("Document creator")).not.toBeInTheDocument();
  });

  it("stays signed in and says so if signing out fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    vi.mocked(signOut).mockRejectedValue(new ApiError("Can’t reach the server. Check your connection and try again.", 0));
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can’t reach the server.");
    expect(screen.getByText("Document creator")).toBeInTheDocument();
  });

  it("offers to try again if the server can't be reached", async () => {
    vi.mocked(getCurrentUser)
      .mockRejectedValueOnce(new ApiError("Can’t reach the server. Check your connection and try again.", 0))
      .mockResolvedValueOnce(null);
    const user = userEvent.setup();
    render(<App documents={[]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can’t reach the server.");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
