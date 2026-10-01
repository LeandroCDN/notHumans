"use client";

import { motion } from "motion/react";
import { useI18n } from "../i18n";

export type Audience = "consumers" | "wholesale" | "companies" | "mixed";
export type ChatRole = "questions" | "sells" | "orders" | "aftersales";

export type Business = {
  name: string;
  whatTheySell: string;
  where: string;
  audience: Audience | "";
  roles: ChatRole[];
  notes: string;
};

export const EMPTY_BUSINESS: Business = { name: "", whatTheySell: "", where: "", audience: "", roles: [], notes: "" };

export function BusinessForm({ value, onChange }: { value: Business; onChange: (b: Business) => void }) {
  const t = useI18n().t.create.business;
  const set = <K extends keyof Business>(k: K, v: Business[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Text label={t.name} placeholder={t.namePh} value={value.name} onChange={(v) => set("name", v)} />
      <Text label={t.sells} placeholder={t.sellsPh} value={value.whatTheySell} onChange={(v) => set("whatTheySell", v)} />
      <Text label={t.where} placeholder={t.wherePh} value={value.where} onChange={(v) => set("where", v)} />
      <Chips
        label={t.audience}
        options={t.audiences}
        selected={value.audience ? [value.audience] : []}
        onToggle={(o) => set("audience", value.audience === o ? "" : o)}
      />
      <div className="sm:col-span-2">
        <Chips
          label={t.roles}
          options={t.roleOptions}
          selected={value.roles}
          onToggle={(o) => set("roles", value.roles.includes(o) ? value.roles.filter((r) => r !== o) : [...value.roles, o])}
        />
      </div>
      <label className="group block sm:col-span-2">
        <FieldLabel>{t.notes}</FieldLabel>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder={t.notesPh}
          className={`${inputClass} h-auto resize-none py-3`}
        />
      </label>
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-base text-bone outline-none transition placeholder:text-white/20 focus:border-acid/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(198,255,61,0.12)]";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-white/40 transition group-focus-within:text-acid">
      {children}
    </span>
  );
}

function Text(props: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="group block">
      <FieldLabel>{props.label}</FieldLabel>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={inputClass}
      />
    </label>
  );
}

/** Opciones con clave estable (lo que se guarda) y etiqueta traducida (lo que se ve). */
function Chips<K extends string>(props: {
  label: string;
  options: Record<K, string>;
  selected: K[];
  onToggle: (o: K) => void;
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(props.options) as [K, string][]).map(([key, label]) => {
          const on = props.selected.includes(key);
          return (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => props.onToggle(key)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                on ? "border-acid bg-acid text-ink" : "border-white/15 text-white/60 hover:border-white/40 hover:text-bone"
              }`}
            >
              {label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
