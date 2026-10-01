"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";

type Props = { onFiles: (files: File[]) => void; compact?: boolean };

/** Zona para soltar los exports. Acepta .txt y .zip, varios a la vez. */
export function Dropzone({ onFiles, compact = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => /\.(txt|zip)$/i.test(f.name));
    if (files.length) onFiles(files);
  };

  return (
    <motion.button
      type="button"
      onClick={() => input.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
      animate={{ scale: over ? 1.015 : 1 }}
      whileHover={{ scale: 1.005 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`group relative block w-full overflow-hidden rounded-[32px] border-2 border-dashed text-left transition-colors ${
        over ? "border-acid bg-acid/[0.06]" : "border-white/15 bg-white/[0.02] hover:border-white/30"
      } ${compact ? "px-6 py-5" : "px-6 py-14 sm:px-12 sm:py-20"}`}
    >
      <input
        ref={input}
        type="file"
        accept=".txt,.zip"
        multiple
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(198,255,61,0.25),transparent_60%)]"
        animate={{ opacity: over ? 1 : 0 }}
      />

      {compact ? (
        <p className="relative flex items-center gap-3 text-white/60">
          <span className="flex size-9 items-center justify-center rounded-full border border-white/15 font-mono text-lg transition group-hover:border-acid group-hover:text-acid">
            +
          </span>
          {over ? "¡Soltalos!" : "Sumar más chats"}
        </p>
      ) : (
        <div className="relative flex flex-col items-center text-center">
          <Bubbles active={over} />
          <AnimatePresence mode="wait">
            <motion.p
              key={over ? "over" : "idle"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="mt-8 font-serif text-4xl sm:text-5xl"
            >
              {over ? "¡Soltalos!" : "Soltá acá tus chats"}
            </motion.p>
          </AnimatePresence>
          <p className="mt-3 text-white/50">
            o hacé click para elegirlos · <span className="font-mono text-sm">.txt</span> o{" "}
            <span className="font-mono text-sm">.zip</span>, todos los que quieras
          </p>
        </div>
      )}
    </motion.button>
  );
}

/** Tres burbujas de chat que se abren en abanico cuando arrastrás algo encima. */
function Bubbles({ active }: { active: boolean }) {
  const bubbles = [
    { w: 92, rotate: -12, x: -46, y: 6, color: "bg-white/10" },
    { w: 120, rotate: 0, x: 0, y: -10, color: "bg-acid" },
    { w: 80, rotate: 12, x: 48, y: 8, color: "bg-white/10" },
  ];
  return (
    <div className="relative h-24 w-56">
      {bubbles.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute left-1/2 top-1/2 h-12 rounded-2xl ${b.color}`}
          style={{ width: b.w, marginLeft: -b.w / 2, marginTop: -24 }}
          animate={{
            x: active ? b.x * 1.6 : b.x,
            y: active ? b.y - 14 : [b.y, b.y - 6, b.y],
            rotate: active ? b.rotate * 1.6 : b.rotate,
          }}
          transition={
            active
              ? { type: "spring", stiffness: 260, damping: 14 }
              : { duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }
          }
        >
          {i === 1 && (
            <span className="flex h-full items-center justify-center gap-1.5">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="size-2 rounded-full bg-ink"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                />
              ))}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
