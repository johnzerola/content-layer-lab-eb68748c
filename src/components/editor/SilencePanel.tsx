/**
 * Painel do REMOVEDOR DE SILÊNCIO.
 *
 * Analisa a onda de áudio do vídeo (não a transcrição), mostra a forma de onda
 * com os trechos mudos marcados e transforma o resultado em cortes reversíveis.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/base";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DEFAULT_SILENCE,
  analyzeAudio,
  findSilences,
  formatClock,
  keepRanges,
  totalOf,
  type Range,
  type SilenceAnalysis,
  type SilenceOptions,
} from "@/lib/editor/silence";

function Waveform({ analysis, silences }: { analysis: SilenceAnalysis; silences: Range[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      ref.current = canvas;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const w = (canvas.width = canvas.clientWidth * 2 || 600);
      const h = (canvas.height = 120);
      ctx.clearRect(0, 0, w, h);
      const peak = Math.max(0.0001, analysis.peak);
      const dur = Math.max(0.001, analysis.duration);
      ctx.fillStyle = "rgba(255,80,120,0.18)";
      for (const s of silences) {
        ctx.fillRect((s.start / dur) * w, 0, ((s.end - s.start) / dur) * w, h);
      }
      ctx.fillStyle = "#7c5cff";
      const step = Math.max(1, Math.floor(analysis.levels.length / w));
      for (let x = 0; x < w; x++) {
        const i = Math.floor((x / w) * analysis.levels.length);
        let m = 0;
        for (let j = i; j < i + step && j < analysis.levels.length; j++) m = Math.max(m, analysis.levels[j]!);
        const bh = Math.max(1, (m / peak) * h * 0.9);
        ctx.fillRect(x, (h - bh) / 2, 1, bh);
      }
    },
    [analysis, silences],
  );
  return <canvas ref={draw} className="h-[60px] w-full rounded-lg bg-background/50" />;
}

export function SilencePanel({
  getFile,
  onApply,
}: {
  getFile: () => Promise<File | null>;
  onApply: (keep: Range[]) => void;
}) {
  const [opts, setOpts] = useState<SilenceOptions>(DEFAULT_SILENCE);
  const [analysis, setAnalysis] = useState<SilenceAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  const silences = useMemo(() => (analysis ? findSilences(analysis, opts) : []), [analysis, opts]);
  const keep = useMemo(() => (analysis ? keepRanges(analysis.duration, silences, opts) : []), [analysis, silences, opts]);

  const analyze = async () => {
    setBusy(true);
    try {
      const file = await getFile();
      if (!file) {
        toast.error("Carregue o vídeo de origem primeiro.");
        return;
      }
      setAnalysis(await analyzeAudio(file));
    } catch {
      toast.error("Não consegui ler o áudio deste arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const slider = (label: string, key: keyof SilenceOptions, min: number, max: number, step: number, unit: string) => (
    <label className="block space-y-1 text-[11px] text-muted-foreground">
      <span>
        {label}: {opts[key].toFixed(2)}
        {unit}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={opts[key]}
        onChange={(e) => setOpts({ ...opts, [key]: Number(e.target.value) })}
        className="w-full"
      />
    </label>
  );

  const saved = analysis ? analysis.duration - totalOf(keep) : 0;

  return (
    <div className="space-y-4">
      <div>
        <Label>Remover silêncio</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Analisa o áudio de verdade e corta pausas, respiração e trechos mudos. Dá para desfazer.
        </p>
      </div>

      <Button onClick={analyze} disabled={busy} className="w-full">
        {busy ? "Analisando áudio…" : analysis ? "Analisar de novo" : "Analisar áudio"}
      </Button>

      {analysis ? (
        <>
          <Waveform analysis={analysis} silences={silences} />
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs">
            <p>
              {silences.length} pausas encontradas · economiza {formatClock(saved)} de {formatClock(analysis.duration)}
            </p>
            <p className="mt-1 text-muted-foreground">Ficam {keep.length} trechos de fala.</p>
          </div>
          <div className="space-y-2">
            {slider("Sensibilidade", "threshold", 0.01, 0.3, 0.01, "")}
            {slider("Pausa mínima", "minSilence", 0.1, 2, 0.05, "s")}
            {slider("Respiro mantido", "padding", 0, 0.4, 0.01, "s")}
            {slider("Fala mínima", "minSpeech", 0.05, 1, 0.05, "s")}
          </div>
          <Button onClick={() => onApply(keep)} disabled={!keep.length} className="w-full">
            Aplicar cortes no vídeo
          </Button>
        </>
      ) : null}
    </div>
  );
}
