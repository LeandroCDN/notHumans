"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { markArrivalFromLogin } from "./curtain";
import { useI18n } from "./i18n";
import { ScrambleText } from "./scramble-text";

type Origin = { x: number; y: number };
type LoginContextValue = { request: (e?: { clientX: number; clientY: number }) => void };

const LoginContext = createContext<LoginContextValue | null>(null);

export function useLogin() {
  const ctx = useContext(LoginContext);
  if (!ctx) throw new Error("useLogin fuera de <LoginProvider>");
  return ctx;
}

/**
 * Login por todos lados: cualquier botón llama a `request()` y el modal
 * nace desde el punto donde hiciste click. Si ya hay sesión, va directo a /app.
 */
export function LoginProvider({ loggedIn, children }: { loggedIn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [origin, setOrigin] = useState<Origin | null>(null);

  const request = useCallback<LoginContextValue["request"]>(
    (e) => {
      if (loggedIn) {
        router.push("/app");
        return;
      }
      router.prefetch("/app");
      setOrigin(
        e && (e.clientX || e.clientY)
          ? { x: e.clientX, y: e.clientY }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      );
    },
    [loggedIn, router],
  );

  // Atajo de teclado: "L" abre el login desde cualquier parte de la home.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "l") request();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  return (
    <LoginContext.Provider value={{ request }}>
      {children}
      <AnimatePresence>{origin && <LoginModal origin={origin} onClose={() => setOrigin(null)} />}</AnimatePresence>
    </LoginContext.Provider>
  );
}

type Phase = "idle" | "loading" | "error" | "granted";

function LoginModal({ origin, onClose }: { origin: Origin; onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorIdx, setErrorIdx] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [wipe, setWipe] = useState<Origin | null>(null);
  const [scope, animate] = useAnimate();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [offset] = useState(() => ({
    x: origin.x - window.innerWidth / 2,
    y: origin.y - window.innerHeight / 2,
  }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase !== "granted" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, phase]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase === "loading" || phase === "granted") return;
    const form = new FormData(e.currentTarget);
    setPhase("loading");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: form.get("user"), password: form.get("password") }),
    }).catch(() => null);

    if (!res?.ok) {
      setPhase("error");
      setErrorIdx((i) => (i + 1) % t.login.errors.length);
      // Credenciales malas → chiste. Servidor mal configurado → decirlo claro.
      const data = res && res.status !== 401 ? ((await res.json().catch(() => null)) as { missing?: string[] } | null) : null;
      setConfigError(
        !res
          ? t.login.noConnection
          : res.status === 401
            ? null
            : data?.missing?.length
              ? t.login.missingConfig(data.missing)
              : t.login.serverError(res.status),
      );
      animate(scope.current, { x: [0, -14, 12, -9, 7, -4, 0] }, { duration: 0.45 });
      return;
    }

    setPhase("granted");
    const r = submitRef.current?.getBoundingClientRect();
    setTimeout(
      () => setWipe(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: origin.x, y: origin.y }),
      650,
    );
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <motion.div
        className="absolute inset-0 bg-ink/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => phase !== "granted" && onClose()}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.15, x: offset.x, y: offset.y, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.6, y: 40, rotate: 4, transition: { duration: 0.2 } }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="relative w-full max-w-md"
      >
        <div
          ref={scope}
          className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#111113]/90 p-8 shadow-[0_40px_120px_-20px_rgba(198,255,61,0.25)]"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-acid/20 blur-3xl" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 font-mono text-xs text-white/40 transition hover:text-white"
            aria-label={t.login.close}
          >
            esc ✕
          </button>

          <p className="font-mono text-xs uppercase tracking-[0.2em] text-acid">{t.login.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl leading-none">
            {phase === "granted" ? (
              <ScrambleText text={t.login.granted} duration={600} />
            ) : (
              <>
                {t.login.titleA} <em>{t.login.titleB}</em>
              </>
            )}
          </h2>
          <p className="mt-3 text-sm text-white/50">{t.login.subtitle}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label={t.login.user} name="user" autoComplete="username" autoFocus />
            <Field label={t.login.password} name="password" type="password" autoComplete="current-password" />

            <div className="h-5">
              <AnimatePresence mode="wait">
                {phase === "error" && (
                  <motion.p
                    key={configError ?? errorIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="font-mono text-xs text-rose"
                  >
                    {configError ?? t.login.errors[errorIdx]}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              ref={submitRef}
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-acid font-medium text-ink"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={phase === "loading" ? "loading" : phase === "granted" ? "granted" : "idle"}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-2"
                >
                  {phase === "loading" ? (
                    <Dots />
                  ) : phase === "granted" ? (
                    t.login.success
                  ) : (
                    <>
                      {t.login.submit} <span className="transition-transform group-hover:translate-x-1">→</span>
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </form>
        </div>
      </motion.div>

      {wipe && (
        <motion.div
          className="fixed inset-0 z-[70] bg-acid"
          initial={{ clipPath: `circle(0px at ${wipe.x}px ${wipe.y}px)` }}
          animate={{ clipPath: `circle(150vmax at ${wipe.x}px ${wipe.y}px)` }}
          transition={{ duration: 0.75, ease: [0.83, 0, 0.17, 1] }}
          onAnimationComplete={() => {
            markArrivalFromLogin();
            router.push("/app");
          }}
        />
      )}
    </motion.div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="group block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-white/40 transition group-focus-within:text-acid">
        {label}
      </span>
      <input
        {...props}
        required
        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-base text-bone outline-none transition placeholder:text-white/20 focus:border-acid/60 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgba(198,255,61,0.12)]"
      />
    </label>
  );
}

export function Dots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-current"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}
