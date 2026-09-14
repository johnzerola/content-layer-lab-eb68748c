import { useEffect, useState } from "react";
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, Clock3, Diamond, KeyRound, Play, Scissors, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { ANIMATABLE_PROPERTIES, clampTransitionDuration, clipLocalTime, resolveAnimatedTransform, type AnimatableProperty, type AudioRepresentation, type AudioSourceGroup, type Clip, type ClipStyle, type ClipTransform, type MediaAsset, type ProjectSettings, type Track, type Transition } from "@/lib/editor-v2";
import type { Easing } from "@/lib/video-template/types";
import { TRANSITION_DEFINITIONS, type LibraryItem, type TransitionDefinition } from "@/lib/editor-v2/library";
import { CreativeInspectorV2 } from "./CreativeInspectorV2";
import { LibraryPreview } from "./LibraryPreview";

interface TransitionContext {
  from: Clip;
  to: Clip;
  boundary: number;
  maxDuration: number;
  distance: number;
  existing: Transition | undefined;
}

interface InspectorProps {
  clip: Clip | null;
  selectionCount: number;
  track: Track | null;
  libraryItem: LibraryItem | null;
  currentTime: number;
  transitionContext: TransitionContext | null;
  audioGroup: AudioSourceGroup | null;
  missingAsset: MediaAsset | null;
  onPatchClip: (clipId: string, patch: Partial<Clip>) => void;
  onTransform: (clipId: string, transform: ClipTransform, easing: Easing) => void;
  onUpsertKeyframe: (property: AnimatableProperty, value: number, easing: Easing, keyframeId?: string) => void;
  onDeleteKeyframe: (property: AnimatableProperty, keyframeId: string) => void;
  onSeek: (time: number) => void;
  onApplyTransition: (definitionId: string, duration: number, easing: Easing) => void;
  onDeleteTransition: (transitionId: string) => void;
  onPreviewTransition: (boundary: number, duration: number) => void;
  onUpsertAudioEnvelope: (gain: number, pointId?: string) => void;
  onDeleteAudioEnvelope: (pointId: string) => void;
  audioSettings: ProjectSettings["audio"];
  onAudioSettings: (patch: Partial<ProjectSettings["audio"]>) => void;
  onTrackAudio: (patch: Partial<Pick<Track, "gain" | "muted" | "solo">>) => void;
  onAudioRepresentation: (representation: AudioRepresentation) => void;
  onExtractAudio: () => void;
  onCancelAudioExtraction: () => void;
  onSeparateAudio: () => void;
  onCancelAudioSeparation: () => void;
  onRestoreOriginalAudio: () => void;
  onRelink: (assetId: string) => void;
  extractingAudio: boolean;
  separatingAudio: boolean;
  onAddLibraryItem: (item: LibraryItem) => void;
}

