import { BarChart3, Captions, Music4, Play, Scissors, Sparkles, Wand2 } from "lucide-react";

/** Peças 3D translúcidas flutuando ao redor do hero (decorativas). */
export function FloatingChips() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      <span className="lp-orb size-40" style={{ top: "-3rem", right: "6%" }} />
      <span className="lp-orb size-24 opacity-60" style={{ bottom: "12%", left: "-2rem" }} />

      <span className="lp-float absolute left-[-2.5rem] top-[22%]">
        <span className="lp-chip3d">
          <Scissors />
        </span>
      </span>
      <span className="lp-float lp-float-2 absolute right-[-1.5rem] top-[12%]">
        <span className="lp-chip3d" style={{ color: "var(--cyan, var(--primary))" }}>
          <Captions />
        </span>
      </span>
      <span className="lp-float lp-float-3 absolute bottom-[6%] left-[-3.5rem]">
        <span className="lp-chip3d" style={{ color: "var(--accent)" }}>
          <Music4 />
        </span>
      </span>
      <span className="lp-float lp-float-2 absolute bottom-[26%] right-[4%]">
        <span className="lp-chip3d">
          <BarChart3 />
        </span>
      </span>
      <span className="lp-float absolute right-[26%] top-[-1.5rem]">
        <span className="lp-chip3d" style={{ color: "var(--warning)" }}>
          <Sparkles />
        </span>
      </span>
      <span className="lp-float lp-float-3 absolute left-[6%] top-[4%]">
        <span className="lp-chip3d">
          <Play />
        </span>
      </span>
      <span className="lp-float lp-float-2 absolute bottom-[-2rem] right-[-2.5rem]">
        <span className="lp-chip3d" style={{ color: "var(--cyan, var(--primary))" }}>
          <Wand2 />
        </span>
      </span>
    </div>
  );
}
