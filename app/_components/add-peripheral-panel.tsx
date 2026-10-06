"use client";
// "Add peripheral": pick a kind, fill in its config, and ask the host to start it (host.spawn).
// The kinds come from components/peripherals/index.ts, and the fields from each configSchema.
import { useMemo, useState, type FormEvent } from "react";
import { PERIPHERALS } from "@/components/peripherals";
import type { Json } from "@/protocol/messages";
import { configFields, initialValues, type ConfigField } from "@/app/_lib/config-fields";
import { useActions, useBus } from "@/app/_lib/use-bus";
import { useToast } from "@/app/_components/toast";

const INPUT = "w-full rounded border border-zinc-200 px-1.5 py-1 text-xs";

export function AddPeripheralPanel() {
  const { system } = useBus();
  const actions = useActions();
  const toast = useToast();
  const [kind, setKind] = useState(PERIPHERALS[0]?.kind ?? "");
  const entry = PERIPHERALS.find((p) => p.kind === kind);
  const fields = useMemo(() => (entry ? configFields(entry.configSchema) : []), [entry]);
  const [values, setValues] = useState<Record<string, Json>>(() => initialValues(fields));
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const host = Object.values(system.components).find((c) => c.info.role === "host");

  function chooseKind(next: string): void {
    setKind(next);
    const nextEntry = PERIPHERALS.find((p) => p.kind === next);
    setValues(nextEntry ? initialValues(configFields(nextEntry.configSchema)) : {});
    setLabel("");
  }

  /** `button-1`, `button-2`, ...: the first id nobody is using. */
  function freeId(): string {
    for (let n = 1; ; n++) if (!system.components[`${kind}-${n}`]) return `${kind}-${n}`;
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!actions || !host || !entry) return;
    setBusy(true);
    try {
      await actions.addPeripheral(host.info.id, { kind, id: freeId(), label: label || entry.label, config: values });
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 p-3 text-xs">
      {!host && <p className="rounded bg-amber-50 p-2 text-amber-800">The peripheral host isn&apos;t connected. Start it with `npm run component -- host`.</p>}
      <label className="block">
        <span className="text-zinc-500">Kind</span>
        <select className={INPUT} value={kind} onChange={(e) => chooseKind(e.target.value)}>
          {PERIPHERALS.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label} ({p.direction})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-zinc-500">Label</span>
        <input className={INPUT} placeholder={entry?.label} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {fields.map((field) => (
        <Field key={field.name} field={field} value={values[field.name]} onChange={(value) => setValues({ ...values, [field.name]: value })} />
      ))}
      <button type="submit" disabled={!actions || !host || busy} className="w-full rounded-md bg-zinc-800 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-40">
        {busy ? "Adding…" : "Add peripheral"}
      </button>
    </form>
  );
}

function Field({ field, value, onChange }: { field: ConfigField; value: Json | undefined; onChange: (value: Json) => void }) {
  const title = <span className="text-zinc-500" title={field.description}>{field.name}</span>;
  switch (field.kind) {
    case "boolean":
      return (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {title}
        </label>
      );
    case "choice":
      return (
        <label className="block">
          {title}
          <select className={INPUT} value={String(value ?? "")} onChange={(e) => onChange(field.options.find((o) => String(o) === e.target.value) ?? e.target.value)}>
            {field.options.map((option) => (
              <option key={String(option)} value={String(option)}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    case "number":
      return (
        <label className="block">
          {title}
          <input
            type="number"
            className={INPUT}
            min={field.min}
            max={field.max}
            step={field.integer ? 1 : "any"}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </label>
      );
    case "text":
      return (
        <label className="block">
          {title}
          <input className={INPUT} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
}
