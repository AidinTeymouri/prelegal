import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentBuilder } from "@/components/DocumentBuilder";
import { ApiError, saveDraft, sendChat, type ChatReply, type Draft } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";
import type { DocumentData } from "@/lib/documents";
import { GREETING, LOST_REPLY } from "@/lib/useDocumentChat";
import { data as documentData, DOCUMENTS } from "@/testing/documents";

// The real PDF rendering is covered by DocumentPdf.test.tsx; here we only check
// what DocumentBuilder passes to the renderer and how it handles the result.
const toBlob = vi.fn<() => Promise<Blob>>();
const pdf = vi.fn<(element: ReactElement) => { toBlob: typeof toBlob }>(() => ({ toBlob }));
vi.mock("@react-pdf/renderer", () => ({ pdf: (element: ReactElement) => pdf(element) }));
const registerPdfFonts = vi.fn();
vi.mock("@/components/DocumentPdf", () => ({ DocumentPdf: () => null, registerPdfFonts: (dir: string) => registerPdfFonts(dir) }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  sendChat: vi.fn(),
  saveDraft: vi.fn(async () => ({})),
}));

const DRAFT_ID = "2f1c8a2e-1b7d-4c3e-9a51-6d0e2b4f7a90";

const NDA = DOCUMENTS.find((d) => d.spec.id === "mutual-nda")!;
const picker = () => screen.getByRole("combobox", { name: "Document" });

// Most tests here use the form on the Mutual NDA; the chat is covered in its own describe block below.
function renderFieldsTab(document = "mutual-nda") {
  render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
  fireEvent.change(picker(), { target: { value: document } });
  fireEvent.click(screen.getByRole("tab", { name: "Fields" }));
}

const downloadButton = () => screen.getByRole("button", { name: /Download PDF|Generating PDF/ });
const preview = () => screen.getByRole("article");
const party = (n: 1 | 2) => screen.getByRole("group", { name: `Party ${n}` });

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");
  await user.type(screen.getByLabelText(/^Jurisdiction/), "New Castle, DE");
  await user.type(within(party(1)).getByLabelText(/^Company/), "Acme Inc.");
  await user.type(within(party(2)).getByLabelText(/^Company/), "Globex");
}

