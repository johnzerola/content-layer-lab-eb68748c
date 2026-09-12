/**
 * Painel de vozes do ChatScene.
 *
 * Fica dentro do próprio estúdio (aba da barra lateral): escolher a voz de cada
 * personagem, o jeito de falar, a velocidade, o tom, ouvir uma amostra e gerar
 * todas as falas. Só apresenta o documento `ChatSceneProject`.
 */
import { Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/base";
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_MIX,
  PITCH_MAX,
  PITCH_MIN,
  VOICE_PRESETS,
  VOICE_STYLES,
  type VoiceProfile,
} from "@/lib/chatscene/voice";
import type { ChatSceneProject } from "@/lib/chatscene/types";

export interface VoicePanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  clipCount: number;
  castState: string;
  castProgress: { done: number; total: number };
  onGenerate: () => void;
  previewing: string | null;
  onPreview: (participantId: string, profile: VoiceProfile) => void;
}

export function VoicePanel({
  project,
  patch,
  clipCount,
  castState,
  castProgress,
  onGenerate,
  previewing,
  onPreview,
}: VoicePanelProps) {
  return (
    <div>
      <p className="mono-label mb-1.5 text-muted-foreground">Vozes</p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Vozes sintéticas genéricas. Nada de imitar a voz de pessoas reais. Toque em{" "}
        <strong>Ouvir</strong> para escutar uma amostra antes de gerar.
      </p>
      <div className="space-y-2">
        {project.participants.map((p) => {
          const voice = p.voice ?? null;
          const setVoice = (changes: Partial<VoiceProfile> | null) =>
            patch({
              participants: project.participants.map((x) =>
                x.id === p.id
                  ? { ...x, voice: changes ? { ...DEFAULT_VOICE, ...x.voice, ...changes } : null }
                  : x,
              ),
            });
          return (
            <div key={p.id} className="rounded-lg border border-border bg-background/40 p-2">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="text-xs font-medium">{p.name}</span>
                <select
                  value={voice?.presetId ?? ""}
                  onChange={(e) => setVoice(e.target.value ? { presetId: e.target.value } : null)}
                  className="ml-auto rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                  aria-label={`Voz de ${p.name}`}
                >
                  <option value="">sem voz</option>
                  {VOICE_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              {voice && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <select
                    value={voice.style}
                    onChange={(e) => setVoice({ style: e.target.value as VoiceProfile["style"] })}
                    className="flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                    aria-label={`Jeito de falar de ${p.name}`}
                  >
                    {VOICE_STYLES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0.8}
                    max={1.2}
                    step={0.05}
                    value={voice.speed}
                    onChange={(e) => setVoice({ speed: Number(e.target.value) })}
                    className="w-20"
                    aria-label={`Velocidade da fala de ${p.name}`}
                  />
                  <span className="w-10 text-right text-[11px] text-muted-foreground">
                    {voice.speed.toFixed(2)}x
                  </span>
                </div>
              )}
              {voice && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="mono-label shrink-0 text-[10px] text-muted-foreground">tom</span>
                  <input
                    type="range"
                    min={PITCH_MIN}
                    max={PITCH_MAX}
                    step={0.5}
                    value={voice.pitch ?? 0}
                    onChange={(e) => setVoice({ pitch: Number(e.target.value) })}
                    className="flex-1"
                    aria-label={`Tom da voz de ${p.name}`}
                  />
                  <span className="w-14 text-right text-[11px] text-muted-foreground">
                    {(voice.pitch ?? 0) > 0 ? "+" : ""}
                    {(voice.pitch ?? 0).toFixed(1)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 gap-1 px-2 text-[11px]"
                    disabled={previewing === p.id}
                    onClick={() => onPreview(p.id, { ...DEFAULT_VOICE, ...voice })}
                    aria-label={`Ouvir a voz de ${p.name}`}
                    title="Ouvir uma amostra com esta voz, jeito, velocidade e tom"
                  >
                    {previewing === p.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Volume2 className="size-3.5" />
                    )}
                    Ouvir
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="mt-2 w-full"
        disabled={castState === "running"}
        onClick={onGenerate}
      >
        {castState === "running" ? (
          <>
            <Loader2 className="mr-1.5 size-4 animate-spin" />
            Gerando {castProgress.done}/{castProgress.total}
          </>
        ) : (
          "Gerar as falas"
        )}
      </Button>
      {clipCount > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {clipCount} falas prontas — elas entram no vídeo exportado.
        </p>
      )}

      <label className="mt-2 flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={project.voiceMix?.normalize ?? true}
          onChange={(e) =>
            patch({
              voiceMix: { ...DEFAULT_VOICE_MIX, ...project.voiceMix, normalize: e.target.checked },
            })
          }
        />
        deixar todas as falas no mesmo volume
      </label>
    </div>
  );
}
