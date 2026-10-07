import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NdaBuilder } from "@/components/NdaBuilder";
import { ApiError, sendChat } from "@/lib/api";
import { defaultFormData, parseStandardTerms, type NdaFormData } from "@/lib/nda";
import { GREETING } from "@/lib/useNdaChat";

// The real PDF rendering is covered by NdaPdf.test.tsx; here we only check
// what NdaBuilder passes to the renderer and how it handles the result.
const toBlob = vi.fn<() => Promise<Blob>>();
const pdf = vi.fn<(element: ReactElement) => { toBlob: typeof toBlob }>(() => ({ toBlob }));
vi.mock("@react-pdf/renderer", () => ({ pdf: (element: ReactElement) => pdf(element) }));
const registerPdfFonts = vi.fn();
vi.mock("@/components/NdaPdf", () => ({ NdaPdf: () => null, registerPdfFonts: (dir: string) => registerPdfFonts(dir) }));

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), sendChat: vi.fn() }));

const terms = parseStandardTerms(readFileSync(path.join(process.cwd(), "..", "templates", "Mutual-NDA.md"), "utf8"));

// Most tests here use the form; the chat is covered in its own describe block below.
function renderFieldsTab() {
  render(<NdaBuilder terms={terms} />);
  fireEvent.click(screen.getByRole("tab", { name: "Fields" }));
}

const downloadButton = () => screen.getByRole("button", { name: /Download PDF|Generating PDF/ });
const preview = () => screen.getByRole("article");
const party = (n: 1 | 2) => screen.getByRole("group", { name: `Party ${n}` });

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Governing law/), "Delaware");
  await user.type(screen.getByLabelText(/^Jurisdiction/), "New Castle, DE");
  await user.type(within(party(1)).getByLabelText(/^Company/), "Acme Inc.");
  await user.type(within(party(2)).getByLabelText(/^Company/), "Globex");
}

