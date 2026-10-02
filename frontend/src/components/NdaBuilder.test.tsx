import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NdaBuilder } from "@/components/NdaBuilder";
import { parseStandardTerms } from "@/lib/nda";

// The real PDF rendering is covered by NdaPdf.test.tsx; here we only check
// what NdaBuilder passes to the renderer and how it handles the result.
const toBlob = vi.fn<() => Promise<Blob>>();
const pdf = vi.fn<(element: ReactElement) => { toBlob: typeof toBlob }>(() => ({ toBlob }));
vi.mock("@react-pdf/renderer", () => ({ pdf: (element: ReactElement) => pdf(element) }));
vi.mock("@/components/NdaPdf", () => ({ NdaPdf: () => null }));

const terms = parseStandardTerms(readFileSync(path.join(process.cwd(), "templates", "Mutual-NDA.md"), "utf8"));

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
    toBlob.mockReset();
  });

  it("starts with today's date and placeholders in the preview", () => {
    render(<NdaBuilder terms={terms} />);
    expect(screen.getByLabelText(/^Effective date/)).toHaveValue("2026-03-15");
    expect(within(preview()).getByText("March 15, 2026")).toBeInTheDocument();
    expect(within(preview()).getByText("[Fill in state]")).toBeInTheDocument();
  });

  it("updates the preview live as the form changes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NdaBuilder terms={terms} />);

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
      render(<NdaBuilder terms={terms} />);
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
      render(<NdaBuilder terms={terms} />);
      await fillRequiredFields(user);
      await user.clear(screen.getByLabelText(/^Purpose/));
      expect(downloadButton()).toBeDisabled();
      expect(screen.getByText("Still needed: Purpose")).toBeInTheDocument();
    });

    it("does nothing when clicked while disabled", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<NdaBuilder terms={terms} />);
      await user.click(downloadButton());
      expect(pdf).not.toHaveBeenCalled();
    });
  });

  describe("downloading", () => {
    it("renders the PDF from the same cover page and terms as the preview, and downloads it", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<NdaBuilder terms={terms} />);
      await fillRequiredFields(user);
      await user.click(downloadButton());

      await waitFor(() => expect(clicks).toHaveLength(1));
      const element = pdf.mock.calls[0][0] as ReactElement<{ cover: { sections: { title: string }[] }; terms: unknown }>;
      expect(element.props.terms).toBe(terms);
      expect(element.props.cover.sections.map((s) => s.title)).toContain("Governing Law & Jurisdiction");
      expect(JSON.stringify(element.props.cover)).toContain("Delaware");

      const [anchor] = clicks;
      expect(anchor.href).toBe("blob:mock-url");
      expect(anchor.download).toBe("Mutual-NDA_Acme-Inc_Globex.pdf");
      expect(anchor.isConnected).toBe(false); // removed after clicking
      expect(createObjectURL).toHaveBeenCalledWith(await toBlob.mock.results[0].value);
    });

    it("revokes the object URL only after 10 seconds", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<NdaBuilder terms={terms} />);
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
      render(<NdaBuilder terms={terms} />);
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
      render(<NdaBuilder terms={terms} />);
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
      render(<NdaBuilder terms={terms} />);
      await fillRequiredFields(user);
      await user.click(downloadButton());
      await screen.findByRole("alert");

      await user.click(downloadButton());
      await waitFor(() => expect(clicks).toHaveLength(1));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("uses the current form values for each download", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<NdaBuilder terms={terms} />);
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
