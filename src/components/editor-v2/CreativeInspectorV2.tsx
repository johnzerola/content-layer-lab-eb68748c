import { useState } from "react";
import { Check, FlipHorizontal2, FlipVertical2, Rewind, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { NEUTRAL_VIDEO_ADJUSTMENTS, videoAdjustmentFilter, type Clip, type ClipMotionSettings, type EffectInstance, type MotionPreset, type MotionSlot, type VideoAdjustments } from "@/lib/editor-v2";

const motionOptions: Record<MotionSlot, { id: string; label: string }[]> = {
  in: [{ id: "fade", label: "Fade" }, { id: "slide-left", label: "Deslizar da esquerda" }, { id: "slide-right", label: "Deslizar da direita" }, { id: "slide-up", label: "Subir" }, { id: "zoom", label: "Zoom" }, { id: "pop", label: "Pop" }, { id: "spin", label: "Giro" }, { id: "bounce", label: "Bounce" }],
  out: [{ id: "fade", label: "Fade" }, { id: "slide-left", label: "Sair à esquerda" }, { id: "slide-right", label: "Sair à direita" }, { id: "slide-down", label: "Descer" }, { id: "zoom", label: "Zoom" }, { id: "spin", label: "Giro" }],
  loop: [{ id: "float", label: "Flutuar" }, { id: "pulse", label: "Pulso" }, { id: "gentle-zoom", label: "Zoom contínuo" }, { id: "bounce", label: "Quicar" }, { id: "shake", label: "Tremor" }],
};

const adjustmentFields: Array<{ key: keyof VideoAdjustments; label: string; min: number; max: number; step: number }> = [
  { key: "exposure", label: "Exposição", min: -1, max: 1, step: .01 }, { key: "brightness", label: "Brilho", min: -1, max: 1, step: .01 },
  { key: "contrast", label: "Contraste", min: -1, max: 1, step: .01 }, { key: "saturation", label: "Saturação", min: -1, max: 1, step: .01 },
  { key: "temperature", label: "Temperatura", min: -1, max: 1, step: .01 }, { key: "tint", label: "Matiz", min: -1, max: 1, step: .01 },
  { key: "highlights", label: "Realces", min: -1, max: 1, step: .01 }, { key: "shadows", label: "Sombras", min: -1, max: 1, step: .01 },
  { key: "fade", label: "Desbotar", min: 0, max: 1, step: .01 }, { key: "sharpen", label: "Nitidez", min: 0, max: 1, step: .01 },
  { key: "vignette", label: "Vinheta", min: 0, max: 1, step: .01 }, { key: "grain", label: "Grão", min: 0, max: 1, step: .01 },
  { key: "blur", label: "Desfoque", min: 0, max: 12, step: .1 },
];

const adjustmentPresets: Array<{ id: string; label: string; hint: string; colors: [string, string]; patch: Partial<VideoAdjustments> }> = [
  { id: "clean", label: "Natural", hint: "Limpo e equilibrado", colors: ["#e7b36d", "#536d85"], patch: {} },
  { id: "vivid", label: "Vibrante", hint: "Mais cor para social", colors: ["#ff6b63", "#7357ff"], patch: { saturation: .38, contrast: .12, brightness: .04 } },
  { id: "portrait", label: "Retrato", hint: "Pele e luz suaves", colors: ["#f3b58f", "#825f74"], patch: { contrast: -.1, highlights: -.18, shadows: .2, temperature: .12, fade: .08 } },
  { id: "cinema", label: "Cinema", hint: "Contraste e profundidade", colors: ["#d3975d", "#243b54"], patch: { contrast: .26, saturation: -.12, highlights: -.2, shadows: .1, vignette: .25 } },
  { id: "neon", label: "Neon", hint: "Noite intensa", colors: ["#ff4eb8", "#234cff"], patch: { exposure: -.12, contrast: .3, saturation: .45, tint: .35 } },
  { id: "golden", label: "Dourado", hint: "Calor e destaque", colors: ["#ffc95f", "#a95439"], patch: { temperature: .55, saturation: .12, highlights: -.08 } },
  { id: "urban", label: "Urbano", hint: "Azul cinematográfico", colors: ["#4fbbd8", "#30365f"], patch: { temperature: -.5, tint: -.08, contrast: .18 } },
  { id: "mono", label: "P&B", hint: "Clássico com textura", colors: ["#e7e7ea", "#30333a"], patch: { saturation: -1, contrast: .22, grain: .08 } },
];

export function CreativeInspectorV2({ clip, onPatch }: { clip: Clip; onPatch: (patch: Partial<Clip>) => void }) {
  const [tab, setTab] = useState<"basic" | "speed" | "motion" | "adjust" | "effects">("basic");
  if (!["video", "image", "sticker", "shape"].includes(clip.kind)) return null;
  const tabs: Array<{ id: "basic" | "speed" | "motion" | "adjust" | "effects"; label: string }> = [{ id: "basic", label: "Básico" }, ...(clip.kind === "video" ? [{ id: "speed" as const, label: "Velocidade" }] : []), { id: "motion", label: "Animação" }, ...(clip.kind === "video" || clip.kind === "image" ? [{ id: "adjust" as const, label: "Ajuste" }, { id: "effects" as const, label: "Efeitos" }] : [])];
  const adjustments = { ...NEUTRAL_VIDEO_ADJUSTMENTS, ...clip.adjustments };
  const setSpeed = (playbackRate: number) => onPatch({ playbackRate, projectEnd: (Number(clip.projectStart) + (clip.sourceOut - clip.sourceIn) / Math.max(.05, playbackRate)) as Clip["projectEnd"] });
  return <section className="border-b border-white/8 py-4">
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-3 vaiviral-scrollbar" role="tablist" aria-label="Propriedades criativas">
      {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`editor-creative-tab shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${tab === item.id ? "is-active text-primary" : "text-muted-foreground hover:text-white"}`}>{item.label}</button>)}
    </div>
    {tab === "basic" && <div className="space-y-3">
      <Toggle label="Visível" checked={clip.enabled} onChange={(enabled) => onPatch({ enabled })} />
      {(clip.kind === "video" || clip.kind === "image") && <div className="grid grid-cols-2 gap-2">
        <ActionToggle label="Espelhar horizontal" active={Boolean(clip.flipHorizontal)} onClick={() => onPatch({ flipHorizontal: !clip.flipHorizontal })}><FlipHorizontal2 /></ActionToggle>
        <ActionToggle label="Espelhar vertical" active={Boolean(clip.flipVertical)} onClick={() => onPatch({ flipVertical: !clip.flipVertical })}><FlipVertical2 /></ActionToggle>
        {clip.kind === "video" && <ActionToggle label="Reverter vídeo" active={Boolean(clip.reversed)} onClick={() => onPatch({ reversed: !clip.reversed })} className="col-span-2"><Rewind /></ActionToggle>}
      </div>}
      {clip.kind === "video" && clip.reversed && <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[9px] leading-relaxed text-amber-100/80">O vídeo será reproduzido do fim para o início. O áudio incorporado fica silencioso; trilhas de voz e música extraídas continuam editáveis.</p>}
      {clip.sticker && <><label className="block text-[10px] text-muted-foreground">Texto<input value={clip.sticker.text} onChange={(event) => onPatch({ sticker: { ...clip.sticker!, text: event.target.value } })} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-foreground" /></label><div className="grid grid-cols-2 gap-2"><Color label="Principal" value={clip.sticker.color} onChange={(color) => onPatch({ sticker: { ...clip.sticker!, color } })} /><Color label="Contraste" value={clip.sticker.accent} onChange={(accent) => onPatch({ sticker: { ...clip.sticker!, accent } })} /></div><Range label="Velocidade da animação" value={clip.sticker.speed} min={.25} max={3} step={.05} onChange={(speed) => onPatch({ sticker: { ...clip.sticker!, speed } })} /></>}
    </div>}
    {tab === "speed" && <div>
      <button type="button" onClick={() => setSpeed(.5)} aria-pressed={Math.abs(clip.playbackRate - .5) < .001} className="editor-speed-hero mb-3 flex w-full items-center gap-3 rounded-xl border border-cyan-300/20 p-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-300/12 text-cyan-200"><Rewind className="size-4" /></span><span><span className="block text-[10px] font-semibold text-foreground">Câmera lenta suave</span><span className="mt-0.5 block text-[9px] text-muted-foreground">Aplica 0,5× e duplica a duração do trecho.</span></span>
      </button>
      <Range label="Velocidade" value={clip.playbackRate} min={.1} max={4} step={.05} display={`${clip.playbackRate.toFixed(2)}×`} onChange={setSpeed} />
      <div className="mt-3 grid grid-cols-6 gap-1">{[.25, .5, .75, 1, 1.5, 2].map((speed) => <button key={speed} type="button" onClick={() => setSpeed(speed)} className={`h-8 rounded-lg text-[10px] ${Math.abs(clip.playbackRate - speed) < .001 ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:bg-white/8 hover:text-white"}`}>{speed}×</button>)}</div>
      <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">A prévia, a duração e a exportação usam a mesma velocidade do projeto.</p>
    </div>}
    {tab === "motion" && <MotionEditor motion={clip.motion ?? {}} onChange={(motion) => onPatch({ motion })} />}
    {tab === "adjust" && <AdjustmentEditor adjustments={adjustments} onChange={(next) => onPatch({ adjustments: next })} />}
    {tab === "effects" && <EffectStack effects={clip.effects} onChange={(effects) => onPatch({ effects })} />}
  </section>;
}

function MotionEditor({ motion, onChange }: { motion: ClipMotionSettings; onChange: (motion: ClipMotionSettings) => void }) {
  const [slot, setSlot] = useState<MotionSlot>("in");
  const patch = (slot: MotionSlot, value: MotionPreset | null) => onChange({ ...motion, [slot]: value });
  const current = motion[slot];
  return <div>
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1" role="tablist" aria-label="Etapa da animação">
      {(["in", "out", "loop"] as MotionSlot[]).map((value) => <button key={value} type="button" role="tab" aria-selected={slot === value} onClick={() => setSlot(value)} className={`h-8 rounded-lg text-[10px] font-semibold transition ${slot === value ? "bg-primary/20 text-primary shadow-[inset_0_0_0_1px_oklch(0.72_0.2_292/.3)]" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}>{value === "in" ? "Entrada" : value === "out" ? "Saída" : "Loop"}{motion[value] && <span className="ml-1 text-[8px] text-emerald-400">●</span>}</button>)}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <MotionCard label="Sem animação" motionId="none" active={!current} onClick={() => patch(slot, null)} />
      {motionOptions[slot].map((option) => <MotionCard key={option.id} label={option.label} motionId={option.id} active={current?.id === option.id} onClick={() => patch(slot, { id: option.id, duration: slot === "loop" ? 1.6 : .55, intensity: 1, easing: "easeOut" })} />)}
    </div>
    {current && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.055] p-3"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary"><Sparkles className="size-3.5" />Ajustar movimento</div><Range label="Duração" value={current.duration} min={.15} max={slot === "loop" ? 5 : 2} step={.05} display={`${current.duration.toFixed(2)}s`} onChange={(duration) => patch(slot, { ...current, duration })} /><Range label="Intensidade" value={current.intensity} min={.2} max={2} step={.05} display={`${Math.round(current.intensity * 100)}%`} onChange={(intensity) => patch(slot, { ...current, intensity })} /></div>}
  </div>;
}

function MotionCard({ label, motionId, active, onClick }: { label: string; motionId: string; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`editor-motion-card relative min-h-20 overflow-hidden rounded-xl border p-2 text-left ${active ? "is-active border-primary/70" : "border-white/8"}`}>
    <span className="editor-motion-preview mb-2 grid h-9 place-items-center rounded-lg" data-motion={motionId} aria-hidden><i /></span>
    <span className="block truncate text-[9px] font-semibold text-foreground">{label}</span>
    {active && <Check className="absolute right-2 top-2 size-3.5 text-primary" />}
  </button>;
}

function AdjustmentEditor({ adjustments, onChange }: { adjustments: VideoAdjustments; onChange: (value: VideoAdjustments) => void }) {
  return <div>
    <div className="mb-2 flex items-center justify-between"><div><p className="text-[10px] font-semibold">Looks rápidos</p><p className="mt-0.5 text-[9px] text-muted-foreground">Aplique e continue ajustando.</p></div><button type="button" onClick={() => onChange({ ...NEUTRAL_VIDEO_ADJUSTMENTS })} className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] text-muted-foreground hover:bg-white/5 hover:text-white"><RotateCcw className="size-3" />Redefinir</button></div>
    <div className="grid grid-cols-2 gap-2">
      {adjustmentPresets.map((preset) => { const value = { ...NEUTRAL_VIDEO_ADJUSTMENTS, ...preset.patch }; const active = sameAdjustments(adjustments, value); return <button key={preset.id} type="button" aria-pressed={active} onClick={() => onChange(value)} className={`editor-look-card overflow-hidden rounded-xl border text-left ${active ? "is-active border-primary/70" : "border-white/8"}`}>
        <span className="relative block h-14 overflow-hidden" style={{ background: `linear-gradient(135deg,${preset.colors[0]},${preset.colors[1]})` }}><span className="absolute inset-0 bg-[radial-gradient(circle_at_68%_26%,rgba(255,255,255,.72)_0_6%,transparent_7%),linear-gradient(150deg,transparent_35%,rgba(5,8,18,.38)_36%_100%)]" style={{ filter: videoAdjustmentFilter(value) }} />{active && <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-white shadow-lg"><Check className="size-3" /></span>}</span>
        <span className="block px-2 py-2"><span className="block text-[10px] font-semibold text-foreground">{preset.label}</span><span className="mt-0.5 block truncate text-[8px] text-muted-foreground">{preset.hint}</span></span>
      </button>; })}
    </div>
    <details className="editor-adjust-details mt-3 rounded-xl border border-white/8 bg-white/[0.02]"><summary className="cursor-pointer select-none px-3 py-2.5 text-[10px] font-semibold text-foreground">Ajuste manual <span className="float-right font-normal text-muted-foreground">13 controles</span></summary><div className="border-t border-white/8 px-3 pb-3">{adjustmentFields.map((field) => <Range key={field.key} label={field.label} value={adjustments[field.key]} min={field.min} max={field.max} step={field.step} display={field.key === "blur" ? adjustments[field.key].toFixed(1) : `${Math.round(adjustments[field.key] * 100)}`} onChange={(value) => onChange({ ...adjustments, [field.key]: value })} />)}</div></details>
  </div>;
}

function sameAdjustments(a: VideoAdjustments, b: VideoAdjustments) { return adjustmentFields.every(({ key }) => Math.abs(a[key] - b[key]) < .001); }

function EffectStack({ effects, onChange }: { effects: EffectInstance[]; onChange: (effects: EffectInstance[]) => void }) {
  if (!effects.length) return <div className="rounded-xl border border-dashed border-white/10 p-4 text-center"><p className="text-[10px] font-medium">Nenhum efeito aplicado</p><p className="mt-1 text-[9px] text-muted-foreground">Selecione um efeito na biblioteca para aplicá-lo ao clipe.</p></div>;
  return <div className="space-y-2">{effects.map((effect) => <div key={effect.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-2.5"><div className="flex items-center gap-2"><button type="button" aria-pressed={effect.enabled} onClick={() => onChange(effects.map((item) => item.id === effect.id ? { ...item, enabled: !item.enabled } : item))} className={`h-7 rounded-md px-2 text-[9px] ${effect.enabled ? "bg-primary/18 text-primary" : "bg-white/5 text-muted-foreground"}`}>{effect.enabled ? "Ativo" : "Desligado"}</button><span className="flex-1 text-[10px] font-medium">{effect.definitionId}</span><button type="button" aria-label={`Remover ${effect.definitionId}`} onClick={() => onChange(effects.filter((item) => item.id !== effect.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button></div><Range label="Intensidade" value={Number(effect.parameters["intensity"] ?? .6)} min={.1} max={1} step={.05} onChange={(intensity) => onChange(effects.map((item) => item.id === effect.id ? { ...item, parameters: { ...item.parameters, intensity } } : item))} /></div>)}</div>;
}

function Range({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display?: string; onChange: (value: number) => void }) { return <label className="mt-3 block text-[9px] text-muted-foreground"><span>{label}</span><span className="float-right tabular-nums text-foreground">{display ?? Math.round(value * 100)}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full accent-violet-500" /></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between text-[10px]"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-violet-500" /></label>; }
function ActionToggle({ label, active, className = "", onClick, children }: { label: string; active: boolean; className?: string; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`editor-clip-action flex min-h-14 items-center gap-2 rounded-xl border px-2.5 text-left text-[9px] font-medium ${active ? "is-active border-primary/60 text-white" : "border-white/8 text-muted-foreground"} ${className}`}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/6 [&>svg]:size-3.5">{children}</span>{label}</button>; }
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 text-[9px] text-muted-foreground"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-5 border-0 bg-transparent" />{label}</label>; }
