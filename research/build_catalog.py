"""Render curated research cards with pinned evidence and explicit unknowns."""
import ast
import json
from pathlib import Path
from lab.core import ROOT
from collect_sources import REPOS

# Human-reviewed analysis, not assertions generated from repository popularity.
CARDS = {
 'propainter': ('ProPainter', '2309.03897', '2023',
  'Reconstrução temporal com propagação em imagem/features e Transformer esparso guiado por máscara.',
  'O script lê frames/máscaras, ajusta múltiplos de oito e normaliza tensores. RAFT_bi estima flow; '
  'RecurrentFlowCompleteNet completa regiões de flow; img_propagation recupera pixels; InpaintGenerator.forward '
  'combina features locais e referências antes de decodificar e compor. A máscara atualizada após propagação é distinta da máscara original.',
  'Separar qualidade de flow, cobertura de máscara e capacidade generativa. Fundo reaparecendo fora da janela não pode ajudar aquela inferência. '
  'Tensores globais e correlações podem consumir memória apesar de subvideo_length pequeno.',
  'Comparar upstream com o adapter local usando frames/máscaras idênticos; medir dilation efetiva, resize, ref_stride, subvideo_length e composição.',
  'S-Lab 1.0; uso comercial requer autorização específica', 'ProPainter.pth + recurrent_flow_completion.pth + raft-things.pth'),
 'diffueraser': ('DiffuEraser', '2501.10018', '2025',
  'Inpainting generativo de vídeo com prior ProPainter, Stable Diffusion, BrushNet, motion UNet e PCM.',
  'run_diffueraser.main constrói prior e diffusion; DiffuEraser.forward codifica o prior no VAE, prepara ruído '
  'e faz inferência temporal. read_mask executa erosão seguida de dilation. A composição usa máscara suavizada '
  'quando blended=True. read_priori apaga o intermediário após lê-lo: preserve uma cópia para diagnóstico.',
  'O prior e as condições limitam alucinação, mas não provam recuperação do fundo real. '
  'Há requisito de ao menos 22 frames e alinhamento de FPS; clipes curtos e cortes exigem atenção. '
  'A expansão e o blur da máscara podem afetar pixels próximos à borda.',
  'Comparar prior isolado e saída diffusion sobre o mesmo caso, preservando máscaras antes/depois do preprocessing, seed e resolução.',
  'Apache-2.0 no projeto; ProPainter e demais pesos mantêm licenças próprias', 'BrushNet + UNet + SD1.5 + VAE + PCM + prior ProPainter'),
 'raft': ('RAFT', '2003.12039', '2020',
  'Optical flow de pares de imagens com volumes de correlação e atualização recorrente.',
  'RAFT.forward normaliza RGB para [-1,1], extrai features/contexto, cria CorrBlock e atualiza coordenadas '
  'com BasicUpdateBlock. O flow sai da diferença de grids; upsample_flow usa combinação convexa aprendida. '
  'core/corr.py inclui caminho alternativo CUDA para correlação.',
  'Não reconstrói pixels nem identifica legendas. Flow em oclusões ou texto sobreposto pode apontar correspondência errada; '
  'EPE em benchmark de flow não mede qualidade de inpainting.',
  'Investigar confiança forward/backward e máscaras de oclusão antes de trocar o estimador. Medir VRAM da correlação e erros de warping.',
  'BSD-3-Clause no código; pesos/datasets precisam de evidência própria', 'Pesos por domínio, incluindo raft-things usado pelo adapter ProPainter'),
 'sttn': ('STTN', '2007.10247', '2020',
  'Inpainting conjunto por atenção espacial-temporal.',
  'test.py::main_worker codifica frames mascarados, seleciona vizinhos e referências, chama InpaintGenerator.infer '
  'e decodifica frames locais. Sobreposições de janelas são combinadas; o script de demonstração fixa 432×240 e 24 FPS.',
  'Esses defaults da demonstração não devem ser copiados para produção. O provider ONNX local é outro artefato: '
  'sua forma temporal e equivalência numérica precisam ser verificadas contra upstream.',
  'Comparar export ONNX e PyTorch em um caso alinhado antes de atribuir diferenças ao modelo; registrar shape, máscaras e frame rate.',
  'MIT no LICENSE consultado; confirmar termos dos checkpoints/export', 'Checkpoint netG upstream; sttn.onnx local é export separado'),
 'lama': ('LaMa', '2109.07161', '2021',
  'Inpainting de imagem com convoluções Fourier para contexto amplo.',
  'bin/predict.py carrega configuração/checkpoint, binariza máscara, executa modelo ou refinamento opcional '
  'e remove padding ao salvar. saicinpainting/training/modules/ffc.py implementa a mistura de componentes '
  'locais e espectrais. Não há memória de vídeo nessa entrada de inferência.',
  'Aplicação frame a frame não garante estabilidade temporal. O export Carve/LaMa-ONNX referenciado localmente '
  'tem proveniência própria; licença do código upstream não basta para certificar o export.',
  'Usar como controle espacial para separar problemas de textura de problemas temporais; medir flicker em sequência, não só imagem parada.',
  'Apache-2.0 no código; conferir pesos e export ONNX individualmente', 'big-lama; export ONNX do provider local requer auditoria'),
 'sam2': ('SAM 2', '2408.00714', '2024',
  'Segmentação promptável de vídeo com memória de inferência.',
  'SAM2VideoPredictor.init_state prepara vídeo/estado; add_new_points_or_box e add_new_mask criam condições; '
  'propagate_in_video percorre frames, preserva IDs e retorna máscaras na resolução original. '
  'Há propagação reversa e opções de offload de vídeo/estado para CPU.',
  'Segmentação de objeto não equivale a segmentação precisa de strokes, glow ou alpha de legendas. '
  'O provider local pode executar GrabCut: medir como SAM2 seria um erro de atribuição.',
  'Testar estabilidade e cobertura de texto fino com detector fixo; recomeçar estado por cena. '
  'Comparar memória e qualidade sem modificar o worker atual.',
  'Apache-2.0 para código/model checkpoints conforme README; SA-V e terceiros separados', 'SAM2/SAM2.1 conforme snapshot; não presumir pesos ONNX equivalentes'),
 'e2fgvi': ('E2FGVI', '2204.02663', '2022',
  'Inpainting end-to-end guiado por flow com propagação e síntese.',
  'test.py prepara referências e vizinhos; InpaintGenerator.forward_bidirect_flow calcula flow local '
  'e forward combina propagação/features e síntese. A família inclui variante HQ para tratar resolução diferentemente.',
  'Avaliar a variante exata; resultados publicados não substituem benchmark de legendas. '
  'Licença não comercial impede tratá-lo como substituto comercial liberado.',
  'Referência acadêmica para ablação de propagação/features, mantendo máscaras e resolução fixas.',
  'CC-BY-NC-4.0', 'E2FGVI e E2FGVI-HQ: registrar checkpoint e variante'),
 'fuseformer': ('FuseFormer', '2109.02974', '2021',
  'Inpainting por Transformer com interação de patches sobrepostos.',
  'InpaintGenerator.forward codifica frames, usa SoftSplit (Unfold), Transformer e SoftComp (Fold), '
  'soma features e decodifica. O objetivo técnico é reduzir perda de detalhes nas fronteiras dos tokens.',
  'A implementação consultada contém formas de referência fixas em módulos; portabilidade de resolução exige validação. '
  'Não há licença raiz clara na seleção coletada: confirmar antes de adoção.',
  'Estudar composição de patches como conceito; não copiar módulos antes de resolver licença e equivalência.',
  'UNKNOWN; não foi identificado LICENSE raiz na coleta', 'Checkpoint upstream; licença de pesos pendente'),
 'focal-transformer': ('Focal Transformer', '2107.00641', '2021',
  'Backbone visual com atenção local fina e global agregada.',
  'O projeto é um backbone de visão; seus resultados incluem classificação, detecção e segmentação. '
  'Atenção focal reduz custo de contexto amplo por granularidade variável.',
  'Não é um engine pronto de remoção de vídeo, nem deve ser confundido com todos os modelos chamados FGT/FocalNet. '
  'Benefício para Cleaner é indireto e exige projeto/treino próprio.',
  'Manter como referência de mecanismo de atenção, abaixo das ablações dos engines existentes.',
  'MIT no código; checkpoints/dados separados', 'Backbones Focal-T/S/B; não são pesos de video inpainting'),
 'videopainter': ('VideoPainter', '2503.05639', '2025',
  'Inpainting/edição de vídeo com controle de contexto em backbone de difusão.',
  'O paper descreve encoder de contexto para vídeo mascarado e processamento de longa duração; '
  'a documentação distingue backbone e componentes de controle. Esta coleta acessou paper/README/LICENSE, '
  'mas não concluiu a inspeção do código de inferência por revisão imutável.',
  'Não declarar equivalência com Cleaner ou uso comercial permitido. A licença do projeto restringe '
  'uso a pesquisa/educação e inclui termos de CogVideoX; a cadeia de permissões deve ser avaliada inteira.',
  'Comparar apenas quando houver licença aplicável e recursos de laboratório; primeiro completar auditoria de inferência.',
  'Licença customizada não comercial; CogVideoX também possui termos próprios', 'Encoder de contexto + backbone; IDs exatos pendentes'),
 'cutie': ('Cutie', '2310.12982', '2024',
  'Video object segmentation com memória e identidade de objeto.',
  'InferenceCore.step recebe imagem, máscara opcional e IDs, codifica features, lê memória e devolve '
  'probabilidades. mem_every controla inserção de memória; clear_memory permite reiniciar estado. '
  'O código não preenche o fundo: o demo pode combinar outro engine para inpainting.',
  'Texto que muda palavra/cor não é um objeto rígido. A estabilidade de identidade pode não preservar '
  'strokes; controlar drift e reinicialização por cena.',
  'Teste de propagação de máscara contra Farneback com anotações e detector fixos.',
  'MIT no núcleo; RITM/demo/ProPainter e pesos separados', 'cutie-base conforme release; conferir licença do checkpoint'),
}

