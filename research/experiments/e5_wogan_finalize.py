from pathlib import Path
import sys,json,re,shutil,subprocess
import numpy as np,cv2
R=Path('G:/dowloand/teste/cleaner-e5-wogan-pilot-20260913');REPO=Path(__file__).resolve().parents[2]
B=R.parent/'cleaner-e5-synthetic-decompression-gt-20260913';P=R.parent/'cleaner-e5-realbasicvsr-20260913'
sys.path.insert(0,str(B));import run_experiment as b
sys.path.insert(0,str(REPO/'research'));from lab.benchmark import import_result,compare_results
d=json.loads((R/'result.json').read_text());c=json.loads((R/'contract.json').read_text())
case=REPO/'research/benchmarks/data/e5-wogan-pilot-20260913';assert not case.exists()
for name in ('input','gt','mask','candidate','prior'):(case/name).mkdir(parents=True,exist_ok=True)
gt=b.decode(B/'window/gt.mkv')[:3];degraded=b.decode(B/'window/degraded.mkv')[:3]
for j,i in enumerate((24,25,26)):
    fn=f'{i:06d}.png';cv2.imwrite(str(case/'input'/fn),degraded[j]);cv2.imwrite(str(case/'gt'/fn),gt[j]);cv2.imwrite(str(case/'mask'/fn),np.full((420,600),255,np.uint8))
    shutil.copy2(R/'frames'/fn,case/'candidate'/fn);shutil.copy2(P/'window/frames'/fn,case/'prior'/fn)
b.dump(case/'case.json',{'id':'e5-wogan-pilot-20260913','kind':'synthetic_additional_degradation_relative_source_gt','categories':['window','global_restoration','pilot'],
    'fps':30,'frames':3,'input':'input','ground_truth':'gt','mask':'mask','scene_cuts':[],'rights':'user provided lab media; research only','evaluation_mask':'full crop not subtitle mask'})
rel=case.relative_to(REPO/'research/benchmarks').as_posix();records=[]
for arm,engine in [('input','degraded identity baseline'),('candidate','RealBasicVSR WOGAN test5 x4 area native'),('prior','RealBasicVSR GAN test5 x4 area native')]:
    records.append(import_result(rel+'/case.json',rel+'/'+arm,engine,[str(R/'contract.json'),str(R/'result.json'),'Pilot three frames only; auxiliary harness metrics not frozen E5 gates']))
