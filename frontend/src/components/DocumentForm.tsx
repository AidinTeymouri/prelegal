"use client";

import { useState, type ReactNode } from "react";
import { isEnabled, type DocumentData, type DocumentSpec, type FieldSpec, type Party } from "@/lib/documents";

type Props = {
  spec: DocumentSpec;
  data: DocumentData;
  onChange: (data: DocumentData) => void;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    // A column with the input pushed to the bottom, so inputs side by side in a grid
    // row line up even when one label wraps onto a second line.
    <label className="flex flex-col">
      <span>
        <span className="text-sm font-medium text-zinc-800">{label}</span>
        {hint && <span className="ml-2 text-xs text-zinc-500">{hint}</span>}
      </span>
      <div className="mt-auto pt-1">{children}</div>
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

// Keeps the raw text while editing so the field can be cleared and retyped; only
// whole numbers in range are passed up, and blur restores the last valid value.
function NumberInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  // Show the new value when it changes from outside, e.g. when the AI chat fills it in.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setDraft(String(value));
  }
  const { min = 1, max = 99 } = field;
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      className="mx-1 w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
      aria-label={field.label}
    />
  );
}

// A number field that only applies to one option of a choice is shown inside that option,
// e.g. "Expires [1] year(s)". The backend checks the spec: enabledWhen is only on int fields
// and refers to a choice in the same section.
const isInline = (field: FieldSpec) => !!field.enabledWhen;

function FieldInput({
  field,
  siblings,
  data,
  set,
}: {
  field: FieldSpec;
  siblings: FieldSpec[];
  data: DocumentData;
  set: (key: string, value: string | number) => void;
}) {
  const value = data.values[field.key];
  const hint = field.required ? undefined : "Optional";
  const numberInput = (f: FieldSpec) => (
    <NumberInput field={f} value={Number(data.values[f.key])} disabled={!isEnabled(f, data)} onChange={(n) => set(f.key, n)} />
  );
  switch (field.type) {
    case "enum": {
      const dependents = siblings.filter((f) => isInline(f) && f.enabledWhen?.field === field.key);
      return (
        <fieldset>
          <legend className="text-sm font-medium text-zinc-800">{field.label}</legend>
          <div className="mt-2 space-y-2 text-sm text-zinc-700">
            {field.options?.map((option) => {
              const inline = dependents.find((f) => f.enabledWhen?.equals === option.value);
              return (
                <label key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    name={field.key}
                    className="mr-2"
                    checked={value === option.value}
                    onChange={() => set(field.key, option.value)}
                  />
                  {option.label}
                  {inline && (
                    <>
                      {numberInput(inline)}
                      {inline.unit}
                    </>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case "int":
      return (
        <div className="flex items-center text-sm text-zinc-700">
          <span className="mr-1 font-medium text-zinc-800">{field.label}</span>
          {numberInput(field)}
          {field.unit}
        </div>
      );
    case "longtext":
      return (
        <Field label={field.label} hint={hint}>
          <textarea rows={3} className={inputClass} value={String(value)} onChange={(e) => set(field.key, e.target.value)} />
        </Field>
      );
    default:
      return (
        <Field label={field.label} hint={hint}>
          <input
            type={field.type === "date" ? "date" : "text"}
            className={inputClass}
            value={String(value)}
            onChange={(e) => set(field.key, e.target.value)}
          />
        </Field>
      );
  }
}

export function DocumentForm({ spec, data, onChange }: Props) {
  const set = (key: string, value: string | number) => onChange({ ...data, values: { ...data.values, [key]: value } });
  const setParty = (i: number, field: keyof Party, value: string) =>
    onChange({ ...data, parties: data.parties.map((p, j) => (i === j ? { ...p, [field]: value } : p)) as DocumentData["parties"] });

  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      {spec.sections.map((section) => (
        <Fieldset key={section.title} legend={section.title}>
          {section.fields
            .filter((field) => !isInline(field))
            .map((field) => (
              <FieldInput key={field.key} field={field} siblings={section.fields} data={data} set={set} />
            ))}
        </Fieldset>
      ))}

      {spec.parties.map((role, i) => (
        <Fieldset key={role} legend={role}>
          <Field label="Company">
            <input className={inputClass} value={data.parties[i].company} onChange={(e) => setParty(i, "company", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Signatory name">
              <input className={inputClass} value={data.parties[i].name} onChange={(e) => setParty(i, "name", e.target.value)} />
            </Field>
            <Field label="Title">
              <input className={inputClass} value={data.parties[i].title} onChange={(e) => setParty(i, "title", e.target.value)} />
            </Field>
          </div>
          <Field label="Notice address" hint="Email or postal address">
            <input
              className={inputClass}
              value={data.parties[i].noticeAddress}
              onChange={(e) => setParty(i, "noticeAddress", e.target.value)}
            />
          </Field>
        </Fieldset>
      ))}
    </form>
  );
}
