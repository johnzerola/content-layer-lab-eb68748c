from pathlib import Path
import sys,json,shutil,re
R=Path('G:/dowloand/teste/cleaner-e5-cleaning-passes-20260913')
sys.path.insert(0,str(R.parent/'cleaner-e5-synthetic-decompression-gt-20260913'));import run_experiment as b
d=json.loads((R/'result.json').read_text());c=json.loads((R/'contract.json').read_text())
assert d['pass_count']==1 and d['passes'][0]['stop_condition']
assert all(v['exact'] for v in d['archive_equivalence'].values())
rows=[]
for original,after in zip(d['baseline'],d['passes'][0]['rows']):
    a=original['metrics'];z=after['metrics'];rows.append(f"| {original['source_frame']} | {a['psnr_db']:.3f} | {z['psnr_db']:.3f} | {z['psnr_db']-a['psnr_db']:+.3f} | {a['edge_mae']:.3f} → {z['edge_mae']:.3f} |")
report='''# Cleaner E5 — diagnóstico das passagens de cleaning

**FIRST_PASS_DAMAGE_CONFIRMED_IN_THIS_RUNTIME; ITERATIVE_AMPLIFICATION_EXCLUDED_FOR_THIS_WINDOW.** O modelo executou somente uma passagem. O candidato RealBasicVSR permanece reprovado; este é um diagnóstico, não melhoria de qualidade.

A média absoluta do resíduo foi **3,659595 níveis de 255**, inferior ao threshold **5**. A condição de parada foi verdadeira após a primeira passagem: não houve segunda nem terceira. Logo, a hipótese de amplificação por repetição está descartada para esta janela. Aumentar o threshold para reduzir passagens não evitaria o dano já introduzido; diminuir o threshold pode acrescentar passagens e não testa essa hipótese.

| SOURCE | PSNR degradado | PSNR após passagem 1 | ΔPSNR dB | Erro bordas degradado → passagem 1 |
|---|---:|---:|---:|---|
'''+ '\n'.join(rows)+'''

Inspeção local dos três painéis 24/25/26: já após a passagem 1, o cabelo perde organização fina e forma grandes massas, a folhagem vira fragmentos artificiais e o perfil apresenta contornos alterados. São os defeitos estruturais observados no braço anterior. A saída SR arquivada acrescenta textura, mas a origem do dano antecede essa etapa.

## Contrato e equivalência

Uma chamada do forward completo upstream, com hook não mutante em `image_cleaning`. O hook retorna None e apenas copia entrada/resíduo/soma. Pesos, adapter, FP32, TF32 desligado, threshold 5/255, input nativo 600×420 e contexto preservados. Entrada SOURCE **24,24,24,25,26,27,28**, emitindo **24–26**. GT foi aberto para avaliação após a inferência.

Todas as seis comparações com os floats arquivados — raw x4 e cleaning de 24/25/26 — tiveram igualdade exata, delta máximo **0,0**. Isso certifica reprodução desta janela no mesmo runtime e ausência de mudança numérica observada pela instrumentação. Não certifica equivalência com MMCV/MMEditing antigos, nem resolve eventual incompatibilidade do adapter. O arquivo `pass-1/all-seven-float.npz` preserva entrada, resíduo e saída dos sete elementos.

'''+f"Tempo do forward instrumentado: **{d['instrumented_forward_seconds']:.3f} s**; runner **{d['runner_seconds']:.3f} s**; pico CUDA alocado **{d['peak_cuda_MiB']:.1f} MiB**. Inclui cópias CPU do hook, portanto não é benchmark comparável de latência. GPU externa US$ 0.\n\n"+'''
## Limites e decisão

Hashes de todas as entradas congeladas e dos arquivos anteriores usados na comparação foram conferidos antes/depois. SOURCE e Golden preservados. Não houve ajuste de limiar, pesos, GT, intensidade ou composição. Não houve vídeo novo, inferência do restante da cena, E2/E3/E4 ou alteração no produto.

Revisão local feita pelo autor; a tentativa de revisão independente falhou por limite de uso do agente. Não foi concedido novo selo independente. A rejeição independente anterior permanece válida. Qualidade temporal perceptual: **UNDETERMINED**, sem playback. Três frames vizinhos não são holdout e não permitem generalizar a contagem de passagens para os demais trechos.

**Próximo passo E5:** encerrar a hipótese de ajuste de repetição neste braço. Selecionar e congelar um candidato orientado à fidelidade em compressão, verificando treinamento/pesos e preferindo avaliação nativa; se reutilizar arquitetura, separar explicitamente mudança de checkpoint e runtime. Não repetir o benchmark completo com os mesmos pesos/threshold esperando que a limpeza única resolva. A equivalência do adapter legado continua limitação declarada, sem atribuir toda falha ao modelo oficial.

[Comparador dos estágios](comparison.html) · [Resultado](result.json) · [Contrato](contract.json).
'''
(R/'REPORT.md').write_text(report,encoding='utf-8')
html='''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>E5 — primeira passagem de cleaning</title><style>body{background:#101920;color:#eee;font:17px system-ui;margin:24px}img{display:block;max-width:100%}a{color:#9de2ff}.native img{max-width:none}button{font:inherit;padding:10px}</style><h1>E5 — dano já na primeira passagem</h1><p>GT / degradado acima; passagem 1 / SR arquivado abaixo. Uma única passagem executada; nenhuma repetição. Comparação estática, sem revisão temporal.</p><p><a href="REPORT.md">Relatório e limitações</a> · <a href="result.json">Métricas</a></p><button onclick="document.body.classList.toggle('native')">Pixels nativos</button>'''
for i in (24,25,26):html+=f'<h2>SOURCE {i}</h2><img src="comparison-{i}.png" alt="GT, degradado, primeira limpeza e SR no quadro {i}">'
(R/'comparison.html').write_text(html+'</html>',encoding='utf-8')
entry='''### E5 — dano na primeira limpeza confirmado — 13/09/2026

**FIRST_PASS_DAMAGE; REJECT MANTIDO.** Uma janela RealBasicVSR com entradas SOURCE 24/24/24/25/26/27/28 foi instrumentada sem alterar o forward. Houve somente uma passagem: resíduo médio 3,659595/255 abaixo do threshold 5/255. As saídas cleaning e raw x4 dos quadros 24–26 reproduziram exatamente os arquivos anteriores (seis comparações, delta zero).

A primeira passagem já perdeu estrutura e piorou PSNR em 5,55–5,72 dB nos três quadros. A hipótese de amplificação por repetição fica descartada nesta janela; modificar a parada para reduzir passagens não corrige este caso. Não generalizar a contagem para outras janelas nem atribuir a causa ao treinamento sem certificar equivalência do runtime legado.

Forward instrumentado 8,861 s; runner 19,803 s, incluindo cópias do hook. SOURCE/Golden/artefatos anteriores preservados, GPU externa US$ 0. Inspeção local dos três painéis realizada; nova revisão independente indisponível por limite de uso. Rejeição anterior mantida, temporal UNDETERMINED. Próximo passo: seleção de candidato E5 orientado à fidelidade em compressão, com novo contrato; encerrar ajustes de repetição neste braço. [Relatório](cleaner-e5-cleaning-passes-20260913/REPORT.md) · [Estágios](cleaner-e5-cleaning-passes-20260913/comparison.html).

'''
road=R.parent/'CLEANER-ROADMAP-AND-MODEL-ROUTING.md';text=road.read_text(encoding='utf-8')
if '### E5 — dano na primeira limpeza confirmado' not in text:text=text.replace('## Ordem e dependências\n','## Ordem e dependências\n\n'+entry,1)
text=re.sub(r'1\. E5: instrumentar uma janela congelada RealBasicVSR.*?\n2\. E3','1. E5: selecionar um candidato orientado à fidelidade em compressão e congelar código/pesos/runtime antes do teste no GT disponível. O diagnóstico confirmou dano na primeira passagem do RealBasicVSR; encerrar a hipótese de amplificação por repetição nesta janela. Não repetir os mesmos pesos com ajuste de parada como solução. A revisão perceptual dos candidatos rejeitados permanece complementar.\n2. E3',text,count=1)
text=text.replace('Saída imediata: decisão causal sobre as passagens do cleaning, com novo contrato curto antes de nova inferência.','Saída imediata: seleção fundamentada e contrato de outro candidato E5. O diagnóstico de passagens está concluído nesta janela.')
road.write_text(text,encoding='utf-8')
cp=R.parent/'cleaner-presence-control-20260912-v2/MILESTONE_CONTEXT.md';text=cp.read_text(encoding='utf-8')
if '### E5 — dano na primeira limpeza confirmado' not in text:cp.write_text(text+'\n\n'+entry,encoding='utf-8')
for p in [Path(__file__),Path(__file__).with_name('e5_cleaning_passes.py')]:shutil.copy2(p,R/p.name)
assert all((R/p).exists() for p in re.findall(r'(?:href|src)="([^"]+)"',html))
assert all(b.sha(Path(p))==h for p,h in c['input_hashes'].items())
b.dump(R/'review.json',{'reviewer':'primary author, non-independent','inspected':[24,25,26],'finding':'visible structural damage after first and only cleaning pass','independent_review':'UNAVAILABLE_AGENT_USAGE_LIMIT','parent_reject_maintained':True,'temporal':'UNDETERMINED'})
b.dump(R/'validation.json',{'all_input_hashes_rechecked':True,'all_six_archive_comparisons_exact':True,'links_exist':True,'browser':'NOT_TESTED','artifact_hashes':{str(p.relative_to(R)):b.sha(p) for p in R.rglob('*') if p.is_file() and p.name!='validation.json'}})
b.dump(R/'record-args.json',{'category':'experiments','title':'Cleaner E5 first cleaning pass damage single window 2026-09-13','body':'CONFIRMED in existing runtime: one unchanged RealBasicVSR forward with non-mutating hook, input SOURCE24/24/24/25/26/27/28. Only one cleaning pass, mean abs residue3.659595/255 below5/255. Raw and clean core24-26 exactly match six archived floats, max delta0. First pass already loses5.55-5.72dB PSNR and visibly damages structure. Iterative amplification excluded for this window. Parent REJECT maintained. New independent reviewer unavailable usage limit; author static review only, temporal UNDETERMINED. No production/Golden/E2/E3/E4 changes, GPU externalUSD0. Next: select fidelity-oriented compression candidate under new contract; no repeated threshold tuning. Legacy runtime equivalence not certified.','sources':[str(R/'REPORT.md'),str(R/'result.json'),str(R/'contract.json')],'evidence':'CONFIRMED'})
print('Saved diagnosis, comparator, hashes and continuity.')