PAPER_DETAILS = {
 'propainter': '''**Treino e avaliação publicados:** YouTube-VOS (3.471 sequências de treino),
frames 432×240 e máscaras sintéticas estacionárias/de objetos. RFC usa L1 e suavidade
de segunda ordem; inpainting combina L1 e discriminador temporal. A seção 4 descreve
700 mil iterações por módulo, batch 8 e oito V100. A tabela 1 reporta PSNR 34,43
no YouTube-VOS e 34,47 no DAVIS; o protocolo DAVIS usa 50 clipes. Esses resultados
não são avaliações de legendas do Cleaner. As ablações de propagação têm orçamento
de treino diferente, então não misturar linhas como se fossem o mesmo experimento.
Métricas publicadas incluem PSNR, SSIM, VFID e erro de warping; nosso proxy temporal
não implementa essa última métrica.
[Fonte: paper, §§3.4–4 e tabela 1](https://arxiv.org/html/2309.03897v1).''',
 'diffueraser': '''**Treino e avaliação publicados:** a seção 4 descreve 3.183.727 clipes
filtrados do Panda-70M, separados por cena. Treinamento em resolução 512: primeiro
BrushNet/UNet sem motion module, depois motion module com sequências de 22 frames.
São 100 mil e 80 mil passos, respectivamente, com L2 e taxa 1e-5. A avaliação
apresentada é principalmente qualitativa. O exemplo de eficiência reporta cerca
de 200 s para 10 s de vídeo 540p/25 FPS numa L20 com PCM em dois passos. O README
consultado informa outro tempo aproximado para 960×540; preservar ambas as fontes
e não atribuir diferença a regressão sem configuração equivalente. Resultados
visuais não estabelecem taxa de vitória nem recuperação fiel de fundo oculto.
[Fonte: relatório técnico, §4](https://arxiv.org/html/2501.10018v1).''',
 'raft': '''**Resultados publicados:** o abstract informa F1-all 5,10% no KITTI e EPE
2,855 no Sintel final. São métricas de optical flow, não remoção de texto; benchmark
Cleaner exige análise de oclusão e reconstrução. O treino detalhado por domínio
e licenças dos datasets precisam ser vinculados ao checkpoint que será utilizado.
[Fonte primária](https://arxiv.org/abs/2003.12039).''',
 'sttn': '''**Treino/métricas:** o paper usa perda adversarial espacial-temporal e
avalia máscaras estacionárias e de objetos móveis. A inferência oficial consultada
possui defaults de demonstração de resolução/FPS que devem ser distinguidos do
protocolo científico. Não foi transcrita tabela quantitativa nesta rodada.
[Fonte primária](https://arxiv.org/abs/2007.10247).''',
}


