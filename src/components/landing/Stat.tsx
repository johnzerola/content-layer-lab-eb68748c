import { useEffect, useRef, useState } from "react";

/** Número grande que conta de zero quando entra na tela. */
export function Stat({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  label,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || started.current) return;
      started.current = true;
      io.disconnect();
      if (reduce) {
        setDisplay(value);
        return;
      }
      const startedAt = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - startedAt) / 2000);
        setDisplay(value * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  const shown = display.toFixed(decimals).replace(".", ",");
  return (
    <div ref={ref} className="lp-glass lp-hover rounded-2xl p-6">
      <p className="lp-stat font-display text-[clamp(2rem,3.4vw,3rem)] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
        {prefix}
        {shown}
        {suffix}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}
