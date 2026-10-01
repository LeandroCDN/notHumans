"use client";

import { motion } from "motion/react";

export type Business = {
  name: string;
  whatTheySell: string;
  where: string;
  audience: string;
  roles: string[];
  notes: string;
};

export const EMPTY_BUSINESS: Business = { name: "", whatTheySell: "", where: "", audience: "", roles: [], notes: "" };

const AUDIENCES = ["Consumidor final", "Mayoristas", "Empresas", "Un poco de todo"];
const ROLES = ["Responde consultas", "Vende", "Toma pedidos", "Postventa y reclamos"];

export function BusinessForm({ value, onChange }: { value: Business; onChange: (b: Business) => void }) {
  const set = <K extends keyof Business>(k: K, v: Business[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Text label="Nombre del notHuman" placeholder="Martina de la tienda" value={value.name} onChange={(v) => set("name", v)} />
      <Text
        label="¿Qué vende?"
        placeholder="Ropa de mujer, talles S a XL"
        value={value.whatTheySell}
        onChange={(v) => set("whatTheySell", v)}
      />
      <Text
        label="¿Dónde vende?"
        placeholder="CABA, con envíos a todo el país"
        value={value.where}
        onChange={(v) => set("where", v)}
      />
      <Chips
        label="¿A quién le vende?"
        options={AUDIENCES}
        selected={value.audience ? [value.audience] : []}
        onToggle={(o) => set("audience", value.audience === o ? "" : o)}
      />
      <div className="sm:col-span-2">
        <Chips
          label="¿Qué hace en el chat?"
          options={ROLES}
          selected={value.roles}
          onToggle={(o) => set("roles", value.roles.includes(o) ? value.roles.filter((r) => r !== o) : [...value.roles, o])}
        />
      </div>
      <label className="group block sm:col-span-2">
        <FieldLabel>Algo más que debamos saber (opcional)</FieldLabel>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Nunca da descuentos por WhatsApp, siempre tutea, odia los audios…"
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

function Chips(props: { label: string; options: string[]; selected: string[]; onToggle: (o: string) => void }) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {props.options.map((o) => {
          const on = props.selected.includes(o);
          return (
            <motion.button
              key={o}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => props.onToggle(o)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                on ? "border-acid bg-acid text-ink" : "border-white/15 text-white/60 hover:border-white/40 hover:text-bone"
              }`}
            >
              {o}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
