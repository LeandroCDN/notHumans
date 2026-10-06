"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotHumans } from "@/lib/nothuman/store";
import { type ChannelsState, createChannel, removeChannel, simulate, updateChannel, useChannels } from "@/lib/wa/client";
import { CHANNEL_MODES, type Channel, type ChannelMode } from "@/lib/wa/types";
import { useI18n } from "../i18n";
import { Inbox } from "./inbox";

// Sección WhatsApp: conectar un número (Phone Number ID de Meta), elegir qué notHuman atiende y en qué modo,
// y la bandeja con las charlas. Sin Meta (desarrollo / LLM_MOCK=1) hay un simulador para hacer de cliente.

export function WhatsAppView({ channelId, conversationId }: { channelId?: string; conversationId?: string }) {
  const { t: dict } = useI18n();
  const t = dict.wa;
  const router = useRouter();
  const { state, reload } = useChannels();
  const [adding, setAdding] = useState(false);

  if (!state) return null;
  const channel = state.items.find((c) => c.id === channelId) ?? state.items[0] ?? null;
  const go = (q: { ch?: string; c?: string }) =>
    router.replace(`/app/whatsapp?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`, {
      scroll: false,
    });

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-16 pt-2 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
          <h1 className="mt-2 font-serif text-4xl leading-none sm:text-5xl">
            {t.title} <em className="text-white/55">{t.accent}</em>
          </h1>
        </div>
        {state.mock && (
          <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200">
            {t.mock}
          </span>
        )}
      </header>

      {!channel || adding ? (
        <ConnectCard
          state={state}
          onCancel={channel ? () => setAdding(false) : undefined}
          onDone={async (c) => {
            setAdding(false);
            await reload();
            go({ ch: c.id });
          }}
        />
      ) : (
        <>
          <ChannelBar
            channels={state.items}
            channel={channel}
            onPick={(id) => go({ ch: id })}
            onAdd={() => setAdding(true)}
            onChanged={reload}
            onRemoved={async () => {
              await reload();
              go({});
            }}
          />
          {(state.mock || state.missing.length > 0) && <SetupHints state={state} channel={channel} />}
          <Inbox key={channel.id} channel={channel} conversationId={conversationId} onOpen={(c) => go({ ch: channel.id, c })} />
        </>
      )}
    </main>
  );
}

/** Conectar un número: tres pasos y un formulario. */
function ConnectCard({
  state,
  onDone,
  onCancel,
}: {
  state: ChannelsState;
  onDone: (c: Channel) => void;
  onCancel?: () => void;
}) {
  const { t: dict } = useI18n();
  const t = dict.wa;
  const c = t.connect;
  const { list } = useNotHumans();
  const [phoneId, setPhoneId] = useState("");
  const [display, setDisplay] = useState("");
  const [who, setWho] = useState<string>("");
  const [mode, setMode] = useState<ChannelMode>("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nhId = who || list?.[0]?.id || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5,30}$/.test(phoneId.trim())) return setError(c.invalid);
    setBusy(true);
    setError(null);
    try {
      const channel = await createChannel({ phoneNumberId: phoneId.trim(), displayPhone: display.trim(), nothumanId: nhId || null, mode });
      onDone(channel);
    } catch (err) {
      const code = (err as Error).message;
      setError(code === "taken" ? c.taken : code.startsWith("limit") ? dict.store.errors.limit(code.slice(6)) : c.error(code));
    }
    setBusy(false);
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]"
    >
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-emerald-400/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 7, repeat: Infinity }}
        />
        <p className="relative text-white/60">{t.sub}</p>
        <ol className="relative mt-6 space-y-4">
          {c.steps.map((step, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex gap-3"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-acid/50 font-mono text-xs text-acid">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm text-white/75">{step}</span>
            </motion.li>
          ))}
        </ol>
        <PhoneArt />
      </div>

      <form onSubmit={submit} className="rounded-[32px] border border-white/10 bg-[#111113]/80 p-7">
        <h2 className="font-serif text-3xl">{c.title}</h2>
        <Field label={c.phoneId} hint={c.phoneIdHint}>
          <input
            value={phoneId}
            onChange={(e) => setPhoneId(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="1394755483713378"
            required
            className={input}
          />
        </Field>
        <Field label={c.display}>
          <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder={c.displayPlaceholder} className={input} />
        </Field>
        <Field label={c.who}>
          <select value={nhId} onChange={(e) => setWho(e.target.value)} className={`${input} cursor-pointer`}>
            {(list ?? []).map((n) => (
              <option key={n.id} value={n.id} className="bg-ink">
                {n.name}
              </option>
            ))}
            <option value="" className="bg-ink">
              {c.nobody}
            </option>
          </select>
        </Field>
        <Field label={c.mode}>
          <ModePicker value={mode} onChange={setMode} />
        </Field>
        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 text-sm text-rose">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {state.missing.length > 0 && <p className="mt-4 font-mono text-[11px] text-amber-200">{t.webhook.missing(state.missing)}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            className="rounded-full bg-acid px-6 py-3 font-medium text-ink transition hover:scale-[1.02] disabled:opacity-60"
          >
            {busy ? c.connecting : c.submit}
          </motion.button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-full px-5 py-3 text-sm text-white/55 hover:text-white">
              {t.chat.cancel}
            </button>
          )}
        </div>
      </form>
    </motion.section>
  );
}

