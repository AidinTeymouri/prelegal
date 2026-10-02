"use client";

import { useState, type ReactNode } from "react";
import type { NdaFormData, Party } from "@/lib/nda";

type Props = {
  data: NdaFormData;
  onChange: (data: NdaFormData) => void;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      {hint && <span className="ml-2 text-xs text-zinc-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-zinc-200 pt-5">
      <legend className="pr-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{legend}</legend>
      {children}
    </fieldset>
  );
}

// Keeps the raw text while editing so the field can be cleared and retyped;
// only whole numbers from 1 to 99 are passed up, and blur restores the last valid value.
function YearsInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      type="number"
      min={1}
      max={99}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= 1 && n <= 99) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      className="mx-1 w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
      aria-label={label}
    />
  );
}

export function NdaForm({ data, onChange }: Props) {
  const set = <K extends keyof NdaFormData>(key: K, value: NdaFormData[K]) => onChange({ ...data, [key]: value });
  const setParty = (key: "party1" | "party2", field: keyof Party, value: string) =>
    onChange({ ...data, [key]: { ...data[key], [field]: value } });

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <Fieldset legend="Agreement terms">
        <Field label="Purpose" hint="How Confidential Information may be used">
          <textarea rows={3} className={inputClass} value={data.purpose} onChange={(e) => set("purpose", e.target.value)} />
        </Field>

        <Field label="Effective date">
          <input type="date" className={inputClass} value={data.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
        </Field>

        <fieldset>
          <legend>
            <span className="text-sm font-medium text-zinc-800">MNDA term</span>
            <span className="ml-2 text-xs text-zinc-500">The length of this MNDA</span>
          </legend>
          <div className="mt-2 space-y-2 text-sm text-zinc-700">
            <label className="flex items-center">
              <input
                type="radio"
                name="mndaTerm"
                className="mr-2"
                checked={data.mndaTermType === "expires"}
                onChange={() => set("mndaTermType", "expires")}
              />
              Expires
              <YearsInput
                label="MNDA term in years"
                value={data.mndaTermYears}
                disabled={data.mndaTermType !== "expires"}
                onChange={(n) => set("mndaTermYears", n)}
              />
              year(s) from the effective date
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="mndaTerm"
                className="mr-2"
                checked={data.mndaTermType === "until-terminated"}
                onChange={() => set("mndaTermType", "until-terminated")}
              />
              Continues until terminated
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <span className="text-sm font-medium text-zinc-800">Term of confidentiality</span>
            <span className="ml-2 text-xs text-zinc-500">How long Confidential Information is protected</span>
          </legend>
          <div className="mt-2 space-y-2 text-sm text-zinc-700">
            <label className="flex items-center">
              <input
                type="radio"
                name="confidentiality"
                className="mr-2"
                checked={data.confidentialityType === "years"}
                onChange={() => set("confidentialityType", "years")}
              />
              <YearsInput
                label="Term of confidentiality in years"
                value={data.confidentialityYears}
                disabled={data.confidentialityType !== "years"}
                onChange={(n) => set("confidentialityYears", n)}
              />
              year(s) from the effective date
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="confidentiality"
                className="mr-2"
                checked={data.confidentialityType === "perpetual"}
                onChange={() => set("confidentialityType", "perpetual")}
              />
              In perpetuity
            </label>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Governing law" hint="State">
            <input className={inputClass} placeholder="Delaware" value={data.governingLaw} onChange={(e) => set("governingLaw", e.target.value)} />
          </Field>
          <Field label="Jurisdiction" hint="City/county and state">
            <input
              className={inputClass}
              placeholder="New Castle, DE"
              value={data.jurisdiction}
              onChange={(e) => set("jurisdiction", e.target.value)}
            />
          </Field>
        </div>

        <Field label="MNDA modifications" hint="Optional">
          <textarea rows={2} className={inputClass} value={data.modifications} onChange={(e) => set("modifications", e.target.value)} />
        </Field>
      </Fieldset>

      {(["party1", "party2"] as const).map((key, i) => (
        <Fieldset key={key} legend={`Party ${i + 1}`}>
          <Field label="Company">
            <input className={inputClass} value={data[key].company} onChange={(e) => setParty(key, "company", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Signatory name">
              <input className={inputClass} value={data[key].name} onChange={(e) => setParty(key, "name", e.target.value)} />
            </Field>
            <Field label="Title">
              <input className={inputClass} value={data[key].title} onChange={(e) => setParty(key, "title", e.target.value)} />
            </Field>
          </div>
          <Field label="Notice address" hint="Email or postal address">
            <input
              className={inputClass}
              value={data[key].noticeAddress}
              onChange={(e) => setParty(key, "noticeAddress", e.target.value)}
            />
          </Field>
        </Fieldset>
      ))}
    </form>
  );
}
