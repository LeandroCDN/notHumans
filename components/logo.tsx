export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline text-xl tracking-tight ${className}`}>
      <span className="font-mono text-[0.85em] text-acid">not</span>
      <span className="font-serif text-[1.15em] italic">Humans</span>
      <span className="animate-blink ml-0.5 font-mono text-acid">▍</span>
    </span>
  );
}