describe("DocumentBuilder", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clicks: HTMLAnchorElement[];
  const { createObjectURL: originalCreateObjectURL, revokeObjectURL: originalRevokeObjectURL } = URL;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(new Date(2026, 2, 15, 10, 0));
    toBlob.mockResolvedValue(new Blob(["%PDF-1.3"], { type: "application/pdf" }));
    createObjectURL = vi.fn(() => "blob:mock-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    clicks = [];
    // jsdom does not implement navigation; record anchor clicks instead.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
    pdf.mockClear();
    registerPdfFonts.mockClear();
    toBlob.mockReset();
  });

  it("starts without a document, offering each one to choose from", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    expect(picker()).toHaveValue("");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What would you like to draft?" })).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Fields" }));
    expect(screen.getByText(/Choose a document above/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pilot Agreement/ }));
    expect(picker()).toHaveValue("pilot-agreement");
    expect(within(preview()).getAllByRole("heading", { level: 1, name: "Pilot Agreement" })).toHaveLength(2); // cover page and terms
    expect(screen.getByRole("group", { name: "Provider" })).toBeInTheDocument();
  });

  it("lists every document in the picker", () => {
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    const options = within(picker()).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a document…", ...DOCUMENTS.map((d) => d.spec.name)]);
  });

  it("keeps the parties and shared details when switching documents", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderFieldsTab();
    await fillRequiredFields(user);
    await user.selectOptions(picker(), "pilot-agreement");

    expect(within(screen.getByRole("group", { name: "Provider" })).getByLabelText(/^Company/)).toHaveValue("Acme Inc.");
    expect(within(screen.getByRole("group", { name: "Customer" })).getByLabelText(/^Company/)).toHaveValue("Globex");
    expect(screen.getByLabelText(/^Governing Law/)).toHaveValue("Delaware");
    expect(screen.getByLabelText(/^Chosen Courts/)).toHaveValue("New Castle, DE");
    expect(screen.getByText("Still needed: Product, Pilot Period")).toBeInTheDocument();
    expect(within(preview()).getByRole("columnheader", { name: "PROVIDER" })).toBeInTheDocument();
  });

  it("starts with today's date and placeholders in the preview", () => {
    renderFieldsTab();
    expect(screen.getByLabelText(/^Effective Date/)).toHaveValue("2026-03-15");
    expect(within(preview()).getByText("March 15, 2026")).toBeInTheDocument();
    expect(within(preview()).getByText("[Fill in state]")).toBeInTheDocument();
  });

  it("updates the preview live as the form changes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderFieldsTab();

    await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");
    expect(within(preview()).getByText("Delaware")).toBeInTheDocument();
    expect(within(preview()).queryByText("[Fill in state]")).not.toBeInTheDocument();

    await user.type(within(party(1)).getByLabelText(/^Signatory name/), "Ada Lovelace");
    const nameRow = within(preview()).getByRole("rowheader", { name: "Print Name" }).closest("tr")!;
    expect(within(nameRow).getAllByRole("cell")[0]).toHaveTextContent("Ada Lovelace");

    await user.click(screen.getByRole("radio", { name: "Continues until terminated" }));
    expect(within(preview()).getByText("Continues until terminated in accordance with the terms of the MNDA.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "In perpetuity" }));
    expect(within(preview()).getByText("In perpetuity.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Effective Date/), { target: { value: "2027-07-04" } });
    expect(within(preview()).getByText("July 4, 2027")).toBeInTheDocument();
  });

  describe("download button", () => {
    it("is disabled and lists what is missing until the required fields are filled", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      expect(downloadButton()).toBeDisabled();
      expect(screen.getByText("Still needed: Governing Law, Jurisdiction, Party 1 company, Party 2 company")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");
      expect(screen.getByText("Still needed: Jurisdiction, Party 1 company, Party 2 company")).toBeInTheDocument();

      await fillRequiredFields(user);
      expect(downloadButton()).toBeEnabled();
      expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument();
    });

    it("is disabled again when a required field is cleared", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.clear(screen.getByLabelText(/^Purpose/));
      expect(downloadButton()).toBeDisabled();
      expect(screen.getByText("Still needed: Purpose")).toBeInTheDocument();
    });

    it("does nothing when clicked while disabled", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await user.click(downloadButton());
      expect(pdf).not.toHaveBeenCalled();
    });
  });

  describe("unsupported characters warning", () => {
    const warning = () => screen.queryByText(/The PDF can’t show these characters/);

    it("is not shown for Latin, Greek or Cyrillic text", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await user.type(within(party(1)).getByLabelText(/^Company/), "Łódź Spółka – ООО Ромашка – Αθήνα");
      expect(warning()).not.toBeInTheDocument();
    });

    it("lists the characters the PDF can't show, and goes away once they are removed", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      const company = within(party(2)).getByLabelText(/^Company/);
      await user.type(company, "株式会社 Globex");
      expect(warning()).toHaveTextContent("株 式 会 社");
      expect(warning()).toHaveAttribute("role", "status");

      await user.clear(company);
      await user.type(company, "Globex KK");
      expect(warning()).not.toBeInTheDocument();
    });

    it("does not block the download", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.type(screen.getByLabelText(/^MNDA Modifications/), "שלום");
      expect(warning()).toBeInTheDocument();
      expect(downloadButton()).toBeEnabled();
    });
  });

  describe("downloading", () => {
    it("renders the PDF from the same cover page and terms as the preview, and downloads it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.click(downloadButton());

      await waitFor(() => expect(clicks).toHaveLength(1));
      const element = pdf.mock.calls[0][0] as ReactElement<{ cover: { sections: { title: string }[] }; terms: unknown }>;
      expect(element.props.terms).toBe(NDA.terms);
      expect(element.props.cover.sections.map((s) => s.title)).toContain("Governing Law & Jurisdiction");
      expect(JSON.stringify(element.props.cover)).toContain("Delaware");

      expect(registerPdfFonts).toHaveBeenCalledWith("/fonts");
      expect(registerPdfFonts.mock.invocationCallOrder[0]).toBeLessThan(pdf.mock.invocationCallOrder[0]);

      const [anchor] = clicks;
      expect(anchor.href).toBe("blob:mock-url");
      expect(anchor.download).toBe("Mutual-NDA_Acme-Inc_Globex.pdf");
      expect(anchor.isConnected).toBe(false); // removed after clicking
      expect(createObjectURL).toHaveBeenCalledWith(await toBlob.mock.results[0].value);
    });

    it("revokes the object URL only after 10 seconds", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.click(downloadButton());
      await waitFor(() => expect(clicks).toHaveLength(1));

      expect(revokeObjectURL).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(9_900));
      expect(revokeObjectURL).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(100));
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("shows progress and prevents double clicks while generating", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let resolve!: (blob: Blob) => void;
      toBlob.mockReturnValue(new Promise((r) => (resolve = r)));
      renderFieldsTab();
      await fillRequiredFields(user);

      await user.click(downloadButton());
      await waitFor(() => expect(downloadButton()).toHaveTextContent("Generating PDF…"));
      expect(downloadButton()).toBeDisabled();
      await user.click(downloadButton());

      await act(async () => resolve(new Blob(["%PDF"])));
      await waitFor(() => expect(downloadButton()).toHaveTextContent("Download PDF"));
      expect(downloadButton()).toBeEnabled();
      expect(pdf).toHaveBeenCalledTimes(1);
      expect(clicks).toHaveLength(1);
    });

    it("shows an error and re-enables the button when generation fails", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      toBlob.mockRejectedValueOnce(new Error("font failed to load"));
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.click(downloadButton());

      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong generating the PDF. Please try again.");
      expect(downloadButton()).toBeEnabled();
      expect(clicks).toHaveLength(0);
      expect(console.error).toHaveBeenCalled();
    });

    it("clears the error when retrying", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      toBlob.mockRejectedValueOnce(new Error("boom"));
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.click(downloadButton());
      await screen.findByRole("alert");

      await user.click(downloadButton());
      await waitFor(() => expect(clicks).toHaveLength(1));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("uses the current form values for each download", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      await fillRequiredFields(user);
      await user.click(downloadButton());
      await waitFor(() => expect(clicks).toHaveLength(1));

      const company = within(party(2)).getByLabelText(/^Company/);
      await user.clear(company);
      await user.type(company, "Initech");
      await user.click(downloadButton());
      await waitFor(() => expect(clicks).toHaveLength(2));
      expect(clicks[1].download).toBe("Mutual-NDA_Acme-Inc_Initech.pdf");
      expect(JSON.stringify(pdf.mock.calls[1][0].props)).toContain("Initech");
    });
  });
});