export function InspectorV2(props: InspectorProps) {
  const { clip, selectionCount, track, libraryItem, currentTime, transitionContext, audioGroup, missingAsset, onPatchClip, onTransform, onUpsertKeyframe, onDeleteKeyframe, onSeek, onApplyTransition, onDeleteTransition, onPreviewTransition, onUpsertAudioEnvelope, onDeleteAudioEnvelope, audioSettings, onAudioSettings, onTrackAudio, onAudioRepresentation, onExtractAudio, onCancelAudioExtraction, onSeparateAudio, onCancelAudioSeparation, onRestoreOriginalAudio, onRelink, extractingAudio, separatingAudio, onAddLibraryItem } = props;
  const [easing, setEasing] = useState<Easing>("easeInOut");
  const [transitionKind, setTransitionKind] = useState("fade");
  const [transitionDuration, setTransitionDuration] = useState(0.45);
  useEffect(() => {
    const selectedDefinition = libraryItem?.type === "transition" ? libraryItem.definition as TransitionDefinition : null;
    if (selectedDefinition) {
      setTransitionKind(selectedDefinition.id);
      setTransitionDuration(clampTransitionDuration(transitionContext?.existing?.duration ?? selectedDefinition.durationDefault, selectedDefinition.durationMin, Math.min(selectedDefinition.durationMax, transitionContext?.maxDuration ?? selectedDefinition.durationMax)));
      setEasing(transitionContext?.existing?.easing ?? "easeInOut");
    } else if (transitionContext?.existing) {
      setTransitionKind(transitionContext.existing.definitionId);
      setTransitionDuration(transitionContext.existing.duration);
      setEasing(transitionContext.existing.easing);
    }
  }, [libraryItem, transitionContext?.from.id, transitionContext?.to.id, transitionContext?.maxDuration, transitionContext?.existing]);
  if (!clip && libraryItem?.type === "transition") return <TransitionLibraryInspector item={libraryItem as LibraryItem<TransitionDefinition>} context={transitionContext} definitionId={transitionKind} duration={transitionDuration} easing={easing} onDefinition={setTransitionKind} onDuration={setTransitionDuration} onEasing={setEasing} onApply={onApplyTransition} onDelete={onDeleteTransition} onPreview={onPreviewTransition} />;
  if (!clip && libraryItem) return <LibraryInspector item={libraryItem} onAdd={() => onAddLibraryItem(libraryItem)} />;
  if (!clip) return <EmptyInspector />;
  const transform = resolveAnimatedTransform(clip, currentTime);
  const style = clip.style ?? {};
  const localTime = clipLocalTime(clip, currentTime);
  const patchTransform = (key: keyof ClipTransform, value: number) => onTransform(clip.id, { ...transform, [key]: value }, easing);
  const patchStyle = (patch: Partial<ClipStyle>) => onPatchClip(clip.id, { style: { ...style, ...patch } });
  return (
    <aside className="editor-v2-panel editor-v2-inspector flex h-full min-h-0 flex-col" aria-label="Inspector de propriedades">
      <header className="editor-v2-panel-header px-4 py-3"><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /><h2 className="text-sm font-semibold">{selectionCount > 1 ? `${selectionCount} itens selecionados` : "Inspector"}</h2></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{selectionCount > 1 ? `${clip.name} é o item principal · ajustes compatíveis serão aplicados ao grupo` : clip.name}</p></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 vaiviral-scrollbar">
        {missingAsset && <div role="alert" className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" /><div><p className="text-[10px] font-semibold text-amber-100">Arquivo ausente</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{missingAsset.name} não está mais disponível neste navegador. O projeto foi preservado.</p></div></div><button type="button" onClick={() => onRelink(missingAsset.id)} className="mt-2 min-h-9 w-full rounded-lg border border-amber-200/25 bg-amber-200/10 px-3 text-[10px] font-semibold text-amber-100 hover:bg-amber-200/15">Religar arquivo</button></div>}
        {audioGroup && <InspectorSection title="Áudio da mídia">
          <p className="mb-2 text-[9px] leading-relaxed text-muted-foreground">Escolha uma única origem para preview e exportação. Os stems continuam vinculados ao vídeo.</p>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Origem ativa do áudio">
            {([
              ["embedded", "No vídeo", Boolean(audioGroup.sourceVideoClipId)],
              ["extracted", "Extraído", Boolean(audioGroup.extractedClipId)],
              ["separated", "Voz + música", Boolean(audioGroup.dialogueClipId && audioGroup.musicClipId)],
            ] as const).map(([value, label, available]) => <button key={value} type="button" disabled={!available} aria-pressed={audioGroup.activeRepresentation === value} onClick={() => onAudioRepresentation(value)} className={`min-h-9 rounded-lg border px-1.5 text-[9px] font-semibold transition ${audioGroup.activeRepresentation === value ? "border-primary/60 bg-primary/18 text-primary shadow-[0_0_18px_hsl(var(--primary)/.12)]" : available ? "border-white/8 bg-white/[0.035] text-muted-foreground hover:border-white/15 hover:text-white" : "cursor-not-allowed border-white/5 bg-transparent text-muted-foreground/35"}`}>{label}</button>)}
          </div>
          {clip.kind === "video" && clip.audio && <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-medium">Som do vídeo</span><button type="button" aria-pressed={clip.audio.muted} onClick={() => onPatchClip(clip.id, { audio: { ...clip.audio!, muted: !clip.audio!.muted } })} className={`h-8 rounded-lg px-2.5 text-[10px] font-semibold ${clip.audio.muted ? "bg-destructive/15 text-destructive" : "bg-white/6 text-foreground"}`}>{clip.audio.muted ? "Mudo" : "Ativo"}</button></div><AudioRange label="Volume" value={clip.audio.gain} max={1.5} suffix={`${Math.round(clip.audio.gain * 100)}%`} onChange={(gain) => onPatchClip(clip.id, { audio: { ...clip.audio!, gain } })} /></div>}
          {audioGroup.sourceVideoClipId && <div className="mt-3 space-y-2" aria-busy={extractingAudio || separatingAudio}>
            <button type="button" disabled={separatingAudio} onClick={extractingAudio ? onCancelAudioExtraction : onExtractAudio} className={`min-h-9 w-full rounded-lg border px-3 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45 ${extractingAudio ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/[0.035] text-foreground hover:border-white/20"}`}>{extractingAudio ? "Cancelar extração" : audioGroup.extractedClipId ? "Extrair novamente" : "Extrair áudio completo"}</button>
            <button type="button" disabled={extractingAudio} onClick={separatingAudio ? onCancelAudioSeparation : onSeparateAudio} className={`min-h-10 w-full rounded-lg border px-3 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45 ${separatingAudio ? "border-amber-400/35 bg-amber-400/10 text-amber-100" : "border-primary/45 bg-primary/18 text-primary shadow-[0_0_18px_hsl(var(--primary)/.1)] hover:bg-primary/24"}`}>{separatingAudio ? "Cancelar separação" : audioGroup.dialogueClipId || audioGroup.musicClipId ? "Separar novamente" : "Separar diálogo e música"}</button>
            {audioGroup.dialogueClipId || audioGroup.musicClipId ? <button type="button" disabled={extractingAudio || separatingAudio} onClick={onRestoreOriginalAudio} className="min-h-9 w-full rounded-lg px-3 text-[10px] font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45">Restaurar áudio original</button> : null}
            <p className="text-[9px] leading-relaxed text-muted-foreground">O original fica preservado. Depois, use Solo ou Mudo nas faixas Diálogo e Música e ambiente.</p>
          </div>}
        </InspectorSection>}
        {clip.kind !== "audio" && <InspectorSection title="Transformação">
          <div className="grid grid-cols-2 gap-2">
            <AnimatedNumberField label="Posição X" property="x" value={transform.x} suffix="%" clip={clip} localTime={localTime} easing={easing} onCommit={(value) => patchTransform("x", value)} onUpsert={onUpsertKeyframe} onDelete={onDeleteKeyframe} />
            <AnimatedNumberField label="Posição Y" property="y" value={transform.y} suffix="%" clip={clip} localTime={localTime} easing={easing} onCommit={(value) => patchTransform("y", value)} onUpsert={onUpsertKeyframe} onDelete={onDeleteKeyframe} />
            <NumberField label="Largura" value={transform.width} suffix="%" min={4} onCommit={(value) => patchTransform("width", value)} />
            <NumberField label="Altura" value={transform.height} suffix="%" min={4} onCommit={(value) => patchTransform("height", value)} />
            <AnimatedNumberField label="Escala" property="scale" value={transform.scale} displayValue={transform.scale * 100} valueFromDisplay={(value) => value / 100} suffix="%" clip={clip} localTime={localTime} easing={easing} min={10} onCommit={(value) => patchTransform("scale", value)} onUpsert={onUpsertKeyframe} onDelete={onDeleteKeyframe} />
            <AnimatedNumberField label="Rotação" property="rotation" value={transform.rotation} suffix="°" clip={clip} localTime={localTime} easing={easing} onCommit={(value) => patchTransform("rotation", value)} onUpsert={onUpsertKeyframe} onDelete={onDeleteKeyframe} />
          </div>
          <div className="mt-3 flex items-end gap-2"><label className="min-w-0 flex-1 text-[10px] text-muted-foreground">Opacidade <span className="float-right tabular-nums text-foreground">{Math.round(transform.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={transform.opacity} onChange={(event) => patchTransform("opacity", Number(event.target.value))} className="mt-2 w-full accent-violet-500" /></label><KeyframeButton label="Opacidade" activeKeyframe={keyframeAt(clip, "opacity", localTime)} value={transform.opacity} property="opacity" easing={easing} onUpsert={onUpsertKeyframe} onDelete={onDeleteKeyframe} /></div>
        </InspectorSection>}

        <CreativeInspectorV2 clip={clip} selectionCount={selectionCount} onPatch={(patch) => onPatchClip(clip.id, patch)} />

        {clip.kind !== "audio" && <InspectorSection title="Keyframes">
          <div className="flex items-center gap-2"><KeyRound className="size-3.5 text-primary" /><label className="flex flex-1 items-center gap-2 text-[10px] text-muted-foreground">Interpolação<select aria-label="Interpolação de keyframe" value={easing} onChange={(event) => setEasing(event.target.value as Easing)} className="ml-auto h-8 rounded-lg border border-white/10 bg-black/25 px-2 text-[10px] text-foreground"><option value="linear">Linear</option><option value="easeIn">Entrada suave</option><option value="easeOut">Saída suave</option><option value="easeInOut">Suave</option></select></label></div>
          <div className="mt-3 space-y-1.5">{ANIMATABLE_PROPERTIES.map(({ property, label }) => { const animation = clip.animations.find((item) => item.property === property); return <div key={property} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5"><span className="w-20 truncate text-[10px]">{label}</span><div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{animation?.keyframes.map((keyframe) => <button key={keyframe.id} type="button" onClick={() => onSeek(Number(clip.projectStart) + Number(keyframe.time))} aria-label={`${label} em ${round(Number(keyframe.time))} segundos`} className="flex shrink-0 items-center gap-1 rounded bg-white/6 px-1.5 py-1 text-[9px] text-muted-foreground hover:text-white"><Diamond className="size-2.5 fill-current" />{round(Number(keyframe.time))}s</button>) ?? <span className="py-1 text-[9px] text-muted-foreground">Estático</span>}</div><span className="text-[9px] tabular-nums text-muted-foreground">{animation?.keyframes.length ?? 0}</span></div>; })}</div>
        </InspectorSection>}

        {clip.kind === "audio" && clip.audio && <InspectorSection title="Áudio">
          <div className="flex items-center justify-between"><div><p className="text-[11px] font-medium">Mix do clipe</p><p className="mt-0.5 text-[9px] text-muted-foreground">Preview e export usam estes valores.</p></div><button type="button" aria-pressed={clip.audio.muted} onClick={() => onPatchClip(clip.id, { audio: { ...clip.audio!, muted: !clip.audio!.muted } })} className={`h-8 rounded-lg px-2.5 text-[10px] font-semibold ${clip.audio.muted ? "bg-destructive/15 text-destructive" : "bg-white/6 text-foreground"}`}>{clip.audio.muted ? "Mudo" : "Ativo"}</button></div>
          <AudioRange label="Volume" value={clip.audio.gain} max={1.5} suffix={`${Math.round(clip.audio.gain * 100)}%`} onChange={(gain) => onPatchClip(clip.id, { audio: { ...clip.audio!, gain } })} />
          {track && <AudioRange label="Volume da faixa" value={track.gain} max={1.5} suffix={`${Math.round(track.gain * 100)}%`} onChange={(gain) => onTrackAudio({ gain })} />}
          <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="Fade in" value={clip.audio.fadeIn} suffix="s" min={0} onCommit={(fadeIn) => onPatchClip(clip.id, { audio: { ...clip.audio!, fadeIn } })} /><NumberField label="Fade out" value={clip.audio.fadeOut} suffix="s" min={0} onCommit={(fadeOut) => onPatchClip(clip.id, { audio: { ...clip.audio!, fadeOut } })} /></div>
          <label className="mt-3 block text-[10px] text-muted-foreground">Papel<select aria-label="Papel do áudio" value={clip.audio.stemRole ?? "music"} onChange={(event) => onPatchClip(clip.id, { audio: { ...clip.audio!, stemRole: event.target.value as "original" | "voice" | "music" | "sfx" } })} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-foreground"><option value="original">Áudio original</option><option value="voice">Voz / narração</option><option value="music">Música</option><option value="sfx">Efeito sonoro</option></select></label>
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3"><label className="flex items-center gap-2 text-[10px] text-foreground"><input type="checkbox" checked={audioSettings.duckingEnabled} onChange={(event) => onAudioSettings({ duckingEnabled: event.target.checked })} className="accent-violet-500" />Baixar música durante a narração</label>{audioSettings.duckingEnabled && <AudioRange label="Redução" value={audioSettings.duckAmount} max={0.9} suffix={`${Math.round(audioSettings.duckAmount * 100)}%`} onChange={(duckAmount) => onAudioSettings({ duckAmount })} />}</div>
          <div className="mt-4 flex items-center gap-2"><button type="button" onClick={() => onUpsertAudioEnvelope(clip.audio!.gain)} className="h-8 flex-1 rounded-lg bg-primary/18 px-2 text-[10px] font-semibold text-primary">Adicionar ponto em {round(localTime)}s</button><span className="text-[9px] text-muted-foreground">{clip.audio.envelope.length} pontos</span></div>
          <div className="mt-2 space-y-1">{clip.audio.envelope.map((point) => <div key={point.id} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5"><button type="button" onClick={() => onSeek(Number(clip.projectStart) + Number(point.time))} className="text-[9px] tabular-nums text-primary">{round(Number(point.time))}s</button><span className="flex-1 text-[9px] text-muted-foreground">{Math.round(point.gain * 100)}%</span><button type="button" aria-label={`Remover ponto de volume em ${round(Number(point.time))} segundos`} onClick={() => onDeleteAudioEnvelope(point.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button></div>)}</div>
        </InspectorSection>}

        {(clip.kind === "text" || clip.kind === "caption") && <InspectorSection title={clip.kind === "caption" ? "Legenda" : "Texto"}>
          <label className="block text-[10px] text-muted-foreground">Conteúdo<textarea key={`${clip.id}-${style.text}`} defaultValue={style.text ?? clip.name} onBlur={(event) => patchStyle({ text: event.target.value })} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-primary" /></label>
          <div className="mt-3 grid grid-cols-[1fr_82px] gap-2"><label className="text-[10px] text-muted-foreground">Fonte<select value={style.fontFamily ?? "Outfit"} onChange={(event) => patchStyle({ fontFamily: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-foreground"><option>Outfit</option><option>Figtree</option><option>Instrument Serif</option><option>JetBrains Mono</option></select></label><NumberField label="Tamanho" value={style.fontSize ?? 48} suffix="px" min={8} onCommit={(value) => patchStyle({ fontSize: value })} /></div>
          <div className="mt-3 flex items-center gap-1" role="group" aria-label="Alinhamento do texto">{([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([value, Icon]) => <button key={value} type="button" onClick={() => patchStyle({ align: value })} aria-pressed={(style.align ?? "center") === value} aria-label={`Alinhar à ${value === "left" ? "esquerda" : value === "right" ? "direita" : "centro"}`} className={`grid size-9 place-items-center rounded-lg ${style.align === value || !style.align && value === "center" ? "bg-primary/18 text-primary" : "bg-white/5 text-muted-foreground hover:text-white"}`}><Icon className="size-4" /></button>)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2"><ColorField label="Texto" value={style.color ?? "#f8f7ff"} onChange={(value) => patchStyle({ color: value })} /><ColorField label="Fundo" value={style.backgroundColor === "transparent" || !style.backgroundColor ? "#090b12" : style.backgroundColor.slice(0, 7)} onChange={(value) => patchStyle({ backgroundColor: value })} /><ColorField label="Contorno" value={style.strokeColor ?? "#000000"} onChange={(value) => patchStyle({ strokeColor: value })} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="Contorno" value={style.strokeWidth ?? 0} suffix="px" min={0} onCommit={(value) => patchStyle({ strokeWidth: value })} /><NumberField label="Espaçamento" value={style.letterSpacing ?? 0} suffix="px" onCommit={(value) => patchStyle({ letterSpacing: value })} /></div>
          <div className="mt-3 flex flex-wrap gap-2"><label className="flex items-center gap-1.5 text-[10px]"><input type="checkbox" checked={style.uppercase ?? false} onChange={(event) => patchStyle({ uppercase: event.target.checked })} className="accent-violet-500" />Caixa alta</label><label className="flex items-center gap-1.5 text-[10px]"><input type="checkbox" checked={style.shadow ?? false} onChange={(event) => patchStyle({ shadow: event.target.checked })} className="accent-violet-500" />Sombra</label></div>
        </InspectorSection>}

        {transitionContext && <InspectorSection title="Transição"><TransitionControls context={transitionContext} definitionId={transitionKind} duration={transitionDuration} easing={easing} onDefinition={setTransitionKind} onDuration={setTransitionDuration} onEasing={setEasing} onApply={onApplyTransition} onDelete={onDeleteTransition} onPreview={onPreviewTransition} /></InspectorSection>}

        <InspectorSection title="Tempo"><div className="grid grid-cols-2 gap-2"><NumberField label="Início" value={Number(clip.projectStart)} suffix="s" min={0} onCommit={() => undefined} disabled /><NumberField label="Duração" value={Number(clip.projectEnd) - Number(clip.projectStart)} suffix="s" min={0.04} onCommit={() => undefined} disabled /></div><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Ajuste início e duração diretamente na timeline.</p></InspectorSection>
      </div>
    </aside>
  );
}

function AnimatedNumberField(props: { label: string; property: AnimatableProperty; value: number; displayValue?: number; valueFromDisplay?: (value: number) => number; suffix: string; clip: Clip; localTime: number; easing: Easing; min?: number; onCommit: (value: number) => void; onUpsert: InspectorProps["onUpsertKeyframe"]; onDelete: InspectorProps["onDeleteKeyframe"] }) { const active = keyframeAt(props.clip, props.property, props.localTime); return <div className="flex items-end gap-1"><div className="min-w-0 flex-1"><NumberField label={props.label} value={props.displayValue ?? props.value} suffix={props.suffix} min={props.min} onCommit={(value) => props.onCommit(props.valueFromDisplay ? props.valueFromDisplay(value) : value)} /></div><KeyframeButton label={props.label} activeKeyframe={active} value={props.value} property={props.property} easing={props.easing} onUpsert={props.onUpsert} onDelete={props.onDelete} /></div>; }
function KeyframeButton({ label, activeKeyframe, value, property, easing, onUpsert, onDelete }: { label: string; activeKeyframe: { id: string } | undefined; value: number; property: AnimatableProperty; easing: Easing; onUpsert: InspectorProps["onUpsertKeyframe"]; onDelete: InspectorProps["onDeleteKeyframe"] }) { return <button type="button" aria-label={activeKeyframe ? `Remover keyframe de ${label}` : `Adicionar keyframe de ${label}`} aria-pressed={Boolean(activeKeyframe)} onClick={() => activeKeyframe ? onDelete(property, activeKeyframe.id) : onUpsert(property, value, easing)} className={`mb-px grid size-9 shrink-0 place-items-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeKeyframe ? "border-primary bg-primary/20 text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:text-white"}`}><Diamond className={`size-3 ${activeKeyframe ? "fill-current" : ""}`} /></button>; }
function keyframeAt(clip: Clip, property: AnimatableProperty, localTime: number) { return clip.animations.find((item) => item.property === property)?.keyframes.find((item) => Math.abs(Number(item.time) - localTime) < 1 / 60); }
function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-b border-white/8 py-4 last:border-0"><h3 className="mb-3 text-[11px] font-semibold text-foreground">{title}</h3>{children}</section>; }
function NumberField({ label, value, suffix, min, max, onCommit, disabled = false }: { label: string; value: number; suffix: string; min?: number | undefined; max?: number | undefined; onCommit: (value: number) => void; disabled?: boolean }) { const [draft, setDraft] = useState(String(round(value))); useEffect(() => setDraft(String(round(value))), [value]); const commit = () => { const next = Number(draft); if (Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) onCommit(next); else setDraft(String(round(value))); }; return <label className="text-[10px] text-muted-foreground">{label}<span className={`mt-1.5 flex h-9 items-center rounded-lg border border-white/10 bg-black/20 px-2 ${disabled ? "opacity-55" : "focus-within:border-primary"}`}><input disabled={disabled} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-xs tabular-nums text-foreground outline-none" /><span className="text-[9px]">{suffix}</span></span></label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 text-[10px] text-muted-foreground"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-5 cursor-pointer rounded border-0 bg-transparent" />{label}<span className="ml-auto font-mono text-[9px] text-foreground">{value}</span></label>; }
function AudioRange({ label, value, max, suffix, onChange }: { label: string; value: number; max: number; suffix: string; onChange: (value: number) => void }) { return <label className="mt-4 block text-[10px] text-muted-foreground">{label}<span className="float-right tabular-nums text-foreground">{suffix}</span><input type="range" min="0" max={max} step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-violet-500" /></label>; }
function TransitionLibraryInspector(props: { item: LibraryItem<TransitionDefinition>; context: TransitionContext | null; definitionId: string; duration: number; easing: Easing; onDefinition: (value: string) => void; onDuration: (value: number) => void; onEasing: (value: Easing) => void; onApply: InspectorProps["onApplyTransition"]; onDelete: InspectorProps["onDeleteTransition"]; onPreview: InspectorProps["onPreviewTransition"] }) {
  return <aside className="editor-v2-panel flex h-full min-h-0 flex-col" aria-label={`Configurar transição ${props.item.name}`}>
    <header className="editor-v2-panel-header px-4 py-3"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><div><h2 className="text-sm font-semibold">{props.item.name}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Configurar transição</p></div></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 vaiviral-scrollbar">
      <div className="overflow-hidden rounded-xl border border-primary/25 shadow-[0_0_28px_hsl(var(--primary)/.1)]"><LibraryPreview item={props.item} active /></div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{props.item.description}</p>
      <div className="mt-4"><TransitionControls {...props} /></div>
    </div>
  </aside>;
}

function TransitionControls({ context, definitionId, duration, easing, onDefinition, onDuration, onEasing, onApply, onDelete, onPreview }: { context: TransitionContext | null; definitionId: string; duration: number; easing: Easing; onDefinition: (value: string) => void; onDuration: (value: number) => void; onEasing: (value: Easing) => void; onApply: InspectorProps["onApplyTransition"]; onDelete: InspectorProps["onDeleteTransition"]; onPreview: InspectorProps["onPreviewTransition"] }) {
  const definition = TRANSITION_DEFINITIONS.find((item) => item.id === definitionId) ?? TRANSITION_DEFINITIONS[1]!;
  const isCut = definition.id === "cut";
  const maximum = Math.max(definition.durationMin, Math.min(definition.durationMax, context?.maxDuration ?? definition.durationMax));
  const safeDuration = isCut ? 0 : clampTransitionDuration(duration, definition.durationMin, maximum);
  const presets = [0.2, 0.35, 0.5, 0.75, 1].filter((value) => value >= definition.durationMin && value <= maximum + 0.001);
  const applyDisabled = !context || isCut && !context.existing;

  return <div>
    {context ? <button type="button" onClick={() => onPreview(context.boundary, safeDuration)} className="group w-full rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-primary/35 hover:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Scissors className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{context.from.name} → {context.to.name}</span><span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground"><Clock3 className="size-2.5" /> Corte em {formatTime(context.boundary)} · clique para visualizar</span></span><Play className="size-3.5 text-primary transition group-hover:scale-110" /></span>
    </button> : <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" /><div><p className="text-[10px] font-semibold text-amber-100">Nenhum corte encontrado</p><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">Posicione a agulha perto da junção entre dois clipes consecutivos.</p></div></div></div>}

    <label className="mt-4 block text-[10px] text-muted-foreground">Tipo<select aria-label="Tipo de transição" value={definition.id} onChange={(event) => { const next = TRANSITION_DEFINITIONS.find((item) => item.id === event.target.value)!; onDefinition(next.id); onDuration(clampTransitionDuration(next.durationDefault, next.durationMin, Math.min(next.durationMax, context?.maxDuration ?? next.durationMax))); }} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-primary">{TRANSITION_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{transitionLabel(item.id, item.name)}</option>)}</select></label>

    {!isCut && <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between"><label htmlFor="transition-duration" className="text-[10px] font-semibold text-foreground">Duração</label><span className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-semibold tabular-nums text-primary">{safeDuration.toFixed(2)} s</span></div>
      <input id="transition-duration" type="range" min={definition.durationMin} max={maximum} step="0.05" value={safeDuration} onChange={(event) => onDuration(Number(event.target.value))} className="mt-3 w-full accent-violet-500" />
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Durações rápidas">{presets.map((value) => <button key={value} type="button" aria-pressed={Math.abs(safeDuration - value) < 0.01} onClick={() => onDuration(value)} className={`min-h-7 rounded-md px-2 text-[9px] font-semibold ${Math.abs(safeDuration - value) < 0.01 ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"}`}>{value.toFixed(2)}s</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="Tempo exato" value={safeDuration} suffix="s" min={definition.durationMin} max={maximum} onCommit={(value) => onDuration(clampTransitionDuration(value, definition.durationMin, maximum))} /><label className="text-[10px] text-muted-foreground">Movimento<select aria-label="Curva da transição" value={easing} onChange={(event) => onEasing(event.target.value as Easing)} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-foreground outline-none focus:border-primary"><option value="easeInOut">Suave</option><option value="linear">Linear</option><option value="easeIn">Acelera</option><option value="easeOut">Desacelera</option></select></label></div>
      <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">Máximo neste corte: {maximum.toFixed(2)}s. O limite protege os dois clipes.</p>
    </div>}

    <button type="button" disabled={applyDisabled} onClick={() => onApply(definition.id, safeDuration, easing)} className="editor-primary-button mt-4 min-h-10 w-full rounded-lg px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{isCut ? context?.existing ? "Remover efeito e manter corte seco" : "Este ponto já é um corte seco" : context?.existing ? "Atualizar transição" : "Aplicar neste corte"}</button>
    {context?.existing && !isCut && <button type="button" onClick={() => onDelete(context.existing!.id)} className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-destructive/10 px-3 text-[10px] font-semibold text-destructive transition hover:bg-destructive/15"><Trash2 className="size-3" />Remover transição</button>}
  </div>;
}

function transitionLabel(id: string, fallback: string) {
  const labels: Record<string, string> = { cut: "Corte seco", "cross-dissolve": "Dissolver", fade: "Suavizar", "fade-black": "Fade para preto", "fade-white": "Fade para branco", "slide-left": "Deslizar à esquerda", "slide-right": "Deslizar à direita", "slide-up": "Deslizar para cima", "slide-down": "Deslizar para baixo", push: "Empurrar", wipe: "Varredura", blur: "Desfoque", "zoom-in": "Zoom de entrada", "zoom-out": "Zoom de saída" };
  return labels[id] ?? fallback;
}
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); const rest = seconds - minutes * 60; return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`; }
function LibraryInspector({ item, onAdd }: { item: LibraryItem; onAdd: () => void }) { return <aside className="editor-v2-panel flex h-full flex-col"><header className="editor-v2-panel-header px-4 py-3"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="text-sm font-semibold">{item.name}</h2></div><p className="mt-1 text-[11px] text-muted-foreground">{item.type} · {item.category}</p></header><div className="p-4"><p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p><button type="button" onClick={onAdd} className="editor-primary-button mt-5 h-9 w-full rounded-lg text-xs font-semibold text-primary-foreground">Inserir na agulha</button></div></aside>; }
function EmptyInspector() { return <aside className="editor-v2-panel grid h-full place-items-center p-6 text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-xl bg-white/5 text-muted-foreground"><SlidersHorizontal className="size-4" /></span><p className="mt-3 text-xs font-medium">Nada selecionado</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Selecione um item no canvas, na timeline ou na biblioteca.</p></div></aside>; }
function round(value: number) { return Math.round(value * 100) / 100; }