const input =
  "h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-[15px] text-bone outline-none transition placeholder:text-white/20 focus:border-acid/60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mt-5 block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-white/35">{hint}</span>}
    </label>
  );
}

/** Los cuatro modos, con lo que hace cada uno abajo. */
function ModePicker({ value, onChange }: { value: ChannelMode; onChange: (m: ChannelMode) => void }) {
  const t = useI18n().t.wa;
  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.02] p-1" role="radiogroup">
        {CHANNEL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            onClick={() => onChange(m)}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
              value === m ? "text-ink" : "text-white/55 hover:text-white"
            }`}
          >
            {value === m && (
              <motion.span layoutId="wa-mode" className="absolute inset-0 rounded-xl bg-acid" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
            )}
            <span className="relative">{t.modes[m]}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="mt-2 text-xs text-white/45"
        >
          {t.modeHelp[value]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** El número conectado: quién atiende y en qué modo (se cambia acá mismo). */
function ChannelBar({
  channels,
  channel,
  onPick,
  onAdd,
  onChanged,
  onRemoved,
}: {
  channels: Channel[];
  channel: Channel;
  onPick: (id: string) => void;
  onAdd: () => void;
  onChanged: () => Promise<void>;
  onRemoved: () => Promise<void>;
}) {
  const t = useI18n().t.wa;
  const { list } = useNotHumans();
  const [saving, setSaving] = useState(false);

  async function patch(p: Parameters<typeof updateChannel>[1]) {
    setSaving(true);
    await updateChannel(channel.id, p).catch(() => {});
    await onChanged();
    setSaving(false);
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-5 lg:flex-row lg:items-center"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            aria-current={c.id === channel.id ? "true" : undefined}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs transition ${
              c.id === channel.id ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-white/50 hover:text-white"
            }`}
          >
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]" />
            {c.displayPhone || c.phoneNumberId}
          </button>
        ))}
        <button onClick={onAdd} className="rounded-full border border-dashed border-white/15 px-3 py-1.5 font-mono text-xs text-white/45 hover:text-acid">
          {t.channel.add}
        </button>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-3 lg:justify-end">
        <label className="flex items-center gap-2 text-sm text-white/50">
          {t.channel.answeredBy}
          <select
            value={channel.nothumanId ?? ""}
            disabled={saving}
            onChange={(e) => void patch({ nothumanId: e.target.value || null })}
            aria-label={t.connect.who}
            className="cursor-pointer rounded-full border border-acid/40 bg-transparent px-3 py-1.5 text-sm text-acid outline-none"
          >
            {(list ?? []).map((n) => (
              <option key={n.id} value={n.id} className="bg-ink text-bone">
                {n.name}
              </option>
            ))}
            <option value="" className="bg-ink text-bone">
              {t.connect.nobody}
            </option>
          </select>
        </label>
        <div className="w-full sm:w-auto sm:min-w-[420px]">
          <ModePicker value={channel.mode} onChange={(mode) => void patch({ mode })} />
        </div>
        <button
          onClick={async () => {
            if (!confirm(t.channel.confirmRemove)) return;
            await removeChannel(channel.id).catch(() => {});
            await onRemoved();
          }}
          className="font-mono text-[11px] text-white/35 transition hover:text-rose"
        >
          {t.channel.remove}
        </button>
      </div>
    </motion.section>
  );
}

