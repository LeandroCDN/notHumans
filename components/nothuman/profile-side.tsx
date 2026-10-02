"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NotHuman } from "@/lib/nothuman/schema";
import { deleteNotHuman, downloadJson } from "@/lib/nothuman/store";
import { useI18n } from "../i18n";
import { ProfileView } from "./profile-view";
import { ShareLink } from "./share-link";
import { storeErrorMessage } from "./store-ui";
import { VersionHistory } from "./version-history";

/** La pestaña Perfil del panel: quién es, link público, versiones y acciones. El perfil entero abre en una hoja. */
export function ProfileSide({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const t = dict.hub;
  const p = nh.profile;
  const router = useRouter();
  const [full, setFull] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(dict.profile.confirmDelete)) return;
    try {
      await deleteNotHuman(nh.id);
      router.replace("/app/explore", { scroll: false });
    } catch (err) {
      setError(storeErrorMessage(dict.store, err));
    }
  }

  return (
    <>
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-acid">
          {p.language} · v{nh.version}
        </p>
        <p className="mt-3 font-serif text-[22px] leading-snug text-white/85">“{p.summary}”</p>
        {p.tone.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {p.tone.map((x) => (
              <span key={x} className="rounded-full border border-acid/30 px-3 py-1 text-sm text-acid">
                {x}
              </span>
            ))}
          </div>
        )}
        {p.emojis.favorites.length > 0 && <p className="mt-4 text-3xl">{p.emojis.favorites.join(" ")}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setFull(true)}
            className="rounded-full bg-bone px-4 py-2 text-sm font-medium text-ink transition hover:scale-[1.03]"
          >
            {t.fullProfile}
          </button>
          <button
            onClick={() => downloadJson(nh)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
          >
            {dict.generate.download}
          </button>
        </div>
      </div>

      <ShareLink id={nh.id} />
      <VersionHistory nh={nh} />

      <div className="flex flex-wrap items-center justify-between gap-2 px-2">
        <span className="font-mono text-[10px] text-white/30">{dict.explore.localNote}</span>
        <button onClick={() => void remove()} className="font-mono text-[11px] text-rose/70 transition hover:text-rose">
          {dict.profile.delete}
        </button>
      </div>
      {error && <p className="px-2 text-sm text-rose">{error}</p>}

      <ProfileSheet nh={nh} open={full} onClose={() => setFull(false)} />
    </>
  );
}

/** El perfil completo (rasgos y todos los ejemplos) en una hoja encima de todo. */
function ProfileSheet({ nh, open, onClose }: { nh: NotHuman; open: boolean; onClose: () => void }) {
  const t = useI18n().t.hub;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Que no se mueva la página de atrás mientras está abierta.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-y-auto bg-ink/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={nh.name}
            className="relative mx-auto my-6 max-w-6xl rounded-[36px] border border-white/10 bg-ink px-5 py-8 sm:my-10 sm:px-10"
          >
            <button
              onClick={onClose}
              aria-label={t.close}
              className="absolute right-5 top-5 flex size-11 items-center justify-center rounded-full border border-white/15 text-lg transition hover:border-acid hover:text-acid"
            >
              ✕
            </button>
            <ProfileView nh={nh} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
