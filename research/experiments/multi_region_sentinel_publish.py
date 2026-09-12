"""Publish a static evidence index and hash manifest after measurements."""
import json
from pathlib import Path
from multi_region_sentinels import ROOT,SCENES,MASKS,C2,sha

def main():
 pages=['<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sentinelas de qualidade</title>',
 '<style>body{background:#181b20;color:#edf1f5;font:16px/1.6 system-ui;max-width:1500px;margin:32px auto;padding:0 20px}a{color:#9dcfff}video,img{max-width:100%;display:block;margin:16px 0}button{padding:10px 18px;margin:0 8px 15px 0}section{border-top:1px solid #505660;padding:20px 0}p{max-width:1100px}</style>',
 '<h1>Sentinelas de qualidade — três cenas</h1><p>Instrumento medido sobre SOURCE e B2. Candidato disponível somente na cena C: controle C2. DiffuEraser ainda NOT RUN. Nenhuma aprovação neural ou integração.</p>',
 '<p><a href="MULTI_REGION_SENTINEL_REPORT.md">Relatório e definições</a> · <a href="manifest.json">Regiões</a> · <a href="measurements.json">Métricas por frame</a> · <a href="instrument-controls.json">Testes do instrumento</a></p>',
 '<p>BASELINE é uma cópia de laboratório: B2 dentro da máscara sobre SOURCE calibrado. B2 original permanece intacto; seus crops separados estão em BASELINE_ARCHIVED. Áreas externas são protegidas, nunca alvos de enhancement.</p>']
 for s,case in SCENES.items():
  pages.append(f'<section><h2>Cena {s} — frames {case["start"]}–{case["end"]}</h2><p><a href="{s}-sentinel-map.png">Mapa de regiões em tamanho nativo</a></p>')
  for region in ['INPAINTING_BAND','FACE','FABRIC','OBJECT_EDGE']:
   ident=f'{s}-{region}'
   pages.append(f'<h3>{region}</h3><p>SOURCE / BASELINE / '+('C2 CONTROL' if s=='C' else 'NOT RUN')+'</p>')
   pages.append(f'<video id="{ident}" controls muted loop preload="metadata" src="comparators/{ident}.mp4"></video>')
   pages.append(f'<button onclick="document.getElementById(\'{ident}\').playbackRate=1">1×</button><button onclick="document.getElementById(\'{ident}\').playbackRate=.5">0,5×</button>')
  n=case['anchor']
  pages.append(f'<p><a href="crops/{s}/INPAINTING_BAND/{n:06d}-BASELINE_ARCHIVED.png">Faixa do B2 original — frame {n}</a> · <a href="comparators/{s}-INPAINTING_BAND.png">Comparação PNG</a></p></section>')
 pages.append('<p>As nove categorias e todos os frames estão nos crops e JSONs. Os vídeos são cópias para revisão, não entradas das métricas. Ausência de alterações externas não aprova a fivela ou a faixa dentro da máscara.</p></html>')
 (ROOT/'comparison.html').write_text('\n'.join(pages),encoding='utf-8')
 inputs=[]
 for case in SCENES.values():
  for idx in range(case['start'],case['end']+1):
   p=MASKS/f'{idx:06d}.png';r={'frame':idx,'mask_path':str(p),'mask_sha256':sha(p)}
   if idx>=104:r.update(candidate_path=str(C2/f'{idx:06d}.png'),candidate_sha256=sha(C2/f'{idx:06d}.png'))
   inputs.append(r)
 (ROOT/'input-hashes.json').write_text(json.dumps(inputs,indent=2),encoding='utf-8')
 code={n:sha(Path(__file__).with_name(n)) for n in ['multi_region_sentinels.py','multi_region_sentinel_review.py','multi_region_sentinel_publish.py']}
 (ROOT/'code-hashes.json').write_text(json.dumps(code,indent=2),encoding='utf-8')
 inventory={str(p.relative_to(ROOT)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='artifact-hashes.json'}
 (ROOT/'artifact-hashes.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
 print('Published',len(inventory),'hashed artifacts')

if __name__=='__main__':main()
