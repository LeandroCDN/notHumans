"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import type { NotHuman } from "@/lib/nothuman/schema";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StoreError, deleteNotHuman, downloadJson, useLocalLeftovers, useNotHumans } from "@/lib/nothuman/store";
import { ComingSoon } from "../coming-soon";
import { useI18n } from "../i18n";
import { ProfileView } from "./profile-view";
import { ImportJsonButton, LeftoversBanner, StoreErrorNotice } from "./store-ui";
import { VersionHistory } from "./version-history";

const HUES = ["from-acid to-emerald-400", "from-violet to-rose", "from-rose to-amber-300", "from-sky-400 to-violet"];

export function ExploreView() {
  const { t: dict } = useI18n();
  const t = dict.explore;
  const { list, error, reload } = useNotHumans();
  const leftovers = useLocalLeftovers();

  if (list === null) return null;
  if (list.length === 0 && !error && leftovers.length === 0) {
    return (
      <ComingSoon section="explore" cta={{ href: "/app/new", label: t.createCta }}>
        <ImportJsonButton />
      </ComingSoon>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-10">
      <Link href="/app" className="font-mono text-xs text-white/40 transition hover:text-acid">
        {dict.common.back}
      </Link>
      <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.eyebrow}</p>
      <h1 className="mt-4 font-serif text-[clamp(2.8rem,8vw,6rem)] leading-[0.9] tracking-tight">
        {t.listTitle} <em className="text-acid">{t.listAccent}</em>
      </h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-white/45">{t.localNote}</p>
        <ImportJsonButton />
      </div>
      {error && <StoreErrorNotice error={error} reload={reload} />}
      <LeftoversBanner />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {list.map((nh, i) => (
            <motion.div
              key={nh.id}
              layout
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={`/app/n/${nh.id}`}
                className="group flex h-full flex-col rounded-[28px] border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-1 hover:border-white/25"
              >
                <div className="flex items-start justify-between">
                  <div className={`animate-morph size-14 bg-gradient-to-br ${HUES[i % HUES.length]}`} />
                  <span className="text-2xl">{nh.profile.emojis.favorites.slice(0, 3).join(" ")}</span>
                </div>
                <h2 className="mt-6 font-serif text-4xl leading-none">{nh.name}</h2>
                <p className="mt-1 font-mono text-[11px] text-white/40">
                  {nh.profile.language} · {nh.examples.length} {dict.generate.examples}
                </p>
                <p className="mt-4 line-clamp-3 flex-1 text-white/60">{nh.profile.summary}</p>
                <span className="mt-6 font-mono text-xs text-acid opacity-60 transition group-hover:opacity-100">
                  {dict.generate.openProfile}
                </span>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}

export function NotHumanDetail({ id }: { id: string }) {
  const { t: dict } = useI18n();
  const { list, error, reload } = useNotHumans();
  if (list === null) return null;
  const nh = list.find((x) => x.id === id);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-10">
      <Link href="/app/explore" className="font-mono text-xs text-white/40 transition hover:text-acid">
        {dict.common.back}
      </Link>
      {error && !nh ? (
        <StoreErrorNotice error={error} reload={reload} />
      ) : !nh ? (
        <p className="mt-16 font-serif text-4xl">{dict.explore.notFound}</p>
      ) : (
        <Detail nh={nh} />
      )}
    </main>
  );
}

function Detail({ nh }: { nh: NotHuman }) {
  const { t: dict } = useI18n();
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<StoreError | null>(null);
  return (
    <div className="mt-10">
      <div className="mb-10 flex flex-wrap gap-3">
        <Link
          href={`/app/chat?nh=${nh.id}`}
          className="rounded-full bg-acid px-5 py-2 text-sm font-medium text-ink shadow-[0_0_40px_-10px_rgba(198,255,61,0.6)] transition hover:scale-[1.03]"
        >
          {dict.chat.open}
        </Link>
        <DownloadButton nh={nh} />
        <button
          onClick={() => {
            if (!confirm(dict.profile.confirmDelete)) return;
            deleteNotHuman(nh.id)
              .then(() => router.push("/app/explore"))
              .catch((e) => setDeleteError(e instanceof StoreError ? e : new StoreError("generic", String(e))));
          }}
          className="rounded-full border border-rose/30 px-4 py-2 text-sm text-rose transition hover:bg-rose/10"
        >
          {dict.profile.delete}
        </button>
      </div>
      {deleteError && <StoreErrorNotice error={deleteError} reload={() => setDeleteError(null)} />}
      <VersionHistory nh={nh} />
      <ProfileView nh={nh} />
    </div>
  );
}

function DownloadButton({ nh }: { nh: NotHuman }) {
  const t = useI18n().t.generate;
  return (
    <button
      onClick={() => downloadJson(nh)}
      className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-acid hover:text-acid"
    >
      {t.download}
    </button>
  );
}
