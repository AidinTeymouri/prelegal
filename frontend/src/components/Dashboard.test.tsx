import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/Dashboard";
import { ApiError, deleteDraft, listDrafts, type DraftSummary } from "@/lib/api";
import { DOCUMENTS } from "@/testing/documents";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listDrafts: vi.fn(),
  deleteDraft: vi.fn(),
}));

const pilot: DraftSummary = {
  id: "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90",
  document: "pilot-agreement",
  title: "Pilot Agreement: Acme Inc.",
  ready: false,
  updatedAt: new Date().toISOString(),
};
const nda: DraftSummary = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  document: "mutual-nda",
  title: "Mutual Non-Disclosure Agreement: Acme / Globex",
  ready: true,
  updatedAt: "2026-01-15T10:00:00Z",
};

const rows = () => within(screen.getByRole("list", { name: "Documents" })).getAllByRole("listitem");

describe("Dashboard", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });

  it("lists the user's documents with their status", async () => {
    vi.mocked(listDrafts).mockResolvedValue([pilot, nda]);
    render(<Dashboard documents={DOCUMENTS} />);

    expect(await screen.findByRole("link", { name: "Pilot Agreement: Acme Inc." })).toHaveAttribute("href", `#/documents/${pilot.id}`);
    const [first, second] = rows();
    expect(first).toHaveTextContent("Pilot Agreement · Updated just now");
    expect(within(first).getByText("Draft")).toBeInTheDocument();
    expect(second).toHaveTextContent("Mutual Non-Disclosure Agreement · Updated Jan 15, 2026");
    expect(within(second).getByText("Ready")).toBeInTheDocument();
  });

  it("says when there are no documents yet", async () => {
    vi.mocked(listDrafts).mockResolvedValue([]);
    render(<Dashboard documents={DOCUMENTS} />);
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /New document/ })).toHaveLength(2);
  });

  it("starts a new document", async () => {
    vi.mocked(listDrafts).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Dashboard documents={DOCUMENTS} />);
    await user.click((await screen.findAllByRole("button", { name: /New document/ }))[0]);
    expect(window.location.hash).toMatch(/^#\/documents\/[0-9a-f-]{36}$/);
  });

  it("deletes a document after confirming", async () => {
    vi.mocked(listDrafts).mockResolvedValue([pilot, nda]);
    vi.mocked(deleteDraft).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Dashboard documents={DOCUMENTS} />);

    await user.click(await screen.findByRole("button", { name: "Delete Pilot Agreement: Acme Inc." }));
    expect(screen.getByRole("button", { name: "Keep Pilot Agreement: Acme Inc." })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep Pilot Agreement: Acme Inc." }));
    expect(deleteDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete Pilot Agreement: Acme Inc." })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Delete Pilot Agreement: Acme Inc." }));
    await user.click(screen.getByRole("button", { name: "Confirm deleting Pilot Agreement: Acme Inc." }));
    expect(deleteDraft).toHaveBeenCalledWith(pilot.id);
    expect(await screen.findByRole("link", { name: nda.title })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: pilot.title })).not.toBeInTheDocument();
  });

  it("shows an error if a delete fails, and keeps the document", async () => {
    vi.mocked(listDrafts).mockResolvedValue([pilot]);
    vi.mocked(deleteDraft).mockRejectedValue(new ApiError("Document not found.", 404));
    const user = userEvent.setup();
    render(<Dashboard documents={DOCUMENTS} />);

    await user.click(await screen.findByRole("button", { name: `Delete ${pilot.title}` }));
    await user.click(screen.getByRole("button", { name: `Confirm deleting ${pilot.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Document not found.");
    expect(screen.getByRole("link", { name: pilot.title })).toBeInTheDocument();
  });

  it("offers to try again if the documents can't be loaded", async () => {
    vi.mocked(listDrafts).mockRejectedValueOnce(new ApiError("Can’t reach the server. Check your connection and try again.", 0)).mockResolvedValueOnce([pilot]);
    const user = userEvent.setup();
    render(<Dashboard documents={DOCUMENTS} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can’t reach the server.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: pilot.title })).toBeInTheDocument();
  });
});
