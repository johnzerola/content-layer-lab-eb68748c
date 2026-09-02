import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  Check,
  ChevronsLeftRight,
  Merge,
  Move,
  Pause,
  Play,
  Rewind,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { drawCaptions } from "@/lib/draw";
import { CANVAS_H, CANVAS_W, type CaptionStyle, type CustomFont } from "@/lib/template";
import type { CaptionCue } from "@/lib/captions";
import {
  autoFixText,
  cueText,
  fmtTime,
  mergeWithNext,
  regroup,
  removeCue,
  replaceAll,
  retextCue,
  shiftAll,
  shiftCue,
} from "@/lib/caption-edit";
import { CaptionStudio } from "@/components/CaptionStudio";

interface Props {
  file: File;
  cues: CaptionCue[];
  style: CaptionStyle;
  fonts?: CustomFont[] | undefined;
  onAddFont?: (f: CustomFont) => void;
  onCues: (cues: CaptionCue[]) => void;
  onStyle: (patch: Partial<CaptionStyle>) => void;
  onClose: () => void;
}

type Tab = "texto" | "tempo" | "estilo";

const btn =
  "rounded-lg border border-border px-2.5 py-1.5 font-mono text-[11px] transition hover:border-primary hover:text-primary disabled:opacity-40";

/** posições rápidas (linha, coluna) no canvas 1080x1920 */
const ANCHORS: { id: string; label: string; x: number; y: number; w: number }[] = [
  { id: "topo", label: "topo", x: 90, y: 240, w: 900 },
  { id: "meio-alto", label: "acima do centro", x: 90, y: 700, w: 900 },
  { id: "centro", label: "centro", x: 90, y: 900, w: 900 },
  { id: "meio-baixo", label: "abaixo do centro", x: 90, y: 1150, w: 900 },
  { id: "rodape", label: "rodapé seguro", x: 90, y: 1420, w: 900 },
  { id: "tiktok", label: "acima da UI TikTok", x: 90, y: 1280, w: 820 },
];