def main():
    project_lines = ['# Catálogo de projetos', '', 'Consulta: 10/09/2026. Medições publicadas não são resultados locais.', '',
                     '| Projeto | Função | Card |', '|---|---|---|']
    paper_lines = ['# Catálogo inicial de papers', '', 'Cards distinguem leitura de abstract/código de análise completa de treinamento.', '']
    for slug, (name, paper, year, task, method, limitations, experiment, license_, weights) in CARDS.items():
        repo = REPOS[slug]
        evidence_path = ROOT / 'research/projects/evidence' / (slug + '.json')
        evidence = json.loads(evidence_path.read_text(encoding='utf-8')) if evidence_path.exists() else None
        revision = evidence['revision'] if evidence else 'main (mutable; immutable SHA not collected: GitHub API rate limit)'
        source_ref = evidence['revision'] if evidence else 'main'
        urls = []
        files = []
        if evidence:
            for f in evidence['files']:
                if f['path'].endswith('.py') or f['path'].lower().startswith('license'):
                    url = f'https://github.com/{repo}/blob/{source_ref}/{f["path"]}'
                    symbols = []
                    if f['path'].endswith('.py') and not f['truncated']:
                        try:
                            symbols = [n.name for n in ast.walk(ast.parse(f['content'])) if isinstance(n, (ast.FunctionDef, ast.ClassDef))][:14]
                        except SyntaxError:
                            pass
                    files.append(f'- [{f["path"]}]({url})' + (': ' + ', '.join(f'`{s}`' for s in symbols) if symbols else ''))
        else:
            files.append(f'- [README](https://github.com/{repo}/blob/main/README.md) e [LICENSE](https://github.com/{repo}/blob/main/LICENSE); coleta sem revisão imutável.')
        text = f'''# {name}

Ano: {year}. Repositório: https://github.com/{repo}.
Revisão consultada: `{revision}`. Data: 10/09/2026.
Autores e autoria de módulos: consultar paper, histórico e headers dos arquivos abaixo.

## Tarefa e arquitetura

{task}

{method}

Fontes de implementação: arquivos abaixo; os comentários são análise da implementação consultada,
não confirmação de comportamento em produção.

## Arquivos e funções relevantes

{chr(10).join(files)}

## Estratégia temporal, máscaras e limitações

{limitations}

## Pesos, requisitos e licença

Pesos/modelos: {weights}.
Licença de código: {license_}. [Matriz por artefato](../licenses/matrix.md).
Framework principal: PyTorch, salvo exports específicos. Requisitos exatos estão no snapshot;
não instalar no ambiente do worker para estudar. VRAM e velocidade locais: **não medidas**.
Qualidade, strengths e weaknesses específicas de Cleaner dependem da ablação abaixo.

## Relação com Cleaner IA e experimento mínimo

{experiment}

Baseline deve identificar hash do adapter, configurações, input e máscara. Registrar resultado,
regressões e custo antes de propor mudança. [Mapa local](../current-system/architecture.md).

## Evidência e pendências

{'[Coleta estruturada](evidence/' + slug + '.json) contém fontes, hashes, tree e amostra de issues/PRs/releases/forks. A amostra não é revisão exaustiva.' if evidence else 'API GitHub limitada; fontes públicas consultadas manualmente. Inspeção por SHA e levantamento de issues/forks pendentes.'}
'''
        if paper:
            text += f'Paper: https://arxiv.org/abs/{paper}.\n'
        (ROOT / 'research/projects' / (slug + '.md')).write_text(text, encoding='utf-8')
        project_lines.append(f'| {name} | {task} | [{slug}]({slug}.md) |')
        if paper:
            papertext = f'''# {name}: paper card

Fonte primária: https://arxiv.org/abs/{paper}. Ano: {year}. Consultado em 10/09/2026.
Código: https://github.com/{repo}.

**Problema/core idea:** {task}

**Arquitetura e inferência:** [análise do código e fontes](../projects/{slug}.md).

**Limitação anterior investigada:** relação entre contexto, custo e preservação da informação;
consultar o paper para a ablação específica, sem generalizar o resultado entre tarefas.

**Treinamento/dataset/resultados numéricos:** não extraídos integralmente nesta card inicial;
nenhum score publicado foi convertido em resultado Cleaner. Antes de comparação, registrar
split, máscaras, resolução, métricas, protocolo e linha exata da tabela.

**Limitações para Cleaner:** {limitations}

**Código/modelo/licença:** {license_}. Licença do texto do paper é distinta de código e pesos.

**O que aprender/testar:** {experiment}

Status: catálogo inicial com mecanismo e código; reprodução e auditoria completa de treinamento pendentes.
'''
            if slug in PAPER_DETAILS:
                start = papertext.index('**Treinamento/dataset/resultados numéricos:**')
                end = papertext.index('**Limitações para Cleaner:**')
                papertext = papertext[:start] + PAPER_DETAILS[slug] + '\n\n' + papertext[end:]
            (ROOT / 'research/papers' / (slug + '.md')).write_text(papertext, encoding='utf-8')
            paper_lines.append(f'- [{name}]({slug}.md): [arXiv {paper}](https://arxiv.org/abs/{paper}).')
    (ROOT / 'research/projects/INDEX.md').write_text('\n'.join(project_lines) + '\n', encoding='utf-8')
    (ROOT / 'research/papers/INDEX.md').write_text('\n'.join(paper_lines) + '\n\n- [SEDiT](sedit.md): expansão recente para remoção de legendas.\n', encoding='utf-8')
    print('Rendered project and paper cards')


if __name__ == '__main__':
    main()
