"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { markArrivalFromLogin } from "./curtain";
import { useI18n } from "./i18n";
import { ScrambleText } from "./scramble-text";

type Origin = { x: number; y: number };
/** Cómo se puede entrar (lo decide el server según la configuración). */
export type LoginMethods = { google: boolean; password: boolean };
type LoginContextValue = {
  request: (e?: { clientX: number; clientY: number }) => void;
};

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
export function LoginProvider({
  loggedIn,
  methods,
  initialError,
  children,
}: {
  loggedIn: boolean;
  methods: LoginMethods;
  /** Volvió de Google con un problema (?login=error|unavailable): el modal arranca abierto, con el aviso. */
  initialError?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [notice, setNotice] = useState(initialError);

  useEffect(() => {
    if (!initialError) return;
    setOrigin({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    // Que recargar no vuelva a mostrar el error.
    window.history.replaceState(null, "", window.location.pathname);
  }, [initialError]);

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
      <AnimatePresence>
        {origin && (
          <LoginModal
            origin={origin}
            methods={methods}
            notice={notice}
            onClose={() => {
              setOrigin(null);
              setNotice(undefined);
            }}
          />
        )}
      </AnimatePresence>
    </LoginContext.Provider>
  );
}

type Phase = "idle" | "loading" | "error" | "granted";

function LoginModal({
  origin,
  methods,
  notice,
  onClose,
}: {
  origin: Origin;
  methods: LoginMethods;
  notice?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorIdx, setErrorIdx] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [wipe, setWipe] = useState<Origin | null>(null);
  const [scope, animate] = useAnimate();
  const submitRef = useRef<HTMLButtonElement>(null);
  // Con Google disponible, la contraseña queda plegada: es para las cuentas fijas de antes.
  const [showPassword, setShowPassword] = useState(!methods.google);
  const [leaving, setLeaving] = useState(false);
  const noticeText = notice === "unavailable" ? t.login.unavailable : notice ? t.login.googleError : null;
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
      body: JSON.stringify({
        user: form.get("user"),
        password: form.get("password"),
      }),
    }).catch(() => null);

    if (!res?.ok) {
      setPhase("error");
      setErrorIdx((i) => (i + 1) % t.login.errors.length);
      // Credenciales malas → chiste. Servidor mal configurado → decirlo claro.
      const data =
        res && res.status !== 401
          ? ((await res.json().catch(() => null)) as {
              missing?: string[];
            } | null)
          : null;
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
        initial={{
          opacity: 0,
          scale: 0.15,
          x: offset.x,
          y: offset.y,
          rotate: -8,
        }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
        exit={{
          opacity: 0,
          scale: 0.6,
          y: 40,
          rotate: 4,
          transition: { duration: 0.2 },
        }}
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
          <p className="mt-3 text-sm text-white/50">{methods.google ? t.login.googleSub : t.login.subtitle}</p>

          {noticeText && phase !== "error" && <p className="mt-4 font-mono text-xs text-rose">{noticeText}</p>}

          {methods.google && (
            <motion.a
              href="/auth/google"
              onClick={() => setLeaving(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-bone font-medium text-ink shadow-[0_20px_60px_-20px_rgba(255,255,255,0.35)]"
            >
              {leaving ? <Dots /> : <GoogleMark />}
              {t.login.google}
            </motion.a>
          )}

          {methods.google && methods.password && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-expanded={showPassword}
              className="mt-6 flex w-full items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/35 transition hover:text-white/70"
            >
              <span className="h-px flex-1 bg-white/10" />
              {t.login.or}
              <motion.span animate={{ rotate: showPassword ? 180 : 0 }}>▾</motion.span>
              <span className="h-px flex-1 bg-white/10" />
            </button>
          )}

          <AnimatePresence initial={false}>
            {methods.password && showPassword && (
              <motion.form
                key="password"
                initial={methods.google ? { height: 0, opacity: 0 } : false}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                onSubmit={onSubmit}
                className={`space-y-4 overflow-hidden ${methods.google ? "mt-4 px-0.5 pt-1" : "mt-8"}`}
              >
                <Field label={t.login.user} name="user" autoComplete="username" autoFocus={!methods.google} />
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
              </motion.form>
            )}
          </AnimatePresence>
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

/** La "G" de Google, en sus colores. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
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