/** Lo que falta para hablar con Meta (URL del webhook) o, sin Meta, el simulador de clientes. */
function SetupHints({ state, channel }: { state: ChannelsState; channel: Channel }) {
  const t = useI18n().t.wa;
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/wa/webhook`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.webhook.title}</p>
        <p className="mt-2 text-sm text-white/55">{t.webhook.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <input readOnly value={url} aria-label={t.webhook.url} className={`${input} h-10 font-mono text-xs`} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(url).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="shrink-0 rounded-full border border-white/15 px-4 py-2 text-sm hover:border-acid hover:text-acid"
          >
            {copied ? t.webhook.copied : t.webhook.copy}
          </button>
        </div>
        {state.missing.length > 0 && <p className="mt-3 font-mono text-[11px] text-amber-200">{t.webhook.missing(state.missing)}</p>}
      </div>
      {state.mock && <Simulator channel={channel} />}
    </div>
  );
}

function Simulator({ channel }: { channel: Channel }) {
  const t = useI18n().t.wa.sim;
  const [name, setName] = useState("Juan");
  const [phone, setPhone] = useState("5491122334455");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await simulate(channel.id, phone, name, text).catch(() => {});
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      }}
      className="rounded-[24px] border border-amber-300/25 bg-amber-300/[0.04] p-5"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200">{t.title}</p>
      <p className="mt-2 text-sm text-white/55">{t.body}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t.name} className={`${input} h-10`} />
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} aria-label={t.phone} className={`${input} h-10 font-mono text-xs`} />
      </div>
      <div className="mt-2 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.text} aria-label={t.text} className={`${input} h-10`} />
        <button className="shrink-0 rounded-full bg-amber-200 px-4 py-2 text-sm font-medium text-ink">{t.send}</button>
      </div>
      <AnimatePresence>
        {sent && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-xs text-amber-200">
            {t.sent}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

/** Un celular dibujado con burbujas que van y vienen: el número cobrando vida. */
function PhoneArt() {
  const lines = [
    { side: "left", w: "w-28", d: 0 },
    { side: "right", w: "w-36", d: 0.7 },
    { side: "right", w: "w-20", d: 1.1 },
    { side: "left", w: "w-24", d: 1.8 },
  ] as const;
  return (
    <div className="relative mx-auto mt-8 w-56 rotate-[-4deg] rounded-[36px] border border-white/15 bg-ink/80 p-4 shadow-[0_30px_80px_-20px_rgba(52,211,153,0.45)]">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-white/15" />
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <motion.span
            key={i}
            className={`h-6 rounded-2xl ${l.w} ${l.side === "left" ? "self-start rounded-bl-md bg-white/15" : "self-end rounded-br-md bg-emerald-400"}`}
            style={{ originX: l.side === "left" ? 0 : 1 }}
            animate={{ scale: [0.3, 1, 1, 0.3], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 5, times: [0, 0.1, 0.88, 1], repeat: Infinity, delay: l.d, repeatDelay: 0.5 }}
          />
        ))}
      </div>
    </div>
  );
}
