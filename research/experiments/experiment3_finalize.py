"""Publish the local RETEST evidence index; never runs models or cloud jobs."""
from pathlib import Path
import hashlib
import json
import subprocess
import time

ROOT=Path('G:/dowloand/teste/experiment-3-alternative-inpainting-20260911')

def main():
    monitor=json.loads((ROOT/'initialization-monitor.json').read_text())
    assert monitor['stop_reason']=='RAM_GUARD_ABORT'
    assert monitor['model_inference_completed'] is False
    proc=subprocess.run(['G:/cleaneria-runtime/diffueraser-env/Scripts/python.exe','-m','pip','check'],capture_output=True,text=True,timeout=60)
    query="@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python' -and $_.CommandLine -like '*experiment3_preflight.py*' } | Select-Object ProcessId,ParentProcessId) | ConvertTo-Json -Compress"
    processes=subprocess.check_output(['powershell','-NoProfile','-Command',query],text=True,timeout=20).strip()
    remaining=json.loads(processes) if processes else []
    assert not remaining, remaining
    validation={'checked_unix':time.time(),'pip_check_command':proc.args,'pip_check_returncode':proc.returncode,
                'pip_check_stdout':proc.stdout,'pip_check_stderr':proc.stderr,
                'remaining_attempt_processes':remaining,
                'gpu_after':subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.used,memory.total','--format=csv'],text=True),
                'inference':{'gt':'NOT_RUN','A':'NOT_RUN','B':'NOT_RUN','C':'NOT_RUN','D':'NOT_RUN'},
                'metrics':{m:None for m in ['mae','ssim','lpips','gradient','edge_preservation','texture_correlation','temporal_error','flicker','geometry','outside_delta']},
                'cloud_cost_usd':0,'verdict':'RETEST_RUNTIME_BLOCKED'}
    (ROOT/'runtime-validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
    assert proc.returncode==0
    page='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Experimento 3 — RETEST</title><style>body{font:17px/1.6 system-ui;background:#13171c;color:#ecf0f3;max-width:1000px;margin:32px auto;padding:20px}a{color:#8dccff}img{max-width:100%;height:auto}td,th{padding:10px;border:1px solid #68727d;text-align:left}table{border-collapse:collapse;width:100%}</style>
<h1>Experimento 3: RETEST por runtime</h1><p>O carregamento do DiffuEraser foi interrompido pelo limite de RAM. Não há saída alternativa nem comparadores de qualidade nesta rodada. B2 OFF permanece congelado. Cloud: US$ 0.</p>
<p><a href="EXPERIMENT_3_ALTERNATIVE_INPAINTING_REPORT.md">Relatório completo</a> · <a href="initialization-monitor.json">Recursos e comando</a> · <a href="initialization.log">Log do carregamento</a> · <a href="preflight-inventory.json">Pesos e hashes</a></p>
<table><caption>Comparações solicitadas — ainda pendentes</caption><thead><tr><th scope="col">Caso</th><th scope="col">SOURCE</th><th scope="col">B2</th><th scope="col">Alternativa</th><th scope="col">Vmake</th></tr></thead><tbody>
<tr><th scope="row">GT suéter</th><td>22 PNG preparados</td><td>ProPainter pareado por executar</td><td>Não executada</td><td>Não se aplica a GT</td></tr>
<tr><th scope="row">A / B / C</th><td>Cenas localizadas</td><td>Baseline existente</td><td>Não executada</td><td>Somente referência visual futura</td></tr>
<tr><th scope="row">D sentinela</th><td>Suporte provisório</td><td>Arquivo preservado</td><td>Não executada</td><td>Não é ground truth</td></tr></tbody></table>
<p>1×, 0,5×, crop ampliado e mapa de diferença aguardam uma inferência válida. Nenhum painel substitui o candidato ausente por SOURCE ou B2.</p>
<p><a href="gt-prepared/manifest.json">Manifesto do GT</a> · <a href="gt-prepared/gt-support-validation.json">Verificação do suporte GT</a> · <a href="license-evidence/sources.json">Fontes das licenças</a></p>
<h2>Índice de cenas do SOURCE</h2><p>Thumbnails para localização; não usar esta imagem como teste de cor ou nitidez.</p><img src="source-scene-index.jpg" alt="Índice de quadros com seus números e tempos: mulher retirando roupa, mulher de braços cruzados, homem de suéter e demais cenas da fonte.">
</html>'''
    (ROOT/'comparison.html').write_text(page,encoding='utf-8')
    files=[]
    for p in sorted(ROOT.rglob('*')):
        if p.is_file() and p.name!='artifact-hashes.json':
            files.append({'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (ROOT/'artifact-hashes.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    print(json.dumps({'artifact_files':len(files),'verdict':validation['verdict'],'remaining_processes':remaining}))

if __name__=='__main__': main()
