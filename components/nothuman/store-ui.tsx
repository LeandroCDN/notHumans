"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { StoreError, importJson, uploadLeftovers, useLocalLeftovers } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";

// Piezas de UI alrededor del guardado: errores de la base, lo que quedó en el navegador e importar JSON.

export function StoreErrorNotice({ error, reload }: { error: StoreError; reload: () => void }) {
  const t = useI18n().t.store;
  const message = error.code === "generic" ? t.errors.generic(error.message) : t.errors[error.code];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose"
    >
      <span className="flex-1">{message}</span>
      <button onClick={reload} className="rounded-full border border-rose/40 px-3 py-1 text-xs">
        {t.retry}
      </button>
    </motion.div>
  );
}

/** Aviso con botón para subir a la base los notHumans que quedaron solo en este navegador. */
export function LeftoversBanner() {
  const t = useI18n().t.store;
  const leftovers = useLocalLeftovers();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);

  async function upload() {
    setBusy(true);
    const r = await uploadLeftovers();
    setFailed(r.failed);
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {leftovers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border border-acid/30 bg-acid/[0.06] px-5 py-4">
            <span className="text-2xl">☁︎</span>
            <div className="flex-1">
              <p>{t.leftovers(leftovers.length)}</p>
              <p className="font-mono text-[11px] text-white/45">{leftovers.map((x) => x.name).join(" · ")}</p>
              {failed > 0 && <p className="mt-1 text-sm text-rose">{t.uploadFailed(failed)}</p>}
            </div>
            <button
              onClick={upload}
              disabled={busy}
              className="rounded-full bg-acid px-5 py-2 text-sm font-medium text-ink transition hover:scale-[1.03] disabled:opacity-50"
            >
              {busy ? t.uploading : t.upload}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Sube un JSON descargado con "Download JSON". */
export function ImportJsonButton() {
  const t = useI18n().t.store;
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const r = await importJson(file);
      setNote({ ok: true, text: r.created ? t.imported(r.name) : t.alreadyThere(r.name) });
    } catch (err) {
      const e = err instanceof StoreError ? err : new StoreError("generic", String(err));
      const text =
        e.message === "invalid_json"
          ? t.invalidJson
          : e.code === "generic"
            ? t.errors.generic(e.message)
            : t.errors[e.code];
      setNote({ ok: false, text });
    }
    if (input.current) input.current.value = "";
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        onClick={() => input.current?.click()}
        className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
      >
        {t.importJson}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {note && <span className={`font-mono text-xs ${note.ok ? "text-acid" : "text-rose"}`}>{note.text}</span>}
    </span>
  );
}
