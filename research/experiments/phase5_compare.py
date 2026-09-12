"""Synchronized motion comparators; commercial reference never enters inference."""
import json
from pathlib import Path
import subprocess
import cv2
import numpy as np
from phase5_prepare import OUT, ROI, TARGET, CONTEXT, save
from phase23_color import Reader, TO_YUV_709, digest


def movie(path,frames):
    h,w=frames[0].shape[:2]
    cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}',
         '-r','30','-i','pipe:0','-vf',TO_YUV_709,'-an','-c:v','libx264','-crf','14',
         '-preset','slow','-threads','2','-color_range','tv','-colorspace','bt709',
         '-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(path)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    # Four repeats aid motion viewing; no interpolation or independent retiming.
    for _ in range(4):
        for frame in frames:
            p.stdin.write(frame.tobytes())
    p.stdin.close()
    assert p.wait()==0


def panel(img,text):
    header=np.full((32,img.shape[1],3),20,np.uint8)
    cv2.putText(header,text,(8,22),cv2.FONT_HERSHEY_SIMPLEX,.5,(240,240,240),1,cv2.LINE_AA)
    return np.concatenate([header,img],axis=0)


def main():
    root=OUT/'comparison'
    root.mkdir(exist_ok=True)
    # Preserve temporal cadence: one constant, validated -3-frame offset.
    # Nearest per-frame appearance match differs by 1 on frame124 and repeats122;
    # do not duplicate a reference frame in motion to improve still similarity.
    reader=Reader(Path('G:/dowloand/teste/VMAKE.IA.mp4'),yuv709=True)
    refs={}
    for i in range(147):
        f=reader.frame()
        if i+3 in CONTEXT:
            refs[i+3]=f.copy()
    reader.close()
    x,y,w,h=ROI
    collection={}
    labels={'SOURCE':'SOURCE', 'BASELINE_V3':'BASELINE V3', 'B2':'B2 OFF - official',
            'A20':'P5 A20 - experimental', 'A40':'P5 A40 - experimental',
            'VMAKE':'VMAKE - reference only'}
    for name in labels:
        sequence=[]
        for i in CONTEXT:
            if name=='VMAKE':
                frame=refs[i]
            elif name in ('A20','A40') and i in TARGET:
                frame=cv2.imread(str(OUT/'candidates'/name/'composite'/f'{i:06d}.png'))
            else:
                source='B2' if name in ('A20','A40') else name
                frame=cv2.imread(str(OUT/'input'/source/f'{i:06d}.png'))
            assert frame is not None
            sequence.append(frame)
        collection[name]=sequence
        movie(root/f'{name}-sweater.mp4',[panel(f[y:y+h,x:x+w],f'{labels[name]} | frame {i}') for f,i in zip(sequence,CONTEXT)])
    combos={'comparison-candidate-A20':('SOURCE','B2','A20','VMAKE'),
            'comparison-ablation':('BASELINE_V3','B2','A20','A40'),
            'comparison-official-best':('SOURCE','B2','B2','VMAKE')}
    for filename,names in combos.items():
        detail,full=[],[]
        for j,i in enumerate(CONTEXT):
            tiles=[]
            fulltiles=[]
            for k,name in enumerate(names):
                f=collection[name][j]
                title=labels[name]
                if filename=='comparison-official-best' and k==2:
                    title='BEST RETAINED: B2 (no P5 promotion)'
                tiles.append(panel(f[y:y+h,x:x+w],title))
                fulltiles.append(panel(cv2.resize(f,(360,640),interpolation=cv2.INTER_AREA),title))
            detail.append(np.vstack([np.hstack(tiles[:2]),np.hstack(tiles[2:])]))
            full.append(np.hstack(fulltiles))
        movie(root/f'{filename}-detail.mp4',detail)
        if filename!='comparison-ablation':
            movie(root/f'{filename}-full.mp4',full)
        for j in (2,6,12,19):
            save(root/f'{filename}-frame{CONTEXT[j]}.png',detail[j])
    mapping=dict(method='Constant offset -3; no repeated/skipped reference frames; same output cadence30fps',
                 mappings=[{'source_b2_v3_frame':i,'vmake_frame':i-3,'output_frame':j} for j,i in enumerate(CONTEXT)],
                 caveat='Appearance matching is not decoded-pixel or exposure identity; Vmake timing metadata differs. The nearest appearance match for source124 was122; motion uses121 to preserve cadence.',
                 source_frames_per_loop=len(CONTEXT), repeats=4, repeated_duration_seconds=len(CONTEXT)*4/30)
    (root/'alignment.json').write_text(json.dumps(mapping,indent=2),encoding='utf-8')
    cards=''.join(f'<figure><figcaption>{label}</figcaption><video class="track" src="{name}-sweater.mp4" muted loop playsinline preload="metadata"></video></figure>' for name,label in labels.items())
    html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fase 5 — restauração local do suéter</title><link rel="icon" href="data:,"><style>