describe("NdaBuilder", () => {
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

  it("starts with today's date and placeholders in the preview", () => {
    renderFieldsTab();
    expect(screen.getByLabelText(/^Effective date/)).toHaveValue("2026-03-15");
    expect(within(preview()).getByText("March 15, 2026")).toBeInTheDocument();
    expect(within(preview()).getByText("[Fill in state]")).toBeInTheDocument();
  });

  it("updates the preview live as the form changes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderFieldsTab();

    await user.type(screen.getByLabelText(/^Governing law/), "Delaware");
    expect(within(preview()).getByText("Delaware")).toBeInTheDocument();
    expect(within(preview()).queryByText("[Fill in state]")).not.toBeInTheDocument();

    await user.type(within(party(1)).getByLabelText(/^Signatory name/), "Ada Lovelace");
    const nameRow = within(preview()).getByRole("rowheader", { name: "Print Name" }).closest("tr")!;
    expect(within(nameRow).getAllByRole("cell")[0]).toHaveTextContent("Ada Lovelace");

    await user.click(screen.getByRole("radio", { name: "Continues until terminated" }));
    expect(within(preview()).getByText("Continues until terminated in accordance with the terms of the MNDA.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "In perpetuity" }));
    expect(within(preview()).getByText("In perpetuity.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Effective date/), { target: { value: "2027-07-04" } });
    expect(within(preview()).getByText("July 4, 2027")).toBeInTheDocument();
  });

  describe("download button", () => {
    it("is disabled and lists what is missing until the required fields are filled", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderFieldsTab();
      expect(downloadButton()).toBeDisabled();
      expect(screen.getByText("Still needed: Governing law, Jurisdiction, Party 1 company, Party 2 company")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Governing law/), "Delaware");
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
      await user.type(screen.getByLabelText(/^MNDA modifications/), "שלום");
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
      expect(element.props.terms).toBe(terms);
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

describe("NdaBuilder chat", () => {
  const message = () => screen.getByRole("textbox", { name: "Message" });
  const log = () => screen.getByRole("log", { name: "Conversation" });
  const reply = (content: string, change: (fields: NdaFormData) => NdaFormData) =>
    vi.mocked(sendChat).mockImplementationOnce(async (_messages, fields) => ({ reply: content, fields: change(fields) }));

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(sendChat).mockReset();
  });

  it("starts on the Chat tab with a greeting", () => {
    render(<NdaBuilder terms={terms} />);
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(log()).toHaveTextContent(GREETING);
    expect(message()).toHaveFocus();
    expect(downloadButton()).toBeDisabled();
  });

  it("fills in the document from the assistant's replies", async () => {
    const user = userEvent.setup();
    render(<NdaBuilder terms={terms} />);
    reply("Thanks! Which state's law should govern?", (f) => ({
      ...f,
      party1: { ...f.party1, company: "Acme Inc." },
      party2: { ...f.party2, company: "Globex" },
    }));

    await user.type(message(), "Acme Inc. and Globex{Enter}");

    expect(log()).toHaveTextContent("You: Acme Inc. and Globex");
    expect(await within(log()).findByText("Thanks! Which state's law should govern?")).toBeInTheDocument();
    expect(within(preview()).getByText("Acme Inc.")).toBeInTheDocument();
    expect(sendChat).toHaveBeenCalledWith(
      [
        { role: "assistant", content: GREETING },
        { role: "user", content: "Acme Inc. and Globex" },
      ],
      defaultFormData(),
      "2026-10-07",
    );
    expect(screen.getByText("Still needed: Governing law, Jurisdiction")).toBeInTheDocument();

    reply("All set! You can download the NDA now.", (f) => ({ ...f, governingLaw: "Delaware", jurisdiction: "New Castle, DE" }));
    await user.type(message(), "Delaware, New Castle{Enter}");

    expect(await within(log()).findByText("All set! You can download the NDA now.")).toBeInTheDocument();
    expect(downloadButton()).toBeEnabled();
    expect(vi.mocked(sendChat).mock.calls[1][0]).toHaveLength(4);
  });

  it("shows the typing indicator until the reply arrives", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { reply: string; fields: NdaFormData }) => void;
    vi.mocked(sendChat).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<NdaBuilder terms={terms} />);

    await user.type(message(), "Hi{Enter}");
    expect(screen.getByText("Assistant is typing…")).toBeInTheDocument();

    resolve({ reply: "Hello!", fields: defaultFormData() });
    expect(await within(log()).findByText("Hello!")).toBeInTheDocument();
    expect(screen.queryByText("Assistant is typing…")).not.toBeInTheDocument();
    expect(message()).toHaveFocus();
  });

  it("shows errors and retries the same conversation", async () => {
    const user = userEvent.setup();
    vi.mocked(sendChat).mockRejectedValueOnce(new ApiError("The AI assistant is unavailable right now. Please try again.", 502));
    render(<NdaBuilder terms={terms} />);

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
    render(<NdaBuilder terms={terms} />);
    reply("Thanks!", (f) => f);
    await user.type(message(), "Hello{Enter}");
    await within(log()).findByText("Thanks!");

    await user.click(screen.getByRole("tab", { name: "Fields" }));
    await user.type(screen.getByLabelText(/^Governing law/), "Delaware");
    await user.click(screen.getByRole("tab", { name: "Chat" }));

    expect(log()).toHaveTextContent("Thanks!");
    reply("Noted.", (f) => f);
    await user.type(message(), "I set the law{Enter}");
    await within(log()).findByText("Noted.");
    expect(vi.mocked(sendChat).mock.calls[1][1].governingLaw).toBe("Delaware");
  });

  it("keeps field edits made while waiting for a reply", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { reply: string; fields: NdaFormData }) => void;
    vi.mocked(sendChat).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<NdaBuilder terms={terms} />);

    await user.type(message(), "Acme and Globex{Enter}");
    await user.click(screen.getByRole("tab", { name: "Fields" }));
    await user.type(screen.getByLabelText(/^Governing law/), "Delaware");

    const sent = vi.mocked(sendChat).mock.calls[0][1];
    resolve({ reply: "Thanks!", fields: { ...sent, party1: { ...sent.party1, company: "Acme" } } });

    await waitFor(() => expect(within(party(1)).getByLabelText(/^Company/)).toHaveValue("Acme"));
    expect(screen.getByLabelText(/^Governing law/)).toHaveValue("Delaware");
  });

  it("switches tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<NdaBuilder terms={terms} />);

    screen.getByRole("tab", { name: "Chat" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Fields" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Fields" })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Chat" })).toBeInTheDocument();
  });
});
