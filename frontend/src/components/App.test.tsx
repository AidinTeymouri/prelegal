import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/components/App";
import { ApiError, getCurrentUser, listDrafts, signIn, signOut } from "@/lib/api";
import { saveNow } from "@/lib/useAutosave";
import { DISCLAIMER } from "@/lib/disclaimer";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  listDrafts: vi.fn(async () => []),
}));
vi.mock("@/lib/useAutosave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/useAutosave")>()),
  saveNow: vi.fn(async () => true),
}));
// The editor itself is covered by EditorPage.test.tsx and DocumentBuilder.test.tsx.
vi.mock("@/components/EditorPage", () => ({ EditorPage: ({ id }: { id: string }) => <p>Editing {id}</p> }));

const DRAFT_ID = "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90";
const dashboard = () => screen.findByRole("heading", { name: "My documents" });

const ada = { id: 1, email: "ada@example.com" };

describe("App", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });

  it("shows Loading until it knows whether someone is signed in", async () => {
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
    render(<App documents={[]} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows the sign-in form when nobody is signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(<App documents={[]} />);

    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My documents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows a signed-in user their documents", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    render(<App documents={[]} />);

    expect(await dashboard()).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(listDrafts).toHaveBeenCalled();
  });

  it("opens the document in the URL", async () => {
    window.location.hash = `#/documents/${DRAFT_ID}`;
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    render(<App documents={[]} />);
    expect(await screen.findByText(`Editing ${DRAFT_ID}`)).toBeInTheDocument();
  });

  it("starts a new document and goes back to the list", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.click((await screen.findAllByRole("button", { name: /New document/ }))[0]);
    expect(await screen.findByText(/^Editing [0-9a-f-]{36}$/)).toBeInTheDocument();
    expect(window.location.hash).toMatch(/^#\/documents\/[0-9a-f-]{36}$/);

    await user.click(screen.getByRole("link", { name: "My documents" }));
    expect(await dashboard()).toBeInTheDocument();
  });

  it("shows the drafts disclaimer on every screen", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { unmount } = render(<App documents={[]} />);
    expect(await screen.findByRole("contentinfo")).toHaveTextContent(DISCLAIMER);
    unmount();

    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    render(<App documents={[]} />);
    await dashboard();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(DISCLAIMER);
  });

  it("shows the documents after signing in, and the sign-in form after signing out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(signIn).mockResolvedValue(ada);
    vi.mocked(signOut).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.type(await screen.findByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText(/^Password/), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await dashboard()).toBeInTheDocument();

    window.location.hash = `#/documents/${DRAFT_ID}`;
    expect(await screen.findByText(`Editing ${DRAFT_ID}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    // The next person to sign in here starts on their own documents.
    expect(window.location.hash).toBe("#/documents");
  });

  it("saves the open document before signing out, and asks before discarding unsaved changes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    vi.mocked(signOut).mockResolvedValue(undefined);
    vi.mocked(saveNow).mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your latest changes couldn’t be saved. Sign out again to discard them.");
    expect(signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in to Prelegal" })).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("stays signed in and says so if signing out fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ada);
    vi.mocked(signOut).mockRejectedValue(new ApiError("Can’t reach the server. Check your connection and try again.", 0));
    const user = userEvent.setup();
    render(<App documents={[]} />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can’t reach the server.");
    expect(screen.getByRole("heading", { name: "My documents" })).toBeInTheDocument();
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