export function CaptionWorkbench({
  file,
  cues,
  style,
  fonts,
  onAddFont,
  onCues,
  onStyle,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<Tab>("texto");
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [dragging, setDragging] = useState(false);

  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const onKeyClose = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKeyClose);
    return () => window.removeEventListener("keydown", onKeyClose);
  }, [onKeyClose]);

  /** legendas com o offset de sincronia aplicado ao vivo */
  const synced = useMemo(() => (offset ? shiftAll(cues, offset) : cues), [cues, offset]);

  const activeIndex = useMemo(
    () => synced.findIndex((c) => time >= c.start - 0.05 && time <= c.end + 0.05),
    [synced, time],
  );

  /** loop de desenho da prévia */
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      const cv = canvasRef.current;
      if (v && cv) {
        setTime(v.currentTime);
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cv.width, cv.height);
          drawCaptions(ctx, { ...style, visible: true }, synced, v.currentTime);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [style, synced]);

  /** rolagem automática da lista pro bloco atual */
  useEffect(() => {
    if (!follow || tab !== "texto" || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-cue="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex, follow, tab]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    setTime(v.currentTime);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const commitOffset = () => {
    if (!offset) return;
    onCues(shiftAll(cues, offset));
    setOffset(0);
    setToast("sincronia aplicada");
  };

  /** arrastar a legenda direto na prévia */
  const startDrag = (e: React.PointerEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    setDragging(true);
    const toCanvas = (cx: number, cy: number) => ({
      x: ((cx - box.left) / box.width) * CANVAS_W,
      y: ((cy - box.top) / box.height) * CANVAS_H,
    });
    const move = (ev: PointerEvent) => {
      const p = toCanvas(ev.clientX, ev.clientY);
      onStyle({
        x: Math.round(Math.min(CANVAS_W - style.w, Math.max(0, p.x - style.w / 2))),
        y: Math.round(Math.min(CANVAS_H - 80, Math.max(0, p.y - style.h / 2))),
      });
    };
    move(e.nativeEvent);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const patchCueText = (i: number, text: string) => {
    const c = cues[i];
    if (!c) return;
    onCues(cues.map((x, j) => (j === i ? retextCue(x, text) : x)));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" role="dialog" aria-label="Editor de legendas">
      {/* topo */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Editor de legendas</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{file.name}</p>
        </div>
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
          {fmtTime(time)} / {fmtTime(dur)}
        </span>
        <button onClick={onClose} className={btn}>
          <Check className="mr-1 inline size-3.5" /> concluir
        </button>
        <button onClick={onClose} aria-label="fechar" className="rounded-lg border border-border p-1.5 hover:border-primary">
          <X className="size-4" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* prévia fixa */}
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <div
            ref={boxRef}
            onPointerDown={startDrag}
            className={`relative mx-auto aspect-[9/16] w-full max-w-[300px] shrink-0 overflow-hidden rounded-xl border bg-black ${
              dragging ? "border-primary" : "border-border"
            }`}
          >
            <video
              ref={videoRef}
              src={url}
              playsInline
              className="absolute inset-0 size-full object-cover"
              onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="pointer-events-none absolute inset-0 size-full"
            />
            {/* zona segura */}
            <div className="pointer-events-none absolute inset-x-[8%] inset-y-[6%] rounded-lg border border-dashed border-white/15" />
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/70">
              <Move className="mr-1 inline size-3" /> arraste para posicionar
            </span>
          </div>

          {/* transporte */}
          <div className="flex items-center justify-center gap-1.5">
            <button onClick={() => seek(time - 5)} className={btn} aria-label="voltar 5s">
              <SkipBack className="size-3.5" />
            </button>
            <button onClick={toggle} className="rounded-full border border-primary p-2.5 text-primary" aria-label="play">
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button onClick={() => seek(time + 5)} className={btn} aria-label="avançar 5s">
              <SkipForward className="size-3.5" />
            </button>
            <button onClick={() => seek(0)} className={btn} aria-label="início">
              <Rewind className="size-3.5" />
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, dur)}
            step={0.01}
            value={Math.min(time, dur || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
            aria-label="linha do tempo"
          />

          {/* posição rápida */}
          <div className="rounded-xl border border-border bg-surface-2 p-2.5">
            <p className="mono-label mb-1.5">Posição na tela</p>
            <div className="flex flex-wrap gap-1.5">
              {ANCHORS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onStyle({ x: a.x, y: a.y, w: a.w })}
                  className={`${btn} ${style.y === a.y && style.x === a.x ? "border-primary text-primary" : ""}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2">
              <label className="block space-y-1">
                <span className="mono-label flex justify-between">
                  <span>Tamanho</span>
                  <span className="text-primary">{style.size}</span>
                </span>
                <input
                  type="range"
                  min={28}
                  max={150}
                  value={style.size}
                  onChange={(e) => onStyle({ size: Number(e.target.value) })}
                  className="w-full accent-[var(--primary)]"
                />
              </label>
              <label className="block space-y-1">
                <span className="mono-label flex justify-between">
                  <span>
                    <ChevronsLeftRight className="mr-1 inline size-3" />
                    Largura
                  </span>
                  <span className="text-primary">{style.w}</span>
                </span>
                <input
                  type="range"
                  min={300}
                  max={1080}
                  step={10}
                  value={style.w}
                  onChange={(e) => onStyle({ w: Number(e.target.value) })}
                  className="w-full accent-[var(--primary)]"
                />
              </label>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => onStyle({ align: a })}
                    className={`${btn} flex-1 ${style.align === a ? "border-primary text-primary" : ""}`}
                  >
                    {a === "left" ? "esq" : a === "center" ? <AlignCenter className="inline size-3" /> : "dir"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* sincronia */}
          <div className="rounded-xl border border-border bg-surface-2 p-2.5">
            <p className="mono-label mb-1.5">Sincronia geral</p>
            <input
              type="range"
              min={-3}
              max={3}
              step={0.05}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
              aria-label="ajuste de sincronia"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-primary">
                {offset > 0 ? "+" : ""}
                {offset.toFixed(2)}s
              </span>
              <button onClick={() => setOffset((o) => Number((o - 0.1).toFixed(2)))} className={btn}>
                -0.1s
              </button>
              <button onClick={() => setOffset((o) => Number((o + 0.1).toFixed(2)))} className={btn}>
                +0.1s
              </button>
              <button
                onClick={() => {
                  const first = cues[0]?.words[0]?.start ?? 0;
                  setOffset(Number((time - first).toFixed(2)));
                }}
                className={btn}
                title="alinha o início da legenda com o ponto atual do vídeo"
              >
                <Sparkles className="mr-1 inline size-3" /> sincronizar aqui
              </button>
              <button onClick={commitOffset} disabled={!offset} className={btn}>
                aplicar
              </button>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              deslize enquanto o vídeo toca: a prévia acompanha ao vivo.
            </p>
          </div>
        </div>

        {/* painel direito */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {(["texto", "tempo", "estilo"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                  tab === t ? "border-primary text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {t === "texto" ? "Texto e correção" : t === "tempo" ? "Tempo por bloco" : "Estilo"}
              </button>
            ))}
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {cues.length} blocos · {cues.reduce((n, c) => n + c.words.length, 0)} palavras
            </span>
          </div>

          {tab === "texto" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-2">
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="localizar"
                  className="w-32 rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px]"
                />
                <input
                  value={repl}
                  onChange={(e) => setRepl(e.target.value)}
                  placeholder="substituir por"
                  className="w-36 rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px]"
                />
                <button
                  onClick={() => {
                    const r = replaceAll(cues, find, repl);
                    onCues(r.cues);
                    setToast(`${r.count} palavra(s) substituída(s)`);
                  }}
                  className={btn}
                >
                  substituir tudo
                </button>
                <button
                  onClick={() => {
                    const r = autoFixText(cues);
                    onCues(r.cues);
                    setToast(`corretor: ${r.count} ajuste(s)`);
                  }}
                  className={btn}
                >
                  <Wand2 className="mr-1 inline size-3" /> corrigir português
                </button>
                <label className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={follow}
                    onChange={(e) => setFollow(e.target.checked)}
                    className="size-3.5 accent-[var(--primary)]"
                  />
                  seguir o vídeo
                </label>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {cues.map((c, i) => (
                  <div
                    key={`${i}-${c.start}`}
                    data-cue={i}
                    className={`rounded-xl border p-2 transition ${
                      activeIndex === i ? "border-primary bg-primary/5" : "border-border bg-surface-2"
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => seek(c.start + offset)}
                        className="font-mono text-[10px] text-primary underline underline-offset-2"
                      >
                        {fmtTime(c.start)} → {fmtTime(c.end)}
                      </button>
                      <button onClick={() => onCues(shiftCue(cues, i, -0.1))} className={btn} title="atrasar bloco">
                        -0.1s
                      </button>
                      <button onClick={() => onCues(shiftCue(cues, i, 0.1))} className={btn} title="adiantar bloco">
                        +0.1s
                      </button>
                      <button
                        onClick={() => onCues(mergeWithNext(cues, i))}
                        disabled={i === cues.length - 1}
                        className={btn}
                        title="juntar com o próximo"
                      >
                        <Merge className="inline size-3" />
                      </button>
                      <button
                        onClick={() => onCues(removeCue(cues, i))}
                        className={`${btn} text-destructive hover:border-destructive`}
                        title="remover bloco"
                      >
                        <Trash2 className="inline size-3" />
                      </button>
                    </div>
                    <textarea
                      defaultValue={cueText(c)}
                      onBlur={(e) => patchCueText(i, e.target.value)}
                      rows={2}
                      className="w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-sm leading-relaxed outline-none focus:border-primary"
                    />
                  </div>
                ))}
                {!cues.length && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    nenhuma legenda ainda — gere a transcrição primeiro.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "tempo" && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-2 p-2">
                <span className="mono-label">Palavras por bloco</span>
                {[2, 3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => onCues(regroup(cues, n))} className={btn}>
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const i = activeIndex;
                    if (i < 0) return;
                    onCues(shiftCue(cues, i, time - (synced[i]?.start ?? 0)));
                  }}
                  className={btn}
                  title="faz o bloco atual começar exatamente aqui"
                >
                  <Scissors className="mr-1 inline size-3" /> começar bloco aqui
                </button>
              </div>

              <div className="space-y-1.5">
                {cues.map((c, i) => (
                  <div
                    key={`t-${i}-${c.start}`}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                      activeIndex === i ? "border-primary" : "border-border"
                    }`}
                  >
                    <button onClick={() => seek(c.start + offset)} className="font-mono text-[10px] text-primary">
                      {fmtTime(c.start)}
                    </button>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{cueText(c)}</span>
                    {[-0.25, -0.1, 0.1, 0.25].map((d) => (
                      <button key={d} onClick={() => onCues(shiftCue(cues, i, d))} className={btn}>
                        {d > 0 ? "+" : ""}
                        {d}s
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "estilo" && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <CaptionStudio
                style={style}
                cues={cues}
                fonts={fonts}
                onAddFont={onAddFont}
                onChange={onStyle}
                hidePreview
              />
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border border-primary bg-background px-3 py-1.5 font-mono text-[11px] text-primary">
          {toast}
        </div>
      )}
    </div>
  );
}
