"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type PublicShare, createShare, getShare, revokeShare } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";
import { storeErrorMessage } from "./store-ui";

/** Crear, copiar y desactivar el link público para chatear con un notHuman sin cuenta. */
export function ShareLink({ id }: { id: string }) {
  const { t: dict } = useI18n();
  const t = dict.share;
  const [share, setShare] = useState<PublicShare | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getShare(id)
      .then((s) => alive && setShare(s))
      .catch(() => alive && setShare(null));
    return () => {
      alive = false;
    };
  }, [id]);

  const url = share ? `${location.origin}/c/${share.token}` : "";

  async function run(fn: () => Promise<PublicShare | null | void>) {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      setShare(s ?? null);
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
    setBusy(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso para el portapapeles: el link queda seleccionable en el campo.
    }
  }

  if (share === undefined) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-[28px] border p-5 transition-colors ${
        share ? "border-acid/30 bg-acid/[0.05]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.title}</p>
          <p className="mt-1 max-w-xl text-sm text-white/55">{t.body}</p>
        </div>
        {!share && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={busy}
            onClick={() => void run(() => createShare(id))}
            className="rounded-full bg-acid px-5 py-2 text-sm font-medium text-ink transition hover:scale-[1.03] disabled:opacity-50"
          >
            {t.create}
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {share && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 basis-64 rounded-full border border-white/15 bg-ink/50 px-4 py-2 font-mono text-xs text-acid outline-none"
              />
              <button
                onClick={() => void copy()}
                className="rounded-full bg-acid px-4 py-2 text-sm font-medium text-ink transition hover:scale-[1.03]"
              >
                {copied ? t.copied : t.copy}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
              >
                {t.open}
              </a>
              <button
                disabled={busy}
                onClick={() => confirm(t.confirmRevoke) && void run(() => revokeShare(id))}
                className="rounded-full border border-rose/30 px-4 py-2 text-sm text-rose transition hover:bg-rose/10 disabled:opacity-50"
              >
                {t.revoke}
              </button>
            </div>
            <p className="mt-2 px-1 font-mono text-[11px] text-white/35">{t.usage(share.replies, share.maxReplies)}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </motion.div>
  );
}

/** Botón compacto (test drive): crea el link si no existe, lo copia y muestra un mini panel. */
export function ShareButton({ id }: { id: string }) {
  const { t: dict } = useI18n();
  const t = dict.share;
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<PublicShare | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const url = share ? `${location.origin}/c/${share.token}` : "";

  // Cerrar al tocar afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso para el portapapeles: el link queda seleccionable en el campo.
    }
  }

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (share) return;
    setBusy(true);
    setError(null);
    try {
      const s = (await getShare(id)) ?? (await createShare(id));
      setShare(s);
      void copy(`${location.origin}/c/${s.token}`);
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
    setBusy(false);
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => void toggle()}
        className="rounded-full border border-acid/40 px-3 py-1.5 font-mono text-[11px] text-acid transition hover:bg-acid hover:text-ink"
      >
        {t.button}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="absolute right-0 top-full z-30 mt-2 w-[min(88vw,380px)] rounded-3xl border border-acid/30 bg-ink/95 p-4 shadow-2xl backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{t.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">{t.body}</p>
            {busy && <p className="mt-3 font-mono text-xs text-white/40">…</p>}
            {error && <p className="mt-3 text-sm text-rose">{error}</p>}
            {share && (
              <>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  className="mt-3 w-full rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 font-mono text-xs text-acid outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void copy(url)}
                    className="rounded-full bg-acid px-4 py-1.5 text-sm font-medium text-ink transition hover:scale-[1.03]"
                  >
                    {copied ? t.copied : t.copy}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/15 px-4 py-1.5 text-sm transition hover:border-acid hover:text-acid"
                  >
                    {t.open}
                  </a>
                  <Link href={`/app/explore?nh=${id}&tab=profile`} className="ml-auto font-mono text-[11px] text-white/40 transition hover:text-acid">
                    {t.manage}
                  </Link>
                </div>
                <p className="mt-2 px-1 font-mono text-[10px] text-white/30">{t.usage(share.replies, share.maxReplies)}</p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
