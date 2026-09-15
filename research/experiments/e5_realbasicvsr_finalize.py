from pathlib import Path
import json,sys,shutil,re,subprocess
R=Path('G:/dowloand/teste/cleaner-e5-realbasicvsr-20260913');REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'));import run_experiment as b
d=json.loads((R/'result.json').read_text());c=json.loads((R/'contract.json').read_text());s=json.loads((R/'stage-diagnosis/result.json').read_text())
up=Path('G:/cleaneria-runtime/phase5-mmediting')
(R/'provenance').mkdir(exist_ok=True)
for src in [up/'LICENSE',up/'configs/restorers/real_basicvsr/realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds.py',up/'configs/restorers/real_basicvsr/metafile.yml',REPO/'research/experiments/phase5_runtime.py',Path(__file__),REPO/'research/experiments/e5_realbasicvsr_gt.py',REPO/'research/experiments/e5_realbasicvsr_package.py',REPO/'research/experiments/e5_realbasicvsr_stages.py']:
    shutil.copy2(src,R/'provenance'/src.name)
rows=[];deltas=[]
for n,v in d['clips'].items():
    a=v['means']['degraded'];z=v['means']['restored'];delta=z['psnr_db']-a['psnr_db'];deltas.append(delta)
    rows.append(f"| {n} | {delta:+.3f} | {z['ssim_y']-a['ssim_y']:+.4f} | {z['edge_mae']/a['edge_mae']:.3f} | {z['highpass_std']/a['highpass_std']:.3f} | {v['temporal_error']['restored']/v['temporal_error']['degraded']:.3f} | {v['decision']} |")