b.dump(R/'harness-import.json',records);b.dump(R/'harness-comparison.json',compare_results([Path(r['report_path']).relative_to('research/benchmarks').as_posix() for r in records]))
base=d['means']['degraded'];new=d['means']['candidate'];old=d['means']['prior_gan'];clean=d['means']['cleaned']
summary=f"PSNR degradado {base['psnr_db']:.3f} dB; WOGAN {new['psnr_db']:.3f} dB (delta {new['psnr_db']-base['psnr_db']:+.3f}); GAN anterior {old['psnr_db']:.3f} dB. WOGAN ganha apenas {new['psnr_db']-old['psnr_db']:.3f} dB sobre o braço anterior reprovado."
report='''# E5 — piloto WOGAN, troca isolada de checkpoint

**REJECT_PILOT_NO_EXPANSION.** Foram emitidos somente os quadros SOURCE 24–26. Não expandir este braço aos 72 quadros nem ao vídeo completo.

'''+summary+f'''

SSIM Y: {base['ssim_y']:.6f} → {new['ssim_y']:.6f}; erro nas bordas {base['edge_mae']:.3f} → {new['edge_mae']:.3f}; amplitude passa-altas {new['highpass_std']/base['highpass_std']:.3f}×; erro temporal de duas transições {d['temporal_error']['candidate']/d['temporal_error']['degraded']:.3f}×. PSNR, SSIM, bordas e temporal falharam nos limites E5 preservados. A amplitude passa-altas passou apenas o limite inferior, embora acompanhe estruturas artificiais.

Cleaning WOGAN: PSNR {clean['psnr_db']:.3f} dB. Houve uma passagem, resíduo médio {d['passes'][0]['mean_abs_residue_255']:.6f}/255 abaixo do limiar 5/255. O dano continua presente antes do SR.

## Evidência visual e limites

Inspeção do autor dos painéis 24/26: cabelo em grandes massas/facetas, folhagem artificial e contornos alterados no perfil, já no cleaning. Compatível com Level 3 observado no braço anterior; a rejeição métrica deste piloto independe de nova aprovação visual. Quadro 25 está no pacote mas não recebeu inspeção visual nesta sessão. Não houve nova revisão independente, cujo último acionamento falhou por limite de uso. Playback e qualidade temporal perceptual permanecem UNDETERMINED. Duas transições não certificam estabilidade.

## Seleção e comparação controlada

A [configuração oficial WOGAN fixada](https://github.com/open-mmlab/mmediting/blob/8b819f1d28d6eed6244721278a099f5dc0848a20/configs/restorers/real_basicvsr/realbasicvsr_wogan_c64b20_2x30x8_lr1e-4_300k_reds.py) usa perdas L1 de pixels e limpeza, sem perdas adversarial/perceptual, mas **usa GT com sharpening no treinamento**. Não equivale a ausência de prior de nitidez. O peso é referenciado no `load_from` da configuração GAN oficial arquivada.

Única variável executada frente ao piloto anterior: checkpoint completo, incluindo pesos de flow. Arquitetura, adapter, RGB float, FP32, TF32 desligado, contexto, limiar 5 e redução INTER_AREA do raw x4 para 600×420 foram mantidos. Inputs SOURCE 24/24/24/25/26/27/28, core 24–26. A configuração WOGAN recomenda **1,5** para teste; aqui foi mantido **5** para isolar os pesos. Portanto este resultado não é benchmark da configuração oficial recomendada. Também não isola causalmente uma única função de perda: são checkpoints de etapas de treinamento diferentes.

Checkpoint SHA-256 `{c['full_download_hash_recorded']}`. Download do domínio oficial via TLS verificado, prefixo publicado `0e2ff207` conferido; digest completo registrado, não apresentado como digest completo fornecido pelo upstream. Arquitetura/adapter conferem com a rodada anterior; todas as chaves carregaram estritamente. Código Apache-2.0 e configuração arquivados; liberação comercial completa de pesos/dados/dependências não concluída.

## Execução e preservação

Forward instrumentado {d['instrumented_forward_seconds']:.3f} s; runner {d['runner_seconds']:.3f} s, sem download/importação/revisão; pico CUDA {d['peak_cuda_MiB']:.1f} MiB. Hook registra limpeza e inclui cópias CPU. GPU externa US$ 0; energia local não medida. Três PNGs, raw x4/cleaning float e FFV1 exato arquivados. Entradas/GT/SOURCE/Golden e saídas anteriores preservados. Três braços importados/comparados no harness; suas métricas auxiliares BGR/PSNR agregado não substituem os gates congelados.

## Decisão e próximo passo

Encerrar a expansão desta troca de checkpoint. As duas variantes compartilham falha de aspecto semelhante no mesmo runtime; isso não comprova que a arquitetura oficial seja incapaz nem que o adapter esteja errado. A equivalência numérica do adapter legado ainda não foi certificada.

**Próximo único trabalho:** auditar equivalência do módulo de cleaning com a implementação oficial, começando por ConvModule, ativação, carregamento de pesos e normalização, usando a entrada e os pesos arquivados. Uma divergência deve ser corrigida e validada antes de novo candidato; se equivalência for confirmada, selecionar outra arquitetura orientada à restauração de compressão. Não gastar nova rodada inteira em mudanças de intensidade, blending ou threshold.

[Comparador](comparison.html) · [Contrato](contract.json) · [Resultado](result.json).
'''
(R/'REPORT.md').write_text(report,encoding='utf-8')
html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>E5 WOGAN — piloto reprovado</title><style>body{background:#111a20;color:#eee;font:17px system-ui;margin:24px}a{color:#9de2ff}img{max-width:100%;display:block}.native img{max-width:none}button{font:inherit;padding:10px}</style><h1>E5 WOGAN — piloto reprovado</h1><p>GT / degradado; WOGAN cleaning / WOGAN SR reduzido; GAN anterior. Três quadros, limiar 5 fixo, sem expansão. Comparador estático; não constitui revisão de movimento.</p><p><a href="REPORT.md">Relatório</a> · <a href="contract.json">Contrato</a></p><button onclick="document.body.classList.toggle('native')">Pixels nativos</button>'''
for i in (24,25,26):html+=f'<h2>SOURCE {i}</h2><img src="comparison-{i}.png" alt="Estágios comparáveis do quadro {i}">'
(R/'comparison.html').write_text(html+'</html>',encoding='utf-8')
entry='''### E5 — WOGAN reprovado no piloto; auditoria de runtime antes de nova engine — 13/09/2026

**REJECT_PILOT_NO_EXPANSION.** A troca isolada para o checkpoint oficial WOGAN manteve o runtime, contexto, FP32, limiar 5 e redução explícita x4 por área. Emitiu somente SOURCE 24–26. A configuração WOGAN recomenda limiar 1,5 no teste; foi mantido 5 para isolar os pesos, portanto não é reprodução da configuração recomendada.

'''+summary+''' PSNR/SSIM/bordas/temporal falharam. Uma única limpeza já contém dano; inspeção local 24/26 encontrou massas artificiais em cabelo/folhagem e contornos alterados. Sem nova revisão independente ou playback. Não atribuir causalidade exclusiva ao GAN: o WOGAN também usa GT com sharpening e compartilha adapter cuja equivalência ainda não foi certificada.

Três PNGs/master FFV1 exatos e intermediários arquivados, entradas/SOURCE/Golden preservados, três braços comparados no harness. Forward 5,345 s; runner 14,153 s; GPU externa US$ 0. Próximo único trabalho: equivalência do cleaning/adapter com o caminho oficial antes de nova troca de motor. [Relatório](cleaner-e5-wogan-pilot-20260913/REPORT.md) · [Comparador](cleaner-e5-wogan-pilot-20260913/comparison.html).

'''
road=R.parent/'CLEANER-ROADMAP-AND-MODEL-ROUTING.md';text=road.read_text(encoding='utf-8')
if '### E5 — WOGAN reprovado' not in text:text=text.replace('## Ordem e dependências\n','## Ordem e dependências\n\n'+entry,1)
text=re.sub(r'1\. E5: selecionar um candidato orientado à fidelidade.*?\n2\. E3','1. E5: auditar equivalência do cleaning/adapter com a implementação oficial, usando input/pesos congelados, antes de nova seleção de engine. O piloto WOGAN test5 também foi reprovado; não expandir nem mascarar o dano com blending/sharpening. Distinguir runtime incorreto de falha do checkpoint sob este contrato.\n2. E3',text,count=1)
text=text.replace('Saída imediata: seleção fundamentada e contrato de outro candidato E5. O diagnóstico de passagens está concluído nesta janela.','Saída imediata: decisão de equivalência do cleaning no runtime de pesquisa. O diagnóstico de passagens e o piloto WOGAN estão concluídos e não aprovaram qualidade.')
road.write_text(text,encoding='utf-8')
cp=R.parent/'cleaner-presence-control-20260912-v2/MILESTONE_CONTEXT.md';text=cp.read_text(encoding='utf-8')
if '### E5 — WOGAN reprovado' not in text:cp.write_text(text+'\n\n'+entry,encoding='utf-8')
for src in (Path(__file__),Path(__file__).with_name('e5_wogan_pilot.py')):shutil.copy2(src,R/src.name)
assert all(b.sha(Path(p))==h for p,h in c['hashes'].items())
assert all((R/p).exists() for p in re.findall(r'(?:src|href)="([^"]+)"',html))
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate:frame=best_effort_timestamp_time','-of','json',str(R/'restored.mkv')]))
assert len(probe['frames'])==3 and probe['streams'][0]['width']==600 and probe['streams'][0]['height']==420
b.dump(R/'validation.json',{'inputs_preserved':True,'links_present':True,'master_exact':d['master_png_exact'],'master_probe':probe,'independent_review':'NOT_AVAILABLE_LAST_ATTEMPT_USAGE_LIMIT','static_author_inspection':[24,26],'temporal':'UNDETERMINED','artifacts':{str(p.relative_to(R)):b.sha(p) for p in R.rglob('*') if p.is_file() and p.name!='validation.json'}})
b.dump(R/'record-args.json',{'category':'experiments','title':'Cleaner E5 WOGAN checkpoint-only pilot rejected 2026-09-13','body':'CONFIRMED: official WOGAN checkpoint prefix0e2ff207, same test5 runtime/context x4-area-native; official WOGAN recommended threshold1.5 explicitly not used. Three frames24-26, PSNR delta -6.178dB vsdegraded, +0.113dB vsGAN rejected prior; PSNR SSIM edge temporal fail. One cleaning pass residual3.549652/255 already damages structure. No expansion, input/source/Golden preserved, master exact, harness three arms compared. Author static24/26 only, no new independent review or perceptual playback. Next: audit cleaning adapter equivalence before new engine. ExternalGPU USD0.','sources':[str(R/'REPORT.md'),str(R/'contract.json'),str(R/'result.json')],'evidence':'CONFIRMED'})
print('Pilot rejected, harness imported, report and roadmap saved.')
