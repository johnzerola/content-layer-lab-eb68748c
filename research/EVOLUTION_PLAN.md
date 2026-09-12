# Plano de evolução baseado em experimentos

O laboratório tem servidor e controles CPU verificáveis. Este plano organiza
experimentos futuros; **nenhuma mudança de produção está aprovada por resultados
de qualidade nesta etapa**. Os gates que faltam são baseline implantada identificada,
dataset real/licenciado, snapshots/pesos autorizados e runner GPU isolado.

## P0 — Instrumento, baseline e máscara

### P0.1 — Paridade e atribuição de perdas

**Problema/evidência:** parâmetros locais diferem do script ProPainter; resize,
composição e codec podem explicar perda sem defeito no gerador.
[Arquitetura](current-system/architecture.md), [ProPainter](projects/propainter.md).

**Comportamento atual:** limites de resolução, dilation local 1/2, janelas
condicionais e saída codificada. Produção efetiva não verificada.

**Ideia:** comparar upstream e adapter com frames/máscaras/weights idênticos,
incluindo controle encode-only e saída antes da composição.

**Arquivos afetados em experimento futuro:** cópia isolada de
`backend/app/engines/propainter_official.py`, `backend/app/utils/video.py`;
relatórios e harness em `research/`. Nenhum desses arquivos de produção foi editado pelo laboratório.

**Implementação:** registrar imagem/pesos/args/hashes; separar decode, resize,
mask transform, engine e encode; fixar seed onde aplicável; variar um estágio por vez.

**Benchmark:** pelo menos 20 casos reais de diagnóstico, depois held-out; input,
GT e máscaras com mesma geometria/timestamps. Medir dentro/fora da máscara,
SSIM/PSNR, revisão temporal e tempo/VRAM.

**Sucesso:** diferenças explicáveis e reproduzíveis; perda fora da máscara no
braço lossless zero; nenhuma alteração de duração/FPS; qualidade sem regressão
nas categorias. Limiar perceptual deve ser registrado antes do teste.

**Rollback:** descartar checkout experimental; conservar baseline.
**Licença:** S-Lab e cadeia de pesos precisam de autorização aplicável antes do uso pretendido.

### P0.2 — Minimum sufficient mask

**Problema/evidência:** máscara insuficiente deixa glow/outline; excessiva remove
fundo recuperável. [Gap de máscaras](GAP_MAP.md), [DiffuEraser](projects/diffueraser.md).

**Comportamento atual:** detector e heurísticas locais, dilation adicional nos
engines e composição com regras próprias.

**Ideia:** ablação com máscara anotada, máscara atual e expansões graduais; manter
o mesmo engine, resolução e referência temporal.

**Arquivos futuros:** cópias de `services/text_detect.py`, `mask.py`, `mask_modes.py`,
`subtitle_policy.py`; nenhuma implantação automática.

**Implementação:** produzir GT sintético sobre vídeos próprios, anotar texto fino,
shadow/glow/alpha; conservar máscaras antes e depois do engine.

**Benchmark/sucesso:** reduzir resíduo e erro dentro da máscara sem aumentar
apagamento de rosto/cabelo, erro externo ou flicker em held-out; reportar por estilo,
não só média global. Critérios de anotação congelados antes da execução.

**Rollback/licença:** manter máscara original selecionável; recursos próprios e
licenças do engine usado. Não remover fallback sem substituto comprovado.

## P1 — Informação real, ROI e fronteiras temporais

### P1.1 — Referências e propagação com confiança

**Problema/evidência:** contexto curto pode perder fundo que reaparece; flow
errado gera ghosting. [RAFT](projects/raft.md), [ProPainter](projects/propainter.md).

**Atual:** Farneback em tracking local e RAFT dentro do engine; referências
condicionadas por orçamento. **Ideia:** testar seleção de referências por visibilidade
e erro forward/backward, comparando `ref_stride` e janelas com memória registrada.