stage_rows=[]
for v in s['frames']:stage_rows.append(f"| {v['source_frame']} | {v['degraded']['psnr_db']:.3f} | {v['cleaned']['psnr_db']:.3f} | {v['final']['psnr_db']:.3f} |")
report='''# Cleaner E5 — RealBasicVSR sobre GT congelado

**REJECT_METRIC_GATE + REJECT_LEVEL3; melhoria global não aprovada.** Um único candidato RealBasicVSR foi executado nos três trechos de 24 quadros. A revisão independente dos críticos 24/36/47 encontrou estruturas artificiais em cabelo/folhagem e alteração de contornos do perfil. Essa rejeição já era suficiente; o restante da rodada originalmente contratada foi arquivado para comparação entre categorias, sem expansão para vídeo completo.

| Trecho | ΔPSNR dB | ΔSSIM Y | Erro bordas / degradado | Amplitude HF / degradado | Erro temporal / degradado | Gate |
|---|---:|---:|---:|---:|---:|---|
'''+ '\n'.join(rows)+'''

HF maior não é detalhe verdadeiro: este braço acentua/inventa padrões. Gates do benchmark original foram mantidos: ΔPSNR ≥0,2 dB, ΔSSIM ≥−0,001, erro de borda ≤1,02×, HF ≥0,98× e erro temporal médio ≤1,05×. O proxy temporal não certifica flicker/ghosting; playback humano permanece UNDETERMINED. Não foi repetida a tentativa de navegador que falhou na rodada anterior.

## Seleção e contrato

A [configuração oficial](https://github.com/open-mmlab/mmediting/blob/8b819f1d28d6eed6244721278a099f5dc0848a20/configs/restorers/real_basicvsr/realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds.py) inclui blur e compressão H.264/MPEG4. Isso fundamentou a hipótese, sem assumir que reproduziria VMake. O [projeto oficial](https://github.com/ckkelvinchan/RealBasicVSR) publica o modelo como super-resolução de vídeo real. O checkpoint é o refinado com perdas perceptual/adversarial, não o checkpoint wogan; não generalizar esta rejeição para todas as variantes.

MMEditing fixado em `8b819f1d28d6eed6244721278a099f5dc0848a20`; checkpoint SHA-256 `52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376`. Adapter legado existente, 320 chaves estritas, arquitetura upstream sem alterações. Equivalência com o runtime antigo não certificada. Código Apache-2.0 arquivado; verificação comercial completa de pesos/datasets/dependências permanece pendente.

Entradas BGR congeladas convertidas para RGB float 0–1, FP32, sem TF32, sem resize espacial de entrada. Threshold de teste 5/255, até três limpezas internas. Oito janelas por trecho: 3 saídas centrais com 2 quadros de contexto de cada lado, 7 entradas, replicação apenas nas pontas. Estado reiniciado por janela; mudanças de contexto podem influenciar a continuidade, ainda sem causa isolada.

Saída neural 2400×1680 float arquivada por quadro. Redução explícita com INTER_AREA para 600×420, seguida de rint/clip BGR uint8. Este é o contrato **x4 → integração por área nativa**, sem downscale de entrada, mistura com SOURCE ou filtro adicional. Não certifica upscale verdadeiro. GT nunca entrou na inferência. Não é o braço histórico A20/A40 da remoção.

## Localização da falha sem nova inferência

A pedido da revisão independente, os intermediários 24/36/47 foram comparados. A saída do cleaning já contém cabelo/folhagem simplificados e contornos alterados; o ramo SR acrescenta alterações. O primeiro estágio arquivado defeituoso é o cleaning, antes da super-resolução. Não foram salvas as passagens individuais da limpeza, portanto não se distingue primeira passagem de repetição neste resultado.

| SOURCE | PSNR degradado | PSNR após cleaning | PSNR final |
|---|---:|---:|---:|
'''+ '\n'.join(stage_rows)+'''

Os painéis e métricas estão em `stage-diagnosis/`. Este diagnóstico é pós-hoc, não novo candidato nem ensaio de promoção. O PNG 24 foi reproduzido exatamente do raw x4 pelo revisor.

## Execução e preservação

'''+f"Inferência dos trechos: **{d['inference_seconds']:.3f} s**; runner **{d['runner_seconds']:.3f} s**, incluindo preflight, montagem e I/O, excluindo importação do harness e revisão. Preflight de capacidade: 10,295 s. Pico alocado: {max(w['peak_MiB'] for v in d['clips'].values() for w in v['windows']):.1f} MiB. GPU externa US$ 0; energia local não medida. Não extrapolar recortes para vídeo completo.\n\n"+'''
72 PNGs, 72 raw x4 float, 72 intermediários de cleaning e três FFV1 com roundtrip exato. Hashes de GT/degradados/SOURCE/Golden preservados. Geometria, 24 PTS e FPS dos masters conferidos. Entradas e candidatos importados no harness e comparados; métricas auxiliares BGR/PSNR agregado não substituem o gate E5. Os limites de tempo do runner são verificados após cada chamada; não são watchdog de chamada travada. Não houve timeout/OOM nem fallback.

Este teste não compõe master integral, não avalia áudio e não modifica E2/E3/E4. [Comparador](comparison.html), [contrato](contract.json), [métricas](result.json), [revisão independente](INDEPENDENT-REVIEW.md).

Próximo único experimento proposto: uma janela congelada que emite SOURCE 24–26, registrando cada passagem do cleaning, magnitude do resíduo e condição de parada, mantendo pesos, precisão, threshold e inputs. Distinguir dano inicial de amplificação por iteração; não ajustar nitidez, gates ou GT para aprovar este braço.
'''
(R/'REPORT.md').write_text(report,encoding='utf-8')
entry='''### E5 — RealBasicVSR executado; falha localizada no cleaning — 13/09/2026

**REJECT_METRIC_GATE + REJECT_LEVEL3.** O candidato RealBasicVSR, com treinamento documentado incluindo blur/compressão, foi executado nos mesmos três GT congelados. Entrada nativa 600×420, FP32, threshold de teste 5, contexto 7 quadros para 3 saídas centrais. A saída 4× foi arquivada e reduzida explicitamente por área para comparação nativa; esse contrato não aprova upscale verdadeiro.

'''+f"Os deltas PSNR foram {deltas[0]:+.3f} / {deltas[1]:+.3f} / {deltas[2]:+.3f} dB. A revisão independente encontrou falha Level 3 em cabelo/folhagem e perfil nos críticos 24/36/47. O diagnóstico dos intermediários arquivados localizou alterações já na saída do cleaning, antes do ramo de super-resolução. As passagens individuais não foram registradas; a causa entre primeira limpeza e repetição permanece aberta.\n\n"+f"72 PNGs e três masters FFV1 exatos, entradas/SOURCE/Golden preservados, PTS/FPS/geometria conferidos e comparação no harness. Inferência {d['inference_seconds']:.3f} s; runner {d['runner_seconds']:.3f} s. GPU externa US$ 0. Qualidade temporal perceptual segue UNDETERMINED; E5 não aprovada. [Relatório](cleaner-e5-realbasicvsr-20260913/REPORT.md) · [Comparador](cleaner-e5-realbasicvsr-20260913/comparison.html).\n\n"
road=R.parent/'CLEANER-ROADMAP-AND-MODEL-ROUTING.md';text=road.read_text(encoding='utf-8')
if '### E5 — RealBasicVSR executado;' not in text:text=text.replace('## Ordem e dependências\n','## Ordem e dependências\n\n'+entry,1)
text=re.sub(r'1\. E5: concluir a revisão humana/perceptual.*?\n2\. E3', '1. E5: instrumentar uma janela congelada RealBasicVSR que emite SOURCE 24–26, registrando cada passagem do cleaning, magnitude do resíduo e parada efetiva, com pesos/precisão/threshold/contexto fixos. Distinguir dano inicial de amplificação iterativa. O candidato completo está reprovado. A revisão perceptual dos braços rejeitados fica disponível para caracterização, sem bloquear a próxima investigação e sem promovê-los.\n2. E3',text,count=1)
text=re.sub(r'Saída imediata: registrar a revisão perceptual E5 no comparador entregue;.*?aprovação comercial\.', 'Saída imediata: decisão causal sobre as passagens do cleaning, com novo contrato curto antes de nova inferência. ESTRNN e o RealBasicVSR desta rodada estão reprovados; E5 continua em investigação.',text,count=1)
road.write_text(text,encoding='utf-8')
cp=R.parent/'cleaner-presence-control-20260912-v2/MILESTONE_CONTEXT.md';text=cp.read_text(encoding='utf-8')
if '### E5 — RealBasicVSR executado;' not in text:cp.write_text(text+'\n\n'+entry,encoding='utf-8')
html=(R/'comparison.html').read_text(encoding='utf-8');refs=re.findall(r'(?:href|src)="([^"]+)"',html)
assert all((R/p).exists() for p in refs)
assert all(b.sha(Path(p))==h for p,h in c['input_hashes'].items())
b.dump(R/'validation.json',{'links_exist':True,'inputs_hashes_rechecked':True,'browser_playback':'NOT_TESTED','human_temporal_review':'NOT_PERFORMED',
    'files':{str(p.relative_to(R)):b.sha(p) for p in R.rglob('*') if p.is_file() and p.name!='validation.json'}})
b.dump(R/'record-args.json',{'category':'experiments','title':'Cleaner E5 RealBasicVSR frozen GT rejected with cleaning stage damage 2026-09-13',
    'body':f"CONFIRMED: RealBasicVSR x4-area-native FP32 test5 on frozen E5 3x24 frames600x420. PSNR deltas {deltas}. REJECT metric+Level3 independent review window24/36/47. Archived cleaning already damaged; individual cleaning passes not isolated. No E2/E3/E4 or product changes. Inference {d['inference_seconds']:.3f}s, external GPU USD0. 72PNG/3FFV1 exact; hashes/geometry/PTS preserved; harness imported/compared. Temporal perceptual UNDETERMINED. Next bounded diagnosis: individual cleaning passes, no sharpening or threshold relaxation.",
    'sources':[str(R/'REPORT.md'),str(R/'contract.json'),str(R/'result.json'),str(R/'INDEPENDENT-REVIEW.md')], 'evidence':'CONFIRMED'})
print('Final report, validation and checkpoints saved.')
