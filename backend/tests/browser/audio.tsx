import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioPanel } from '@/components/editor/AudioPanel';
import { useAudioPreview } from '@/components/editor/useAudioPreview';
import { defaultEditorAudio } from '@/lib/editor/audio';
import { createTemplateDoc, createCutVideoLayer } from '@/lib/video-template/factory';
import { renderTemplateProject } from '@/lib/editor/render-template';

function TestEditor() {
  const [audio, setAudio] = useState(defaultEditorAudio());
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const previewError = useAudioPreview(video, url, audio);
  Object.assign(window, { audioSmokeState: audio });
  async function exportVideo() {
    if (!file) return;
    try {
      const doc = createTemplateDoc('Audio smoke');
      doc.canvas.width = 270; doc.canvas.height = 480;
      doc.layers = [createCutVideoLayer([])];
      const blob = await renderTemplateProject({ doc, file, audio, fps: 15, cut: { start: 0, end: 5 } });
      setResult(URL.createObjectURL(blob));
    } catch (e) { setError(String(e)); }
  }
  return <>
    <h1>Teste real Hostear — 5 segundos</h1>
    <p>Componentes reais; ticket de teste assinado. Login, biblioteca de sons e narração fora deste teste.</p>
    <input aria-label="Vídeo de teste" type="file" onChange={e => {
      const next = e.target.files?.[0]; if (next) { setFile(next); setUrl(URL.createObjectURL(next)); }
    }} />
    <video ref={video} src={url || undefined} controls />
    <div role="alert">{previewError || error}</div>
    <AudioPanel audio={audio} onChange={setAudio} getSourceFile={async () => file} currentTime={0} />
    <button onClick={exportVideo}>Exportar teste</button>
    {result && <a href={result} download="voz-exportada-editor.mp4">Baixar exportação</a>}
  </>;
}
createRoot(document.getElementById('root')!).render(<TestEditor />);
