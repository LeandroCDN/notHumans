/** Foto de Google si hay; si no, la inicial sobre un gradiente que sale del nombre. */
const HUES = ["from-acid to-emerald-400", "from-violet to-rose", "from-rose to-amber-300", "from-sky-400 to-violet"];

export function Avatar({ name, url, size = "size-7" }: { name: string; url: string | null; size?: string }) {
  if (url) {
    return <img src={url} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  const hue = HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      aria-hidden
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${hue} font-mono text-[11px] font-semibold uppercase text-ink`}
    >
      {[...name.trim()][0] ?? "?"}
    </span>
  );
}

const PLAN_STYLE: Record<string, string> = {
  free: "border-white/20 text-white/60",
  pro: "border-acid/50 text-acid",
  business: "border-violet/60 text-violet-200",
  admin: "border-rose/60 text-rose",
};

export function PlanBadge({ plan, label }: { plan: string; label: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${PLAN_STYLE[plan] ?? PLAN_STYLE.free}`}>
      {label}
    </span>
  );
}
