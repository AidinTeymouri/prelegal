import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NdaPreview } from "@/components/NdaPreview";
import { buildCoverPage, defaultFormData, parseStandardTerms, type NdaFormData } from "@/lib/nda";

const terms = parseStandardTerms(readFileSync(path.join(process.cwd(), "..", "templates", "Mutual-NDA.md"), "utf8"));

function completeFormData(): NdaFormData {
  return {
    ...defaultFormData(),
    effectiveDate: "2026-03-15",
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "legal@acme.test" },
    party2: { name: "Alan Turing", title: "CTO", company: "Globex", noticeAddress: "1 Main St" },
  };
}

function renderPreview(data: NdaFormData) {
  return render(<NdaPreview cover={buildCoverPage(data)} terms={terms} />);
}

describe("NdaPreview", () => {
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
    renderPreview({ ...defaultFormData(), purpose: "", effectiveDate: "" });
    for (const text of ["[Purpose]", "[Effective Date]", "[Fill in state]", "[Fill in city or county and state]"]) {
      expect(screen.getByText(text)).toHaveClass("bg-amber-100");
    }
  });

  it("renders user input as text, never as HTML", () => {
    const data = completeFormData();
    data.purpose = '<img src=x onerror="alert(1)"><b>bold</b>';
    const { container } = renderPreview(data);
    expect(screen.getByText(data.purpose)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("keeps line breaks in multi-line modifications", () => {
    const data = completeFormData();
    data.modifications = "Line one\nLine two";
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
      renderPreview(defaultFormData());
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
