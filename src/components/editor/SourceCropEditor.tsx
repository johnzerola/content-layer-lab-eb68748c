import { useEffect, useRef, useState } from 'react';
import type { PreCrop } from '@/lib/preedit';
import { dragCrop } from '@/lib/editor/crop-controls';
import { watchVideoPaint } from '@/lib/editor/preview-paint';
import { useInView } from '@/hooks/use-in-view';

/** Source-space selection: coordinates remain independent of the output layout/rotation. */
export function SourceCropEditor({ videoRef, crop, onChange }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  crop: PreCrop;
  onChange: (crop: PreCrop) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const inView = useInView(containerRef);
  const [draft, setDraft] = useState<PreCrop | null>(null);
  const draftRef = useRef<PreCrop | null>(null);
  const selection = draft ?? crop;
  const finishDrag = () => {
    if (drag.current && draftRef.current) onChange(draftRef.current);
    drag.current = null; draftRef.current = null; setDraft(null);
  };
  const drag = useRef<{ x: number; y: number; crop: PreCrop; handle: string } | null>(null);

  useEffect(() => {
    if (!inView) return;
    let previousBounds = { x: 0, y: 0, w: 0, h: 0 };
    let wasReady = false;
    const tick = () => {
      const canvas = canvasRef.current;
      const box = containerRef.current;
      const video = videoRef.current;
      if (canvas && box && video && video.readyState >= 2 && video.videoWidth) {
        const w = box.clientWidth; const h = box.clientHeight;
        const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
        const vw = video.videoWidth * scale; const vh = video.videoHeight * scale;
        const next = { x: (w - vw) / 2, y: (h - vh) / 2, w: vw, h: vh };
        if (next.x !== previousBounds.x || next.y !== previousBounds.y || next.w !== previousBounds.w || next.h !== previousBounds.h) {
          previousBounds = next; setBounds(next);
        }
        if (!wasReady) { wasReady = true; setReady(true); }
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.clearRect(0, 0, w, h); ctx.drawImage(video, next.x, next.y, vw, vh); }
      }
    };
    const painter = watchVideoPaint(videoRef.current, tick);
    const resize = new ResizeObserver(painter.invalidate);
    if (containerRef.current) resize.observe(containerRef.current);
    return () => { resize.disconnect(); painter.dispose(); };
  }, [videoRef, inView]);

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  return <div ref={containerRef} className="absolute inset-0 z-20 overflow-hidden bg-black" aria-label="Recorte interativo do vídeo original">
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    {!ready && <p className="absolute inset-0 grid place-items-center p-5 text-center text-sm text-white">Carregue um vídeo para recortar.</p>}
    {ready && <div className="absolute" style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}>
      <div role="group" aria-label="Área selecionada. Arraste para mover ou use as alças para redimensionar." className="absolute touch-none cursor-move border-2 border-violet-400" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.w * 100}%`, height: `${selection.h * 100}%`, boxShadow: '0 0 0 2000px rgb(0 0 0 / 60%)' }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault();
          const target = e.target as HTMLElement;
          drag.current = { x: e.clientX, y: e.clientY, crop, handle: target.dataset['handle'] ?? 'move' };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { const d = drag.current; if (d && bounds.w && bounds.h) { const next = dragCrop(d.crop, d.handle, (e.clientX - d.x) / bounds.w, (e.clientY - d.y) / bounds.h); draftRef.current = next; setDraft(next); } }}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
        {[1, 2].map(n => <div key={n} className="pointer-events-none absolute inset-0"><div className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${n * 100 / 3}%` }} /><div className="absolute inset-x-0 h-px bg-white/40" style={{ top: `${n * 100 / 3}%` }} /></div>)}
        {handles.map(handle => <span key={handle} data-handle={handle} className="absolute size-4 rounded-sm border-2 border-white bg-violet-500" style={{ left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%', top: handle.includes('n') ? 0 : handle.includes('s') ? '100%' : '50%', transform: 'translate(-50%, -50%)', cursor: `${handle}-resize` }} />)}
      </div>
    </div>}
    <p className="pointer-events-none absolute inset-x-2 top-2 z-10 rounded bg-black/80 p-2 text-center text-xs text-white">Vídeo original · arraste a área ou as 8 alças</p>
  </div>;
}