**Arquivos futuros:** cópias de `services/tracking.py`, `video/subtitle_references.py`
e adapter ProPainter. **Implementação:** guardar alinhamento, oclusões e rejeições;
não cruzar cuts; comparar fundo real disponível vs completamente oculto.

**Benchmark/sucesso:** menos erro/ghosting em reaparecimento, sem piorar cortes e
sem ultrapassar orçamento de custo pré-definido. **Rollback:** retorno à seleção
anterior. **Licença:** RAFT/ProPainter/pesos revisados por artefato.

### P1.2 — Margem de ROI e junções de chunks

**Problema/evidência:** contexto cortado e sobreposição podem criar costuras.
[Pipeline local](current-system/pipeline.json), [PRs](projects/community-findings.md).

**Atual:** inferência por cena, margem configurável e remontagem. **Ideia:** variar
somente margem/contexto, preservando resolução efetiva e fronteiras de cena.

**Arquivos futuros:** cópias de `services/inference_region.py`, `scene_pipeline.py`
e `chunking.py`. **Implementação:** casos com objeto cruzando ROI, pan e corte
exatamente em limites de janela; capturar frames antes/depois da junção.

**Benchmark/sucesso:** preservar frame count, áudio e geometria; reduzir erro de
borda sem dilatar área editada ou introduzir salto temporal. **Rollback:** ROI
anterior. **Licença:** mantém a cadeia do engine, sem nova licença implícita.

## P2 — Segmentação e geração alternativas

### P2.1 — SAM2/Cutie para máscaras; diffusion apenas onde ajuda

**Problema/evidência:** estabilidade de máscara e preenchimento de regiões sem
fundo observável são problemas diferentes. [SAM2](projects/sam2.md),
[Cutie](projects/cutie.md), [DiffuEraser](projects/diffueraser.md).

**Atual:** providers presentes não provam modelo carregado; max usa cadeia generativa.
**Ideia:** duas ablações separadas: propagação de máscara com engine fixo; depois
prior-only vs diffusion com máscara fixa.

**Arquivos futuros:** adapters somente no laboratório para snapshots independentes.
**Implementação:** reiniciar memória por cena; medir drift em texto animado; usar
seeds repetidas em diffusion e conservar prior.

**Benchmark/sucesso:** ganhos consistentes por categoria sem hallucinations
adicionais e com custo documentado. Uma melhoria isolada não vira default.
**Rollback:** remover candidato do conjunto experimental.
**Licença:** SAM2/Cutie/checkpoints e dependências; DiffuEraser não elimina S-Lab.

## P3 — Eficiência, novos engines e router

### P3.1 — Residência de tensores e expansão de modelos

**Problema/evidência:** janelas maiores consomem memória; novos modelos podem ter
licenças restritas. [Community findings](projects/community-findings.md),
[VideoPainter](projects/videopainter.md), [SEDiT](papers/sedit.md).

**Atual:** há retries/limites locais, sem benchmark GPU deste lab. **Ideia:** avaliar
offload e precisão com mesma qualidade; só depois comparar engines adicionais.

**Arquivos futuros:** runner experimental com comando/ambiente/pesos fixados.
**Implementação:** fixar base/head dos forks, medir warm/cold, RAM/VRAM/tempo por
estágio, confirmar equivalência temporal; não confundir streaming com frames
inteiros ainda residentes em memória.

**Benchmark/sucesso:** melhorar a fronteira custo/qualidade em held-out, preservando
regressões. Router FAST/QUALITY/MAX só após dados por categoria suficientes;
scores de confiança devem ser calibrados contra revisão, não fórmulas inventadas.
**Rollback:** não selecionar candidato. **Licença:** VideoPainter/E2FGVI não
liberados para comercial pelos termos padrão; SEDiT ainda requer auditoria.

## Gate comercial

Uma comparação específica com Vmake exige permissão aplicável aos termos atuais.
O protocolo está preparado em [benchmarks](benchmarks/README.md), mas não foi
executado. Não alegar equivalência/superioridade sem 100+ casos representativos,
vitórias/empates/derrotas por categoria e revisão das condições de uso.
