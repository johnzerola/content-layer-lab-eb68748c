"""Publish root-cause evidence and explicit runtime/missing-stage status."""
import json
from pathlib import Path
from root_cause_isolation import ROOT
from multi_region_sentinels import sha

def main():
 evidence=json.loads((ROOT/'stage-evidence.json').read_text())
 decisions={
 'A':{'classification':'MULTIPLE_CAUSES','components':['MASK_OR_SUPPORT','COMPOSITION'],
      'raw_prediction_status':'NOT_ARCHIVED','neural_priority':'COMPOSITION_DIAGNOSIS_FIRST_NO_CLAIM_RAW_CORRECT'},
 'B':{'classification':'UNDETERMINED','first_observed':'UPSTREAM_OUTPUT_ENCODED',
      'later_contribution':'COMPOSITION','raw_prediction_status':'NOT_ARCHIVED','structural_gate':'RETEST_STRUCTURE_EVIDENCE'},
 'C':{'classification':'MODEL_PREDICTION','first_observed':'RAW_PREDICTION_window-0015',
      'raw_prediction_status':'ARCHIVED_FLOAT16','neural_priority':'PRIORITY_DIFFUERASER_PAIRED_TEST'}}
 (ROOT/'classifications.json').write_text(json.dumps(decisions,indent=2),encoding='utf-8')
 monitor=json.loads((ROOT/'diffueraser-retest/monitor.json').read_text())
 runtime={'stop_reason':monitor['stop_reason'],'elapsed_seconds':monitor['elapsed_seconds'],
 'minimum_available_ram_bytes':min(x['available_ram_bytes'] for x in monitor['samples']),
 'peak_total_device_used_mib':max(x.get('gpu_used_mib',0) for x in monitor['samples']),
 'first_cuda_checkpoint_exists':(ROOT/'diffueraser-retest/stage.json').exists(),
 'video_inference_completed':False,'quality_metrics':None,'paired_gt':'NOT_RUN','cases_ABC':'NOT_RUN'}
 (ROOT/'diffueraser-retest/runtime-summary.json').write_text(json.dumps(runtime,indent=2),encoding='utf-8')
 html=['<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Root-cause isolation</title>',
 '<style>body{background:#181c21;color:#eef2f7;font:16px/1.6 system-ui;max-width:1200px;margin:32px auto;padding:20px}a{color:#9ed0ff}img{max-width:100%;display:block}figure{margin:20px 0;padding:14px;border:1px solid #647280}summary{cursor:pointer}code{overflow-wrap:anywhere}</style>',
 '<h1>Root-cause isolation — A/B/C</h1><p>Auditoria de arquivos existentes. Nenhuma alteração no pipeline. DiffuEraser: RETEST por RAM, sem inferência.</p>',
 '<p><a href="ROOT_CAUSE_ISOLATION_REPORT.md">Relatório</a> · <a href="stage-evidence.json">Origens, hashes e estágios</a> · <a href="boundary-measurements.json">Emendas medidas</a> · <a href="buckle-structural-gate.json">Gate da fivela</a></p>']
 for s,case in evidence.items():
  html.append(f'<h2>Caso {s}, frame {case["anchor"]}: {decisions[s]["classification"]}</h2>')
  for k,v in case['missing'].items():html.append(f'<p><strong>{k}: {v}</strong></p>')
  html.append(f'<p><a href="{s}-stage-sheet.png">Folha de estágios com crops nativos</a></p>')
  for r in case['stages']:
   if r['global_frame']!=case['anchor']:continue
   html.append(f'<details><summary>{r["stage"]} — {r["shape"]}</summary><figure><img src="{r["image"]}" alt="{r["stage"]}"><figcaption>{r["notes"]}<br><code>{r["origin"]}</code></figcaption></figure></details>')
 html.append('<p>Imagens de A/B no espaço do modelo têm resolução histórica diferente. RAW verdadeiro está disponível somente no C. O master YUV C2 pertence ao gate posterior e não é ancestral do B2.</p></html>')
 (ROOT/'comparison.html').write_text('\n'.join(html),encoding='utf-8')
 code={n:sha(Path(__file__).with_name(n)) for n in ['root_cause_isolation.py','root_cause_review.py','root_cause_publish.py','experiment3_low_memory_retest.py','buckle_structural_gate.py']}
 (ROOT/'code-hashes.json').write_text(json.dumps(code,indent=2),encoding='utf-8')
 inventory={str(p.relative_to(ROOT)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name!='artifact-hashes.json'}
 (ROOT/'artifact-hashes.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
 print(json.dumps(runtime,indent=2));print('Artifacts',len(inventory))

if __name__=='__main__':main()
