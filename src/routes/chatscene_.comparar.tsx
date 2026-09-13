/**
 * Comparação lado a lado: vídeo de referência x duas versões do mesmo exemplo
 * do ChatScene (fundo e vozes diferentes), com mapa de ritmo segundo a segundo.
 * Só apresentação: lê o ChatSceneProject e o plano do relógio, sem criar
 * estado paralelo nem alterar o Studio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, Upload } from "lucide-react";
import { RouteShell } from "@/components/RouteShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/base";
import { buildPlan, type ConversationPlan } from "@/lib/chatscene/clock";
import { CanvasConversationRenderer, paintPreview } from "@/lib/chatscene/renderer";
import {
  createDemoChatSceneProject,
  createDemoChatSceneProjectB,
  type ChatSceneProject,
} from "@/lib/chatscene/types";
import { backgroundLabel, messagesPerMinute, rhythmBySecond, timeLabel } from "@/lib/chatscene/rhythm";

export const Route = createFileRoute("/chatscene_/comparar")({
  head: () => ({
    meta: [
      { title: "Comparar com o vídeo de referência — ChatScene | VaiViral" },
      {
        name: "description",
        content:
          "Veja o vídeo de referência ao lado de duas versões da mesma conversa animada e compare chat, fundo e ritmo segundo a segundo.",
      },
      { property: "og:title", content: "Comparar conversa animada com a referência" },
      {
        property: "og:description",
        content: "Referência e duas versões da mesma cena lado a lado, com mapa de ritmo por segundo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth title="Comparar cenas" description="Entre para comparar suas conversas animadas.">
        <CompareScreen />
      </RequireAuth>
    </RouteShell>
  ),
});

function SceneCanvas({ project, plan, frame }: { project: ChatSceneProject; plan: ConversationPlan; frame: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const renderer = useMemo(() => new CanvasConversationRenderer({ safeZones: false }), []);

  useEffect(() => {
    let alive = true;
    setReady(false);
    void renderer.prepare(project).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [renderer, project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    paintPreview(canvas, renderer, project, plan, Math.min(frame, plan.totalFrames - 1));
  }, [renderer, project, plan, frame, ready]);

  return (
    <canvas
      ref={canvasRef}
      className="aspect-[9/16] w-full rounded-xl bg-black"
      aria-label={`Prévia da cena ${project.title}`}
    />
  );
}

function CompareScreen() {
  const projectA = useMemo(() => createDemoChatSceneProject(), []);
  const projectB = useMemo(() => createDemoChatSceneProjectB(), []);
  const planA = useMemo(() => buildPlan(projectA), [projectA]);
  const planB = useMemo(() => buildPlan(projectB), [projectB]);
  const fps = planA.fps || 30;
  const totalFrames = Math.max(planA.totalFrames, planB.totalFrames);

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // relógio único: os três quadros andam pelo tempo real decorrido
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startFrame = frameRef.current >= totalFrames - 1 ? 0 : frameRef.current;
    let raf = 0;
    const tick = () => {
      const next = startFrame + Math.round(((performance.now() - startedAt) / 1000) * fps);
      if (next >= totalFrames - 1) {
        setFrame(totalFrames - 1);
        setPlaying(false);
        return;
      }
      setFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalFrames, fps]);

  // o vídeo de referência segue o mesmo tempo
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !refUrl) return;
    if (playing) {
      const target = frameRef.current / fps;
      if (Math.abs(video.currentTime - target) > 0.4) video.currentTime = target;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      video.currentTime = frameRef.current / fps;
    }
  }, [playing, frame, refUrl, fps]);

  useEffect(() => () => {
    if (refUrl) URL.revokeObjectURL(refUrl);
  }, [refUrl]);

  const rowsA = useMemo(() => rhythmBySecond(projectA, planA), [projectA, planA]);
  const rowsB = useMemo(() => rhythmBySecond(projectB, planB), [projectB, planB]);
  const seconds = Math.max(rowsA.length, rowsB.length);
  const currentSecond = Math.floor(frame / fps);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Comparar com o vídeo de referência</h1>
        <p className="text-sm text-muted-foreground">
          Coloque seu vídeo de referência à esquerda e compare com duas versões da mesma conversa — fundo e vozes
          diferentes — no mesmo tempo. Abaixo, o mapa de ritmo segundo a segundo.
        </p>
        <Link to="/chatscene" className="text-sm underline">
          Voltar para o ChatScene
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Referência</h2>
          {refUrl ? (
            <video ref={videoRef} src={refUrl} className="aspect-[9/16] w-full rounded-xl bg-black" playsInline muted />
          ) : (
            <label className="flex aspect-[9/16] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 text-center text-sm text-muted-foreground">
              <Upload className="size-5" aria-hidden />
              <span>Escolher vídeo de referência</span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                aria-label="Escolher vídeo de referência"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setRefUrl(URL.createObjectURL(file));
                }}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">Fica só no seu navegador, não é enviado.</p>
        </section>

        {[
          { label: "Versão A", project: projectA, plan: planA },
          { label: "Versão B", project: projectB, plan: planB },
        ].map((item) => (
          <section key={item.label} className="space-y-2">
            <h2 className="text-sm font-medium">{item.label}</h2>
            <SceneCanvas project={item.project} plan={item.plan} frame={frame} />
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>Fundo: {backgroundLabel(item.project.background)}</li>
              <li>
                Duração: {timeLabel(item.plan.totalFrames / (item.plan.fps || 30))} ·{" "}
                {messagesPerMinute(item.project, item.plan)} mensagens/min
              </li>
              <li>
                Vozes:{" "}
                {(item.project.voiceProfiles ?? [])
                  .map((v) => `${v.providerVoiceId ?? v.presetId} (${v.style})`)
                  .join(", ")}
              </li>
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
        <Button size="sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausar" : "Reproduzir"}>
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {playing ? "Pausar" : "Reproduzir"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPlaying(false);
            setFrame(0);
          }}
          aria-label="Voltar ao início"
        >
          <RotateCcw className="size-4" aria-hidden /> Início
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={frame}
          aria-label="Linha do tempo da comparação"
          className="min-w-[200px] flex-1"
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
        />
        <span className="font-mono text-xs tabular-nums">{timeLabel(frame / fps)}</span>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Ritmo segundo a segundo</h2>
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="p-2 font-medium">Tempo</th>
                <th className="p-2 font-medium">Versão A</th>
                <th className="p-2 font-medium">Versão B</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: seconds }, (_, i) => {
                const a = rowsA[i];
                const b = rowsB[i];
                return (
                  <tr
                    key={i}
                    className={`border-t border-border/60 ${i === currentSecond ? "bg-primary/10" : ""}`}
                  >
                    <td className="p-2 align-top font-mono tabular-nums">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => {
                          setPlaying(false);
                          setFrame(i * fps);
                        }}
                      >
                        {timeLabel(i)}
                      </button>
                    </td>
                    {[a, b].map((row, idx) => (
                      <td key={idx} className="p-2 align-top">
                        {row ? (
                          <div className="space-y-1">
                            <div className="text-muted-foreground">
                              {row.threadName} · {row.background}
                              {row.typing ? ` · ${row.typing} digitando` : ""}
                            </div>
                            {row.events.map((ev) => (
                              <div key={ev.id}>
                                <span className="font-medium">{ev.author}:</span>{" "}
                                {ev.kind === "card" ? `[cartão] ${ev.text}` : ev.text || `[${ev.kind}]`}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
