import { Check, ChevronDown, Loader2, Play, RotateCcw, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/base";
import { attachPreset, voiceProfileOf } from "@/lib/chatscene/voice-resolution";
import { PROVIDER_CAPABILITIES } from "@/lib/chatscene/voice-providers";
import { missingSpeakingMessages } from "@/lib/chatscene/voice-cast";
import {
  DEFAULT_VOICE_MIX,
  FEATURED_ACTING_PRESET_IDS,
  PITCH_MAX,
  PITCH_MIN,
  VOICE_PRESETS,
  profileFromPreset,
  voicePreset,
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
  failures: { id: string; reason: string }[];
  onRetry: () => void;
  onContinue: () => void;
  onChangeVoice: () => void;
}

export function VoicePanel(props: VoicePanelProps) {
  const { project, patch, clipCount, castState, castProgress, onGenerate, previewing, onPreview, failures, onRetry, onContinue, onChangeVoice } = props;
  const setProject = (next: ChatSceneProject) => patch(next);
  const updateProfile = (id: string, changes: Partial<VoiceProfile>) => {
    const profiles = (project.voiceProfiles ?? []).map((profile) => profile.id === id ? { ...profile, ...changes } : profile);
    const participantIds = new Set(project.participants.filter((p) => p.voiceProfileId === id).map((p) => p.id));
    patch({
      voiceProfiles: profiles,
      participants: project.participants.map((p) => p.voiceProfileId === id ? { ...p, voice: { ...voiceProfileOf({ ...project, voiceProfiles: profiles }, p), ...changes } as VoiceProfile } : p),
      messages: project.messages.map((message) => participantIds.has(message.participantId) ? { ...message, voiceMs: null } : message),
    });
  };
  const missingItems = missingSpeakingMessages(project);
  const missing = missingItems.length;
  const characters = missingItems.reduce((sum, item) => sum + item.text.length, 0);
  const actingPresets = FEATURED_ACTING_PRESET_IDS.map((id) => voicePreset(id));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono-label text-muted-foreground">Voice Cast</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Uma identidade sintética por personagem. A prévia real é reaproveitada quando os ajustes não mudam.</p>
        </div>
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] uppercase text-muted-foreground">PT-BR</span>
      </div>

      <div className="space-y-2">
        {project.participants.map((participant) => {
          const voice = voiceProfileOf(project, participant);
          const selectedPreset = voice ? voicePreset(voice.presetId) : null;
          const caps = PROVIDER_CAPABILITIES["lovable-ai"];
          return (
            <article key={participant.id} className="rounded-lg border border-border bg-background/45 p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-primary-foreground" style={{ backgroundColor: participant.color }}>{participant.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{participant.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{voice?.name ?? selectedPreset?.description ?? "Sem voz definida"}</p>
                </div>
                {voice ? <span className="size-2 rounded-full bg-emerald-400" title="Voz configurada" /> : null}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
                  <Sparkles className="size-3" aria-hidden /> Presets de atuação
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {actingPresets.map((actingPreset) => {
                    const active = voice?.presetId === actingPreset.id;
                    return (
                      <Button
                        key={actingPreset.id}
                        type="button"
                        size="sm"
                        variant={active ? "secondary" : "ghost"}
                        className={`h-auto min-h-10 justify-start whitespace-normal px-2 py-1.5 text-left text-[10px] leading-tight ${active ? "border border-primary/50 bg-primary/10 text-foreground" : "border border-transparent"}`}
                        aria-pressed={active}
                        onClick={() => setProject(attachPreset(project, participant.id, actingPreset.id))}
                      >
                        {active ? <Check className="size-3 shrink-0 text-primary" aria-hidden /> : <span className="size-3 shrink-0" />}
                        <span>{actingPreset.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <label className="mt-3 block text-[10px] font-medium uppercase text-muted-foreground">Catálogo completo</label>
              <div className="relative mt-1">
                <select
                  value={voice?.presetId ?? ""}
                  onChange={(e) => setProject(e.target.value ? attachPreset(project, participant.id, e.target.value) : { ...project, participants: project.participants.map((p) => p.id === participant.id ? { ...p, voice: null, voiceProfileId: null } : p) })}
                  className="h-9 w-full appearance-none rounded-md border border-border bg-background px-2 pr-8 text-xs"
                  aria-label={`Voz de ${participant.name}`}
                >
                  <option value="">Sem voz</option>
                  {Array.from(new Set(VOICE_PRESETS.map((p) => p.group))).map((group) => (
                    <optgroup key={group} label={group}>
                      {VOICE_PRESETS.filter((p) => p.group === group).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
              </div>

              {voice ? (
                <>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" className="h-8 flex-1 gap-1.5" disabled={previewing === participant.id} onClick={() => onPreview(participant.id, voice)} aria-label={`Ouvir a voz de ${participant.name}`}>
                      {previewing === participant.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Ouvir
                    </Button>
                    <details className="group flex-1">
                      <summary className="flex h-8 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-medium"><SlidersHorizontal className="size-3.5" /> Editar</summary>
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <VoiceRange label="Velocidade" value={voice.speed} min={.7} max={1.3} step={.05} suffix="×" onChange={(speed) => voice.id && updateProfile(voice.id, { speed })} />
                        {caps?.controls.energy ? <VoiceRange label="Energia" value={voice.energy ?? .5} min={0} max={1} step={.05} onChange={(energy) => voice.id && updateProfile(voice.id, { energy })} /> : null}
                        {caps?.controls.pitch ? <VoiceRange label="Tom" value={voice.pitch ?? 0} min={PITCH_MIN} max={PITCH_MAX} step={.5} onChange={(pitch) => voice.id && updateProfile(voice.id, { pitch })} /> : null}
                        {caps?.controls.expressiveness ? <VoiceRange label="Expressividade" value={voice.expressiveness ?? .5} min={0} max={1} step={.05} onChange={(expressiveness) => voice.id && updateProfile(voice.id, { expressiveness })} /> : null}
                        {caps?.controls.warmth ? <VoiceRange label="Calor do timbre" value={voice.warmth ?? .5} min={0} max={1} step={.05} onChange={(warmth) => voice.id && updateProfile(voice.id, { warmth })} /> : null}
                        {caps?.controls.brightness ? <VoiceRange label="Brilho" value={voice.brightness ?? .5} min={0} max={1} step={.05} onChange={(brightness) => voice.id && updateProfile(voice.id, { brightness })} /> : null}
                        {caps?.controls.roughness ? <VoiceRange label="Aspereza" value={voice.roughness ?? 0} min={0} max={1} step={.05} onChange={(roughness) => voice.id && updateProfile(voice.id, { roughness })} /> : null}
                        <Button size="sm" variant="ghost" className="h-7 w-full gap-1 text-[11px]" onClick={() => updateProfile(voice.id ?? `voice_${participant.id}`, profileFromPreset(voice.presetId, { id: voice.id ?? `voice_${participant.id}` }))}><RotateCcw className="size-3" /> Restaurar preset</Button>
                      </div>
                    </details>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">Voz real · velocidade na geração · pitch na reprodução e no vídeo</p>
                </>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-background/30 p-3">
        <div className="mb-2 flex justify-between text-[11px]"><span>{missing} mensagens precisam de voz</span><span className="text-muted-foreground">{characters} caracteres</span></div>
        <Button size="sm" className="w-full gap-1.5" disabled={castState === "running" || missing === 0} onClick={onGenerate}>
          {castState === "running" ? <><Loader2 className="size-4 animate-spin" /> Gerando {castProgress.done}/{castProgress.total}</> : <><Volume2 className="size-4" /> Gerar vozes ausentes</>}
        </Button>
        {clipCount > 0 ? <p className="mt-1.5 text-[11px] text-muted-foreground">{clipCount} falas prontas nesta cena; o cache também permanece neste navegador.</p> : null}
        {failures.length ? (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            <p className="text-[11px] font-medium text-destructive">Falha ao gerar {failures.length === 1 ? "uma voz" : `${failures.length} vozes`}.</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{failures[0]?.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={onRetry}>Tentar novamente</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onChangeVoice}>Trocar voz</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onContinue}>Continuar sem voz</Button>
            </div>
          </div>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={project.voiceMix?.normalize ?? true} onChange={(e) => patch({ voiceMix: { ...DEFAULT_VOICE_MIX, ...project.voiceMix, normalize: e.target.checked } })} /> normalizar volume sem achatar a dinâmica</label>
    </div>
  );
}

function VoiceRange({ label, value, min, max, step, suffix = "", onChange }: { label:string; value:number; min:number; max:number; step:number; suffix?:string; onChange:(value:number)=>void }) {
  return <label className="block text-[11px] text-muted-foreground"><span className="mb-1 flex justify-between"><span>{label}</span><span>{value.toFixed(step < 1 ? 2 : 0)}{suffix}</span></span><input className="w-full accent-primary" type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))} /></label>;
}
