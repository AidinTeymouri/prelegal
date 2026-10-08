import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentData, Party } from "@/lib/documents";
import { data as documentData, spec } from "@/testing/documents";

const NDA = spec("mutual-nda");
const initialData = (values: Record<string, string | number> = {}, parties: Partial<Party>[] = []) =>
  documentData("mutual-nda", { effectiveDate: "2026-03-15", ...values }, parties);

// Holds the form state like DocumentBuilder does, and records every change.
function setup(values: Record<string, string | number> = {}, parties: Partial<Party>[] = [], document = NDA) {
  const onChange = vi.fn<(data: DocumentData) => void>();
  function Harness() {
    const [data, setData] = useState<DocumentData>(
      document === NDA ? initialData(values, parties) : documentData(document.id, values, parties),
    );
    return (
      <DocumentForm
        spec={document}
        data={data}
        onChange={(next) => {
          onChange(next);
          setData(next);
        }}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  const latest = () => onChange.mock.lastCall![0];
  return { user, onChange, latest };
}

const agreement = () => screen.getByRole("group", { name: "Agreement terms" });
const party = (n: 1 | 2) => screen.getByRole("group", { name: `Party ${n}` });
const yearsInputs = () => [
  screen.getByRole("spinbutton", { name: "MNDA term in years" }),
  screen.getByRole("spinbutton", { name: "Term of confidentiality in years" }),
];

describe("DocumentForm", () => {
  it("shows the current values", () => {
    setup({ governingLaw: "Delaware" }, [{}, { company: "Globex" }]);
    expect(screen.getByLabelText(/^Purpose/)).toHaveValue(initialData().values.purpose);
    expect(screen.getByLabelText(/^Effective Date/)).toHaveValue("2026-03-15");
    expect(screen.getByLabelText(/^Governing Law/)).toHaveValue("Delaware");
    expect(within(party(2)).getByLabelText(/^Company/)).toHaveValue("Globex");
    expect(screen.getByRole("radio", { name: /^Expires/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^For 1 year\(s\) from the effective date$/ })).toBeChecked();
    expect(yearsInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["1", "1"]);
  });

  it("groups the fields into agreement terms and one section per party", () => {
    setup();
    expect(agreement()).toBeInTheDocument();
    const mndaTerm = within(agreement()).getByRole("group", { name: "MNDA Term" });
    expect(within(mndaTerm).getAllByRole("radio")).toHaveLength(2);
    expect(within(mndaTerm).getByRole("spinbutton")).toBe(yearsInputs()[0]);
    const confidentiality = within(agreement()).getByRole("group", { name: "Term of Confidentiality" });
    expect(within(confidentiality).getAllByRole("radio")).toHaveLength(2);
    expect(within(confidentiality).getByRole("spinbutton")).toBe(yearsInputs()[1]);
    for (const n of [1, 2] as const) {
      const group = party(n);
      for (const label of [/^Company/, /^Signatory name/, /^Title/, /^Notice address/]) {
        expect(within(group).getByLabelText(label)).toBeInTheDocument();
      }
    }
  });

  it.each([
    [/^Purpose/, "purpose"],
    [/^Governing Law/, "governingLaw"],
    [/^Jurisdiction/, "chosenCourts"],
    [/^MNDA Modifications/, "modifications"],
  ] as const)("updates %s as the user types", async (label, key) => {
    const { user, latest } = setup();
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, "Some value");
    expect(field).toHaveValue("Some value");
    expect(latest().values[key]).toBe("Some value");
  });

  it("only changes the edited field", async () => {
    const { user, latest } = setup();
    await user.type(screen.getByLabelText(/^Governing Law/), "Delaware");
    expect(latest()).toEqual(initialData({ governingLaw: "Delaware" }));
  });

  it("updates the effective date", () => {
    const { latest } = setup();
    fireEvent.change(screen.getByLabelText(/^Effective Date/), { target: { value: "2027-01-31" } });
    expect(latest().values.effectiveDate).toBe("2027-01-31");
  });

  it("passes an empty effective date up when the date is cleared", () => {
    const { latest } = setup();
    fireEvent.change(screen.getByLabelText(/^Effective Date/), { target: { value: "" } });
    expect(latest().values.effectiveDate).toBe("");
  });

  it.each([
    [/^Company/, "company"],
    [/^Signatory name/, "name"],
    [/^Title/, "title"],
    [/^Notice address/, "noticeAddress"],
  ] as const)("updates each party's %s independently", async (label, field) => {
    const { user, latest } = setup();
    await user.type(within(party(1)).getByLabelText(label), "One");
    await user.type(within(party(2)).getByLabelText(label), "Two");
    expect(latest().parties[0][field]).toBe("One");
    expect(latest().parties[1][field]).toBe("Two");
  });

  describe("MNDA term", () => {
    it("switches to continuing until terminated and disables the years input", async () => {
      const { user, latest } = setup();
      await user.click(screen.getByRole("radio", { name: "Continues until terminated" }));
      expect(latest().values.mndaTermType).toBe("until-terminated");
      expect(yearsInputs()[0]).toBeDisabled();
      expect(yearsInputs()[1]).toBeEnabled();
    });

    it("switches back to expiring and re-enables the years input", async () => {
      const { user, latest } = setup({ mndaTermType: "until-terminated" });
      expect(yearsInputs()[0]).toBeDisabled();
      await user.click(screen.getByRole("radio", { name: /^Expires/ }));
      expect(latest().values.mndaTermType).toBe("expires");
      expect(yearsInputs()[0]).toBeEnabled();
    });

    it("updates the number of years", async () => {
      const { user, latest } = setup();
      await user.clear(yearsInputs()[0]);
      await user.type(yearsInputs()[0], "3");
      expect(latest().values.mndaTermYears).toBe(3);
      expect(latest().values.confidentialityYears).toBe(1);
    });
  });

  describe("term of confidentiality", () => {
    it("switches to perpetual and disables the years input", async () => {
      const { user, latest } = setup();
      await user.click(screen.getByRole("radio", { name: "In perpetuity" }));
      expect(latest().values.confidentialityType).toBe("perpetual");
      expect(yearsInputs()[1]).toBeDisabled();
      expect(yearsInputs()[0]).toBeEnabled();
    });

    it("updates the number of years", async () => {
      const { user, latest } = setup();
      await user.clear(yearsInputs()[1]);
      await user.type(yearsInputs()[1], "12");
      expect(latest().values.confidentialityYears).toBe(12);
      expect(latest().values.mndaTermYears).toBe(1);
    });
  });

  describe("years input", () => {
    it("shows a new value set from outside the form, e.g. by the AI chat", () => {
      const data = initialData();
      const { rerender } = render(<DocumentForm spec={NDA} data={data} onChange={() => {}} />);
      rerender(<DocumentForm spec={NDA} data={initialData({ mndaTermYears: 3, confidentialityYears: 7 })} onChange={() => {}} />);
      expect(screen.getByLabelText("MNDA term in years")).toHaveValue(3);
      expect(screen.getByLabelText("Term of confidentiality in years")).toHaveValue(7);
    });

    it("can be cleared and retyped without the model ever seeing an invalid value", async () => {
      const { user, onChange } = setup();
      const input = yearsInputs()[0];
      await user.clear(input);
      expect(input).toHaveValue(null);
      await user.type(input, "5");
      expect(input).toHaveValue(5);
      expect(onChange.mock.calls.map(([d]) => d.values.mndaTermYears)).toEqual([5]);
    });

    it.each(["0", "-1", "100", "2.5", "", "abc"])("ignores %j", (raw) => {
      const { onChange } = setup({ mndaTermYears: 4 });
      fireEvent.change(yearsInputs()[0], { target: { value: raw } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it.each(["1", "99"])("accepts the boundary value %s", (raw) => {
      const { latest } = setup({ mndaTermYears: 4 });
      fireEvent.change(yearsInputs()[0], { target: { value: raw } });
      expect(latest().values.mndaTermYears).toBe(Number(raw));
    });

    it("restores the last valid value on blur", async () => {
      const { user, latest } = setup();
      const input = yearsInputs()[0];
      await user.clear(input);
      await user.type(input, "7");
      fireEvent.change(input, { target: { value: "0" } });
      expect(input).toHaveValue(0);
      fireEvent.blur(input);
      expect(input).toHaveValue(7);
      expect(latest().values.mndaTermYears).toBe(7);
    });

    it("restores the value on blur after being left empty", async () => {
      const { user, onChange } = setup({ confidentialityYears: 3 });
      const input = yearsInputs()[1];
      await user.clear(input);
      await user.tab();
      expect(input).toHaveValue(3);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("limits input to 1–99 for the browser's spinner and validation", () => {
      setup();
      for (const input of yearsInputs()) {
        expect(input).toHaveAttribute("min", "1");
        expect(input).toHaveAttribute("max", "99");
      }
    });
  });

  describe("for another document", () => {
    const pilot = spec("pilot-agreement");

    it("has a group per spec section and one per party, named by role", () => {
      setup({}, [], pilot);
      expect(screen.getByRole("group", { name: "Order Form" })).toBeInTheDocument();
      for (const role of ["Provider", "Customer"]) {
        expect(within(screen.getByRole("group", { name: role })).getByLabelText(/^Company/)).toBeInTheDocument();
      }
    });

    it("marks optional fields and uses text areas for long text", () => {
      setup({}, [], pilot);
      expect(screen.getByLabelText(/^Fees/)).toHaveAccessibleName("FeesOptional");
      expect(screen.getByLabelText("Pilot Period")).toBeInTheDocument();
      expect(screen.getByLabelText("Product").tagName).toBe("TEXTAREA");
      expect(screen.getByLabelText("Effective Date")).toHaveAttribute("type", "date");
    });

    it("updates a value by its key", async () => {
      const { user, latest } = setup({}, [], pilot);
      await user.type(screen.getByLabelText("Pilot Period"), "90 days");
      expect(latest().values.pilotPeriod).toBe("90 days");
    });
  });

  it("does not submit or reload the page when Enter is pressed", async () => {
    const { user } = setup();
    const form = screen.getByLabelText(/^Governing Law/).closest("form")!;
    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.submit(form)).toBe(false);
    await user.type(screen.getByLabelText(/^Governing Law/), "Delaware{Enter}");
    expect(screen.getByLabelText(/^Governing Law/)).toHaveValue("Delaware");
  });
});
