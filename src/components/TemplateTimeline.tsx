import { useState } from 'react';
import { Pause, Play, Plus, Scissors, Maximize, Trash2 } from 'lucide-react';
import type { BoxLayer, SelId, Template, TextLayer } from '@/lib/template';
import { layerOf, LAYER_LABELS, selectableIds } from './TemplateCanvas';

const keys: Record<string, string> = { name: 'name_' };
function patchLayer(t: Template, id: string, patch: Partial<BoxLayer>): Template {
  if (id.startsWith('extra:')) return { ...t, extras: (t.extras ?? []).map(e => `extra:${e.id}` === id ? { ...e, ...patch } : e) };
  const key = keys[id] ?? id;
  return { ...t, [key]: { ...(t[key as keyof Template] as BoxLayer), ...patch } };
}

export function TemplateTimeline({ template: t, onChange, selected, onSelect, time, onSeek, playing, onPlay, duration, onDuration }: {
  template: Template; onChange: (t: Template) => void; selected: SelId | null; onSelect: (id: SelId) => void;
  time: number; onSeek: (n: number) => void; playing: boolean; onPlay: () => void; duration: number; onDuration: (n: number) => void;
}) {
  const [fullId, setFullId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const layer = selected ? layerOf(t, selected) as BoxLayer | null : null;
  const full = t.fullscreenClips?.find(c => c.id === fullId);
  const changeLayer = (patch: Partial<BoxLayer>) => selected && onChange(patchLayer(t, selected, patch));
  const changeFull = (patch: Partial<NonNullable<Template['fullscreenClips']>[number]>) => onChange({ ...t, fullscreenClips: (t.fullscreenClips ?? []).map(c => c.id === fullId ? { ...c, ...patch } : c) });
  const addText = (split: boolean) => {
    const base = layer && 'text' in layer ? layer as TextLayer : t.headline;
    const start = split ? time : Math.min(time, duration - 0.1);
    const end = Math.min(base.tEnd ?? duration, duration);
    if (split && (start <= (base.tStart ?? 0) || start >= end)) return;
    const id = crypto.randomUUID();
    const next = split && selected ? patchLayer(t, selected, { tEnd: start }) : t;
    onChange({ ...next, extras: [...(next.extras ?? []), { ...base, id, label: 'Frase', text: split ? base.text : 'Nova frase', visible: true, tStart: start, tEnd: split ? end : Math.min(duration, start + 5), fadeIn: 0.3, fadeOut: 0.3 }] });
    onSelect(`extra:${id}`); setFullId(null);
  };
  const number = (label: string, value: number, max: number, update: (n: number) => void, min = 0) => <label className="space-y-1 text-xs text-muted-foreground">{label}<input aria-label={label} className="field w-full text-sm" type="number" min={min} max={max} step="0.1" value={Number(value.toFixed(2))} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) update(Math.max(min, Math.min(max, e.target.valueAsNumber))); }} /></label>;
  const rows = selectableIds(t).filter(id => layerOf(t, id)?.visible).map(id => {
    const l = layerOf(t, id) as BoxLayer;
    return { id, label: id.startsWith('extra:') ? (t.extras?.find(e => `extra:${e.id}` === id)?.label ?? 'Frase') : LAYER_LABELS[id as keyof typeof LAYER_LABELS], start: l.tStart ?? 0, end: l.tEnd ?? duration, full: false };
  });
  rows.push(...(t.fullscreenClips ?? []).map(c => ({ id: c.id, label: 'Vídeo em tela cheia', start: c.start, end: c.end, full: true })));
  return <section className="space-y-3 rounded-xl border border-border bg-surface-2 p-3" aria-label="Timeline do template">
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-primary px-3 py-2" onClick={onPlay} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <span className="font-mono text-xs">{time.toFixed(1)} / {duration.toFixed(1)} s</span>
      <button className="btn-ghost text-xs" onClick={() => addText(false)}><Plus size={14} /> Frase</button>
      <button className="btn-ghost text-xs" disabled={!layer || !('text' in layer) || time <= (layer.tStart ?? 0) || time >= (layer.tEnd ?? duration)} onClick={() => addText(true)}><Scissors size={14} /> Dividir frase</button>
      <button className="btn-ghost text-xs" onClick={() => { const id = crypto.randomUUID(); onChange({ ...t, fullscreenClips: [...(t.fullscreenClips ?? []), { id, start: Math.min(time, duration - 0.1), end: duration, fade: 0.5 }] }); setFullId(id); }}><Maximize size={14} /> Tela cheia</button>
      <label className="ml-auto text-xs">Zoom <select aria-label="Zoom da timeline" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="field w-16"><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
    </div>
    <div className="max-h-64 overflow-auto rounded-lg border border-border">
      <div style={{ minWidth: `${zoom * 100}%` }}>
        <div className="flex h-9 items-center border-b border-border"><span className="w-28 shrink-0 px-2 text-xs">Camadas</span><div className="relative mx-2 flex-1"><input aria-label="Posição na timeline" type="range" min={0} max={duration} step={0.01} value={time} onChange={e => onSeek(Number(e.target.value))} className="w-full accent-[var(--primary)]" /><div className="flex justify-between font-mono text-[10px] text-muted-foreground">{[0, 1, 2, 3, 4].map(n => <span key={n}>{(duration * n / 4).toFixed(1)}s</span>)}</div></div></div>
        {rows.map(row => <div key={row.id} className="flex h-10 items-center border-b border-border/50"><button className="w-28 shrink-0 truncate px-2 text-left text-xs" onClick={() => { setFullId(row.full ? row.id : null); if (!row.full) onSelect(row.id); }}>{row.label}</button><div className="relative mx-2 h-7 flex-1 bg-background/50" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(duration, (e.clientX - r.left) / r.width * duration))); }}>
          <button title="Arraste para mover o intervalo; ajuste início e fim abaixo" aria-label={`Mover ${row.label}`} className={`absolute top-0 h-full touch-none truncate rounded border px-2 text-left text-[10px] ${row.full ? 'bg-sky-500/25 border-sky-400' : 'bg-primary/25 border-primary/60'} ${(row.full ? fullId === row.id : !fullId && selected === row.id) ? 'ring-2 ring-primary' : ''}`} style={{ left: `${Math.min(100, row.start / duration * 100)}%`, width: `${Math.max(0, Math.min(duration, row.end) - row.start) / duration * 100}%` }} onClick={e => e.stopPropagation()} onPointerDown={e => {
            e.stopPropagation(); setFullId(row.full ? row.id : null); if (!row.full) onSelect(row.id);
            const node = e.currentTarget; const x = e.clientX; const width = node.parentElement!.getBoundingClientRect().width;
            const rect = node.getBoundingClientRect();
            const edge = x - rect.left < 8 ? 'start' : rect.right - x < 8 ? 'end' : 'move';
            const originalLeft = node.style.left; const originalWidth = node.style.width;
            const interval = (clientX: number) => {
              const delta = Math.round((clientX - x) / width * duration * 10) / 10;
              const end = Math.min(duration, row.end);
              if (edge === 'start') return { start: Math.max(0, Math.min(end - 0.1, row.start + delta)), end };
              if (edge === 'end') return { start: row.start, end: Math.min(duration, Math.max(row.start + 0.1, end + delta)) };
              const length = Math.min(duration, row.end - row.start);
              const start = Math.max(0, Math.min(duration - length, row.start + delta));
              return { start, end: start + length };
            };
            node.setPointerCapture(e.pointerId);
            const reset = () => { node.style.left = originalLeft; node.style.width = originalWidth; node.onpointermove = null; node.onpointerup = null; node.onpointercancel = null; };
            node.onpointermove = ev => { const span = interval(ev.clientX); node.style.left = `${span.start / duration * 100}%`; node.style.width = `${(span.end - span.start) / duration * 100}%`; };
            node.onpointercancel = reset;
            node.onpointerup = ev => { const span = interval(ev.clientX);
              reset();
              if (Math.abs(ev.clientX - x) > 3) { if (row.full) onChange({ ...t, fullscreenClips: (t.fullscreenClips ?? []).map(c => c.id === row.id ? { ...c, ...span } : c) }); else onChange(patchLayer(t, row.id, { tStart: span.start, tEnd: span.end })); }
            };
          }}><span className="absolute inset-y-1 left-0 w-1.5 cursor-ew-resize rounded bg-white/30" />{row.start.toFixed(1)}–{Math.min(duration, row.end).toFixed(1)}s<span className="absolute inset-y-1 right-0 w-1.5 cursor-ew-resize rounded bg-white/30" /></button>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${time / duration * 100}%` }} />
        </div></div>)}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {full ? <>{number('Início (s)', full.start, full.end - 0.1, n => changeFull({ start: n }))}{number('Fim (s)', full.end, duration, n => changeFull({ end: n }), full.start + 0.1)}{number('Transição suave (s)', full.fade, (full.end - full.start) / 2, n => changeFull({ fade: n }))}<button className="btn-ghost text-xs" onClick={() => { onChange({ ...t, fullscreenClips: (t.fullscreenClips ?? []).filter(c => c.id !== full.id) }); setFullId(null); }}><Trash2 size={14} /> Remover trecho</button></> : layer ? <>{number('Início (s)', layer.tStart ?? 0, (layer.tEnd ?? duration) - 0.1, n => changeLayer({ tStart: n }))}{number('Fim (s)', layer.tEnd ?? duration, duration, n => changeLayer({ tEnd: n }), (layer.tStart ?? 0) + 0.1)}{number('Fade de entrada (s)', layer.fadeIn ?? 0, ((layer.tEnd ?? duration) - (layer.tStart ?? 0)) / 2, n => changeLayer({ fadeIn: n }))}{number('Fade de saída (s)', layer.fadeOut ?? 0, ((layer.tEnd ?? duration) - (layer.tStart ?? 0)) / 2, n => changeLayer({ fadeOut: n }))}</> : null}
    </div>
    {!full && layer && 'text' in layer && <label className="block text-xs text-muted-foreground">Texto da frase<input className="field mt-1 w-full" value={String(layer.text)} onChange={e => changeLayer({ text: e.target.value } as Partial<TextLayer>)} /></label>}
    <div className="flex items-end gap-3">{number('Duração de referência (s)', duration, 7200, onDuration, 0.1)}<p className="pb-2 text-[11px] text-muted-foreground">Arraste os blocos para mover. Selecione para ajustar os tempos. Tela cheia oculta as outras camadas e retorna ao layout no fim do trecho. Transição 0 = corte seco.</p></div>
  </section>;
}
