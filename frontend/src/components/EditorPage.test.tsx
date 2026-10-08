import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPage } from "@/components/EditorPage";
import { ApiError, getDraft, type DraftContent, type SavedDraft } from "@/lib/api";
import { isStartedHere, startNewDocument } from "@/lib/newDocument";
import { parseHash } from "@/lib/route";
import { data, DOCUMENTS } from "@/testing/documents";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), getDraft: vi.fn() }));
// Shows what the editor was opened with; the editor itself is covered by DocumentBuilder.test.tsx.
vi.mock("@/components/DocumentBuilderClient", () => ({
  DocumentBuilderClient: ({ id, saved }: { id: string; saved?: DraftContent }) => (
    <p>
      Editor {id} {saved ? `${saved.document} with ${saved.messages.length} messages` : "new"}
    </p>
  ),
}));

const ID = "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90";
const saved = (document: string): SavedDraft => ({
  id: ID,
  document,
  fields: data("pilot-agreement"),
  messages: [
    { role: "assistant", content: "Hi" },
    { role: "user", content: "A pilot" },
  ],
  title: "Pilot Agreement",
  ready: false,
  createdAt: "2026-10-08T10:00:00Z",
  updatedAt: "2026-10-08T10:00:00Z",
});

describe("EditorPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("opens a saved document with its conversation", async () => {
    vi.mocked(getDraft).mockResolvedValue(saved("pilot-agreement"));
    render(<EditorPage documents={DOCUMENTS} id={ID} />);
    expect(screen.getByText("Loading your document…")).toBeInTheDocument();
    expect(await screen.findByText(`Editor ${ID} pilot-agreement with 2 messages`)).toBeInTheDocument();
    expect(getDraft).toHaveBeenCalledWith(ID);
  });

  it("starts a document that was never saved afresh", async () => {
    vi.mocked(getDraft).mockRejectedValue(new ApiError("Document not found.", 404));
    render(<EditorPage documents={DOCUMENTS} id={ID} />);
    expect(await screen.findByText(`Editor ${ID} new`)).toBeInTheDocument();
  });

  it("doesn't load a document just started in this tab, and loads it next time", async () => {
    startNewDocument();
    const route = parseHash(window.location.hash);
    const id = route.page === "editor" ? route.id : "";
    const { unmount } = render(<EditorPage documents={DOCUMENTS} id={id} />);
    expect(screen.getByText(`Editor ${id} new`)).toBeInTheDocument();
    expect(getDraft).not.toHaveBeenCalled();

    unmount();
    expect(isStartedHere(id)).toBe(false);
    window.location.hash = "";
  });

  it("starts over with the choice of documents if the saved type no longer exists", async () => {
    vi.mocked(getDraft).mockResolvedValue(saved("employment-contract"));
    render(<EditorPage documents={DOCUMENTS} id={ID} />);
    expect(await screen.findByText(`Editor ${ID} null with 2 messages`)).toBeInTheDocument();
  });

  it("offers to try again if loading fails", async () => {
    vi.mocked(getDraft).mockRejectedValueOnce(new ApiError("Can’t reach the server. Check your connection and try again.", 0)).mockResolvedValueOnce(saved("pilot-agreement"));
    const user = userEvent.setup();
    render(<EditorPage documents={DOCUMENTS} id={ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can’t reach the server.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/pilot-agreement with 2 messages/)).toBeInTheDocument();
  });
});
