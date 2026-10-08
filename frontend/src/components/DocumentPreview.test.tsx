import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentPreview } from "@/components/DocumentPreview";
import { buildCoverPage } from "@/lib/cover";
import type { DocumentData } from "@/lib/documents";
import { data as documentData, DOCUMENTS } from "@/testing/documents";

const document = (id: string) => DOCUMENTS.find((d) => d.spec.id === id)!;

function completeFormData(): DocumentData {
  return documentData("mutual-nda", { effectiveDate: "2026-03-15", governingLaw: "Delaware", chosenCourts: "New Castle, DE" }, [
    { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
    { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St" },
  ]);
}

function renderPreview(data: DocumentData, id = "mutual-nda") {
  const { spec, terms } = document(id);
  return render(<DocumentPreview cover={buildCoverPage(spec, data)} terms={terms} />);
}

describe("DocumentPreview", () => {
  it("shows the cover page and the standard terms headings", () => {
    renderPreview(completeFormData());
    expect(screen.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Standard Terms" })).toBeInTheDocument();
    for (const title of ["Purpose", "Effective Date", "MNDA Term", "Term of Confidentiality", "Governing Law & Jurisdiction", "MNDA Modifications"]) {
      expect(screen.getByRole("heading", { level: 2, name: new RegExp(`^${title}`) })).toBeInTheDocument();
    }
  });

  it("shows section hints next to the section titles", () => {
    renderPreview(completeFormData());
    expect(screen.getByRole("heading", { level: 2, name: /^MNDA Term/ })).toHaveTextContent("The length of this MNDA");
  });

  it("highlights the filled-in values", () => {
    renderPreview(completeFormData());
    for (const text of ["March 15, 2026", "Delaware", "New Castle, DE", "1 year"]) {
      expect(screen.getAllByText(text)[0]).toHaveClass("bg-indigo-50");
    }
  });

  it("shows highlighted placeholders for empty required fields", () => {
    renderPreview(documentData("mutual-nda", { purpose: "", effectiveDate: "" }));
    for (const text of ["[Purpose]", "[Effective Date]", "[Fill in state]", "[Fill in city or county and state]"]) {
      expect(screen.getByText(text)).toHaveClass("bg-amber-100");
    }
  });

  it("renders user input as text, never as HTML", () => {
    const data = completeFormData();
    data.values.purpose = '<img src=x onerror="alert(1)"><b>bold</b>';
    const { container } = renderPreview(data);
    expect(screen.getByText(data.values.purpose)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("keeps line breaks in multi-line modifications", () => {
    const data = completeFormData();
    data.values.modifications = "Line one\nLine two";
    renderPreview(data);
    const value = screen.getByText(/Line one/);
    expect(value.textContent).toBe("Line one\nLine two");
    expect(value.closest("p")).toHaveClass("whitespace-pre-line");
  });

  describe("signature table", () => {
    it("has a column per party and a row per field", () => {
      renderPreview(completeFormData());
      const table = screen.getByRole("table");
      expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["PARTY 1", "PARTY 2"]);
      expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
        "Signature",
        "Print Name",
        "Title",
        "Company",
        "Notice AddressUse either email or postal address",
        "Date",
      ]);
    });

    it("puts each party's details in its own column", () => {
      renderPreview(completeFormData());
      const row = screen.getByRole("rowheader", { name: "Company" }).closest("tr")!;
      expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Acme Inc.", "Globex"]);
    });

    it("leaves signature, date and empty party details blank", () => {
      renderPreview(documentData("mutual-nda"));
      for (const label of ["Signature", "Print Name", "Company", "Date"]) {
        const row = screen.getByRole("rowheader", { name: label }).closest("tr")!;
        expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["", ""]);
      }
    });
  });

  describe("standard terms", () => {
    it("shows all 11 numbered clauses", () => {
      renderPreview(completeFormData());
      for (let n = 1; n <= 11; n++) expect(screen.getByText(`${n}.`)).toBeInTheDocument();
    });

    it("shows clause titles in bold and cover page terms underlined", () => {
      renderPreview(completeFormData());
      expect(screen.getByText("Use and Protection of Confidential Information").tagName).toBe("STRONG");
      const termRefs = screen.getAllByText("Purpose", { selector: "span.underline" });
      expect(termRefs).toHaveLength(3);
    });
  });

  describe("for a document with nested clauses", () => {
    const pilot = () => documentData("pilot-agreement", {}, [{ company: "Acme" }, { company: "Globex" }]);

    it("labels the signature columns with the party roles", () => {
      renderPreview(pilot(), "pilot-agreement");
      expect(within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["PROVIDER", "CUSTOMER"]);
    });

    it("numbers and indents sub-clauses under their sections", () => {
      renderPreview(pilot(), "pilot-agreement");
      const clause = screen.getByText("1.1.").closest("p")!;
      expect(clause).toHaveTextContent("1.1.Access and Use.");
      expect(clause.style.marginLeft).toBe("1.5rem");
      expect(screen.getAllByText("(a)")[0].closest("p")!.style.marginLeft).toBe("3rem");
      expect(screen.getByText("1.").closest("p")!.style.marginLeft).toBe("0rem");
    });

    it("shows None for blank optional fields and placeholders for required ones", () => {
      renderPreview(pilot(), "pilot-agreement");
      expect(screen.getByText("[Pilot Period]")).toHaveClass("bg-amber-100");
      expect(screen.getByText("Fees:").closest("p")).toHaveTextContent("Fees: None");
    });
  });

  it("opens external links in a new tab without leaking the referrer", () => {
    renderPreview(completeFormData());
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "https://commonpaper.com/standards/mutual-nda/1.0",
      "https://creativecommons.org/licenses/by/4.0/",
      "https://commonpaper.com/standards/mutual-nda/1.0/",
      "https://creativecommons.org/licenses/by/4.0/",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });
});
