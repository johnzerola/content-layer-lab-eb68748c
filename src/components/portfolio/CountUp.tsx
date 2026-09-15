import { useEffect, useState } from "react";

/**
 * Contador que sobe de 0 até o valor real, com plateau inicial e easing suave.
 * Apresentação apenas — o valor vem sempre de dados reais da conta.
 */
export function CountUp({
  value,
  suffix = "",
  decimals = 0,
  delay = 0,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  delay?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const duration = 2400;
    const startedAt = performance.now() + delay;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
      const eased = progress < 0.06 ? 0 : 1 - Math.pow(1 - (progress - 0.06) / 0.94, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, value]);

  const label = value.toFixed(decimals).replace(".", ",");
  const shown = display.toFixed(decimals).replace(".", ",");
  return (
    <span className="auth-counter tabular-nums" aria-label={`${label}${suffix}`}>
      {shown}
      {suffix}
    </span>
  );
}
