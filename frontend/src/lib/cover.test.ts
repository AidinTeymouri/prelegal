import { describe, expect, it } from "vitest";
import { buildCoverPage } from "@/lib/cover";
import type { Inline } from "@/lib/inline";
import { data, SPECS, spec } from "@/testing/documents";

const plain = (inlines: Inline[]) => inlines.map((i) => i.text).join("");
const PILOT = spec("pilot-agreement");

const pilot = (values: Record<string, string> = {}) =>
  buildCoverPage(PILOT, data("pilot-agreement", { effectiveDate: "2026-03-15", ...values }, [{ company: "Acme", name: "Ada" }, { company: "Globex" }]));

function paragraph(cover: ReturnType<typeof pilot>, label: string): Inline[] {
  const found = cover.sections.flatMap((s) => s.paragraphs).find((p) => plain(p).startsWith(`${label}: `));
  if (!found) throw new Error(`No paragraph "${label}"`);
  return found;
}

describe("the cover page of a document without a cover page template", () => {
  it("is titled after the document, with an intro naming the cover page and the standard terms", () => {
    const cover = pilot();
    expect(cover.title).toBe("Pilot Agreement");
    expect(cover.introHeading).toBe("USING THIS PILOT AGREEMENT");
    expect(plain(cover.intro)).toBe(
      "This Pilot Agreement consists of: (1) this Order Form (“Order Form”) and (2) the Common Paper Pilot Agreement Standard Terms " +
        "Version 1.1 (“Standard Terms”) identical to those posted at commonpaper.com/standards/pilot-agreement/1.1. Any modifications " +
        "of the Standard Terms should be made on the Order Form, which will control over conflicts with the Standard Terms.",
    );
    expect(cover.signingStatement).toBe("By signing this Order Form, each party agrees to enter into this Pilot Agreement as of the Effective Date.");
  });

  it("leaves out the version and link when the template has none", () => {
    const dpa = buildCoverPage(spec("data-processing-agreement"), data("data-processing-agreement"));
    expect(plain(dpa.intro)).toContain("(2) the Common Paper Data Processing Agreement Standard Terms (“Standard Terms”). Any");
    expect(dpa.intro.filter((i) => i.kind === "link")).toEqual([]);
    expect(plain(dpa.attribution)).toBe("Common Paper Data Processing Agreement free to use under CC BY 4.0.");
    // The DPA has no Effective Date field.
    expect(dpa.signingStatement).toBe("By signing this Cover Page, each party agrees to enter into this Data Processing Agreement.");
  });

  it("has a section per spec section with a line per field", () => {
    const cover = buildCoverPage(spec("cloud-service-agreement"), data("cloud-service-agreement"));
    expect(cover.sections.map((s) => s.title)).toEqual(["Order Form", "Key Terms"]);
    expect(cover.sections[0].paragraphs.map((p) => p[0])).toContainEqual({ kind: "text", text: "Subscription Period: ", bold: true });
  });

  it("shows values, placeholders for blank required fields and None for blank optional ones", () => {
    const cover = pilot({ pilotPeriod: " 90 days ", fees: "" });
    expect(paragraph(cover, "Pilot Period")[1]).toEqual({ kind: "value", text: "90 days", placeholder: false });
    expect(paragraph(cover, "Effective Date")[1]).toEqual({ kind: "value", text: "March 15, 2026", placeholder: false });
    expect(paragraph(cover, "Governing Law")[1]).toEqual({ kind: "value", text: "[Governing Law]", placeholder: true });
    expect(paragraph(cover, "Fees")[1]).toEqual({ kind: "text", text: "None" });
  });

  it("labels the signature columns with the party roles", () => {
    const cover = pilot();
    expect(cover.partyLabels).toEqual(["PROVIDER", "CUSTOMER"]);
    expect(cover.signatureRows.map((r) => r.label)).toEqual(["Signature", "Print Name", "Title", "Company", "Notice Address", "Date"]);
    expect(cover.signatureRows.find((r) => r.label === "Company")!.values.map(plain)).toEqual(["Acme", "Globex"]);
    expect(cover.signatureRows.find((r) => r.label === "Print Name")!.values).toEqual([[{ kind: "value", text: "Ada", placeholder: false }], []]);
  });

  it("credits Common Paper under CC BY 4.0", () => {
    expect(pilot().attribution).toEqual([
      { kind: "text", text: "Common Paper Pilot Agreement (Version 1.1) free to use under " },
      { kind: "link", text: "CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
      { kind: "text", text: "." },
    ]);
  });

  it("does not interpret markdown or HTML in user input", () => {
    const product = '**bold** <span class="coverpage_link">x</span> [link](javascript:alert(1))';
    expect(paragraph(pilot({ product }), "Product")[1]).toEqual({ kind: "value", text: product, placeholder: false });
  });

  it("builds for every document", () => {
    for (const s of SPECS) {
      const cover = buildCoverPage(s, data(s.id));
      expect(cover.title).toBe(s.name);
      expect(cover.partyLabels).toEqual(s.id === "mutual-nda" ? ["PARTY 1", "PARTY 2"] : s.parties.map((p) => p.toUpperCase()));
    }
  });
});