body{font:16px system-ui;background:#15171a;color:#eee;margin:24px}main{max-width:1480px;margin:auto}
video{width:100%;background:#000}figure{margin:0}figcaption{margin:8px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
button,select{padding:10px;margin:4px;background:#28333d;color:white;border:1px solid #8ca0b5;border-radius:5px}a{color:#9cd4ff}p{line-height:1.5;max-width:1100px}.single{max-width:1100px}
@media(max-width:700px){.grid{grid-template-columns:1fr}body{margin:12px}}</style><main>
<h1>Fase 5 — teste local, B2 permanece oficial</h1>
<p>18 quadros do suéter receberam propostas de restauração temporal. A20 e A40 são candidatos experimentais, sem aprovação de qualidade.
A comparação oficial mantém B2 com acabamento desligado. Nenhum resultado foi integrado em produção.</p>
<p>Trecho SOURCE 114–135: inclui dois quadros de contexto em cada borda. Vmake: deslocamento constante de −3 quadros, apenas referência perceptiva.
Quatro repetições por arquivo. Recorte do suéter em resolução nativa; não use a miniatura do vídeo inteiro para julgar microtextura.</p>
<p><a href="../PHASE_5_REPORT.md">Relatório</a> · <a href="alignment.json">Alinhamento</a> · <a href="../manifest.json">Máscaras e proveniência</a></p>
<h2>Comparação sincronizada — SOURCE / B2 / candidato A20 / Vmake</h2>
<video class="single" controls muted loop src="comparison-candidate-A20-detail.mp4"></video>
<h2>Controle das intensidades — V3 / B2 / A20 / A40</h2>
<video class="single" controls muted loop src="comparison-ablation-detail.mp4"></video>
<h2>Visão completa — somente o trecho do suéter muda</h2>
<video controls muted loop src="comparison-candidate-A20-full.mp4"></video>
<h2>Melhor resultado mantido: B2</h2>
<video class="single" controls muted loop src="comparison-official-best-detail.mp4"></video>
<h2>Inspeção individual</h2><button id="play">Reproduzir todos</button><button id="pause">Pausar</button><button id="reset">Reiniciar</button>
<label>Velocidade <select id="speed"><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option></select></label>
<div class="grid">CARDS</div><script>
const v=[...document.querySelectorAll('.track')];
document.getElementById('play').onclick=()=>{const t=v[0].currentTime;v.forEach(x=>{x.currentTime=t;x.play().catch(()=>{});});};
document.getElementById('pause').onclick=()=>v.forEach(x=>x.pause());
document.getElementById('reset').onclick=()=>v.forEach(x=>{x.pause();x.currentTime=0;});
document.getElementById('speed').onchange=e=>document.querySelectorAll('video').forEach(x=>x.playbackRate=Number(e.target.value));
// Combined videos are the exact synchronized comparison. Avoid repeated seeking
// on individual players, which can stall decoding on slower disks.
</script></main></html>'''.replace('CARDS',cards)
    (root/'comparison.html').write_text(html,encoding='utf-8')
    print(str(root/'comparison.html'),flush=True)


if __name__=='__main__':
    main()
