import { useEffect, useRef, useState } from "react";

/** Formata em R$ 298K / R$ 246,2K. */
function formatBRL(v: number) {
  const k = v / 1000;
  const txt = k >= 100 ? Math.round(k).toString() : k.toFixed(1).replace(".", ",");
  return `R$ ${txt}K`;
}

/**
 * Prêmio em destaque: conta suavemente de zero até o primeiro valor e depois
 * transita entre os valores da lista, num ciclo contínuo e elegante.
 */
export function PrizeCounter({ values, interval = 5200 }: { values: number[]; interval?: number }) {
  const [display, setDisplay] = useState(0);
  const [index, setIndex] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const target = values[index] ?? 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const duration = 1800;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(from + (target - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, values]);

  useEffect(() => {
    if (values.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % values.length), interval);
    return () => clearInterval(id);
  }, [interval, values.length]);

  return (
    <span className="auth-prize tabular-nums" aria-live="polite" aria-label={formatBRL(values[index] ?? 0)}>
      {formatBRL(display)}
    </span>
  );
}