describe("DocumentBuilder chat", () => {
  const message = () => screen.getByRole("textbox", { name: "Message" });
  const log = () => screen.getByRole("log", { name: "Conversation" });
  // Replies on the Mutual NDA, choosing it first if no document is chosen yet.
  const reply = (content: string, change: (fields: DocumentData) => DocumentData) =>
    vi.mocked(sendChat).mockImplementationOnce(async (_messages, draft) => ({
      reply: content,
      document: "mutual-nda",
      fields: change(draft.fields ?? documentData("mutual-nda")),
    }));
  const withValues = (f: DocumentData, values: DocumentData["values"]): DocumentData => ({ ...f, values: { ...f.values, ...values } });
  const withCompanies = (f: DocumentData, one: string, two: string): DocumentData => ({
    ...f,
    parties: [
      { ...f.parties[0], company: one },
      { ...f.parties[1], company: two },
    ],
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(sendChat).mockReset();
  });

  it("starts on the Chat tab with a greeting", () => {
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(log()).toHaveTextContent(GREETING);
    expect(message()).toHaveFocus();
    expect(downloadButton()).toBeDisabled();
  });

  it("fills in the document from the assistant's replies", async () => {
    const user = userEvent.setup();
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    reply("Thanks! Which state's law should govern?", (f) => withCompanies(f, "Acme Inc.", "Globex"));

    await user.type(message(), "Acme Inc. and Globex{Enter}");

    expect(log()).toHaveTextContent("You: Acme Inc. and Globex");
    expect(await within(log()).findByText("Thanks! Which state's law should govern?")).toBeInTheDocument();
    expect(within(preview()).getByText("Acme Inc.")).toBeInTheDocument();
    expect(sendChat).toHaveBeenCalledWith(
      [
        { role: "assistant", content: GREETING },
        { role: "user", content: "Acme Inc. and Globex" },
      ],
      { document: null, fields: null },
      "2026-10-07",
    );
    expect(picker()).toHaveValue("mutual-nda");
    expect(screen.getByText("Still needed: Governing Law, Jurisdiction")).toBeInTheDocument();

    reply("All set! You can download the NDA now.", (f) => withValues(f, { governingLaw: "Delaware", chosenCourts: "New Castle, DE" }));
    await user.type(message(), "Delaware, New Castle{Enter}");

    expect(await within(log()).findByText("All set! You can download the NDA now.")).toBeInTheDocument();
    expect(downloadButton()).toBeEnabled();
    expect(vi.mocked(sendChat).mock.calls[1][0]).toHaveLength(4);
  });

  it("shows the typing indicator until the reply arrives", async () => {
    const user = userEvent.setup();
    let resolve!: (value: ChatReply) => void;
    vi.mocked(sendChat).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);

    await user.type(message(), "Hi{Enter}");
    expect(screen.getByText("Assistant is typing…")).toBeInTheDocument();

    resolve({ reply: "Hello!", document: null, fields: null });
    expect(await within(log()).findByText("Hello!")).toBeInTheDocument();
    expect(screen.queryByText("Assistant is typing…")).not.toBeInTheDocument();
    expect(message()).toHaveFocus();
  });

  it("shows errors and retries the same conversation", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockRejectedValueOnce(new ApiError("The AI assistant is unavailable right now. Please try again.", 502));
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);

    await user.type(message(), "Acme and Globex{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI assistant is unavailable right now.");

    reply("Got it!", (f) => f);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await within(log()).findByText("Got it!")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(vi.mocked(sendChat).mock.calls[1][0]).toEqual(vi.mocked(sendChat).mock.calls[0][0]);
  });

  it("sends edits made on the Fields tab, and keeps the conversation when switching tabs", async () => {
    const user = userEvent.setup();
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    reply("Thanks!", (f) => f);
    await user.type(message(), "Hello{Enter}");
    await within(log()).findByText("Thanks!");

    await user.click(screen.getByRole("tab", { name: "Fields" }));
    await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");
    await user.click(screen.getByRole("tab", { name: "Chat" }));

    expect(log()).toHaveTextContent("Thanks!");
    reply("Noted.", (f) => f);
    await user.type(message(), "I set the law{Enter}");
    await within(log()).findByText("Noted.");
    expect(vi.mocked(sendChat).mock.calls[1][1].fields?.values.governingLaw).toBe("Delaware");
  });

  it("keeps field edits made while waiting for a reply", async () => {
    const user = userEvent.setup();
    let resolve!: (value: ChatReply) => void;
    vi.mocked(sendChat).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    fireEvent.change(picker(), { target: { value: "mutual-nda" } });

    await user.type(message(), "Acme and Globex{Enter}");
    await user.click(screen.getByRole("tab", { name: "Fields" }));
    await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");

    const sent = vi.mocked(sendChat).mock.calls[0][1] as Draft & { fields: DocumentData };
    resolve({ reply: "Thanks!", document: "mutual-nda", fields: withCompanies(sent.fields, "Acme", "") });

    await waitFor(() => expect(within(party(1)).getByLabelText(/^Company/)).toHaveValue("Acme"));
    expect(screen.getByLabelText(/^Governing Law/)).toHaveValue("Delaware");
  });

  it("moves to the document the assistant chose, keeping what was filled in", async () => {
    const user = userEvent.setup();
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    fireEvent.change(picker(), { target: { value: "mutual-nda" } });
    vi.mocked(sendChat).mockResolvedValueOnce({
      reply: "Let's do a Pilot Agreement instead.",
      document: "pilot-agreement",
      fields: documentData("pilot-agreement", { pilotPeriod: "90 days" }, [{ company: "Acme" }]),
    });

    await user.type(message(), "Actually it's a 90 day pilot{Enter}");

    expect(await within(log()).findByText("Let's do a Pilot Agreement instead.")).toBeInTheDocument();
    expect(picker()).toHaveValue("pilot-agreement");
    expect(within(preview()).getByText("90 days")).toBeInTheDocument();
    expect(log()).toHaveTextContent("Actually it's a 90 day pilot");
  });

  it("stays without a document while the assistant explains what it can draft", async () => {
    const user = userEvent.setup();
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    vi.mocked(sendChat).mockResolvedValueOnce({
      reply: "I can't draft an employment contract, but a Professional Services Agreement may help. Want that?",
      document: null,
      fields: null,
    });

    await user.type(message(), "I need an employment contract{Enter}");

    expect(await within(log()).findByText(/can't draft an employment contract/)).toBeInTheDocument();
    expect(picker()).toHaveValue("");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("switches tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);

    screen.getByRole("tab", { name: "Chat" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Fields" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Fields" })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Chat" })).toBeInTheDocument();
  });
});

describe("DocumentBuilder saving", () => {

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(saveDraft).mockClear();
    vi.mocked(sendChat).mockReset();
  });

  it("doesn't save a new document until there is something to keep", async () => {
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("saves the chosen document, its fields and the conversation as the user works", async () => {
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document" }), { target: { value: "pilot-agreement" } });
    await act(() => vi.advanceTimersByTimeAsync(800));

    expect(saveDraft).toHaveBeenCalledWith(DRAFT_ID, {
      document: "pilot-agreement",
      fields: documentData("pilot-agreement"),
      messages: [{ role: "assistant", content: GREETING }],
    });
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("says when a save fails and retries", async () => {
    vi.mocked(saveDraft).mockRejectedValueOnce(new ApiError("Can’t reach the server.", 0));
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document" }), { target: { value: "pilot-agreement" } });
    await act(() => vi.advanceTimersByTimeAsync(800));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t save.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(saveDraft).toHaveBeenCalledTimes(2);
  });

  it("reopens a saved document with its fields and conversation, without saving it again", async () => {
    const saved = {
      document: "pilot-agreement",
      fields: documentData("pilot-agreement", { pilotPeriod: "90 days" }),
      messages: [
        { role: "assistant" as const, content: GREETING },
        { role: "user" as const, content: "A 90 day pilot" },
        { role: "assistant" as const, content: "Got it." },
      ],
    };
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} saved={saved} />);

    expect(screen.getByRole("combobox", { name: "Document" })).toHaveValue("pilot-agreement");
    expect(within(screen.getByRole("article")).getByText("90 days")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent("A 90 day pilot");
    expect(screen.getByRole("log")).toHaveTextContent("Got it.");
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("offers Retry when a saved conversation lost its last reply", () => {
    const saved = { document: null, fields: null, messages: [{ role: "assistant" as const, content: GREETING }, { role: "user" as const, content: "An NDA" }] };
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} saved={saved} />);
    expect(screen.getByRole("alert")).toHaveTextContent(LOST_REPLY);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the drafts disclaimer in the preview", () => {
    render(<DocumentBuilder documents={DOCUMENTS} id={DRAFT_ID} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Document" }), { target: { value: "mutual-nda" } });
    expect(within(screen.getByRole("article")).getByRole("note")).toHaveTextContent(`Draft. ${DISCLAIMER}`);
  });
});
