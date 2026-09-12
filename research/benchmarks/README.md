# Benchmark de restauração

O harness processa sequências PNG alinhadas para separar reconstrução de perdas
de codec. `bootstrap.py` gera três controles determinísticos: fundo estático,
pan sintético e corte de cena. Todos incluem entrada com texto, máscara binária
e ground truth. São testes do instrumento, não um dataset representativo de pessoas,
cabelo, água ou legenda profissional.

## Executar

Crie `research/benchmarks/args.json` com:

```json
{"manifest":"data/static/case.json","engine":"opencv-telea","radius":3}
```

```powershell
research/.venv/Scripts/python.exe research/server.py --call benchmark_engine --args-file research/benchmarks/args.json
```

`identity` preserva a entrada e deve falhar em remover texto. `opencv-telea` é
um controle real de inpainting espacial em CPU. Ambos geram diretório novo e
relatório JSON em `runs/`. `compare_results` recebe caminhos relativos a
`research/benchmarks`, por exemplo `runs/ID/report.json`.

Para Cleaner, upstream ou referências externas, exporte frames com nomes idênticos
sob `research/benchmarks` e use `import_result`. Informe engine, configuração,
revisão, origem e direitos em `provenance`. A ferramenta mede qualidade dos frames,
mas não inventa duração/GPU/custo do job. Preserve o relatório externo junto ao caso.
O laboratório não chama endpoints de produção nem provisiona GPU.

Para extrair um vídeo local, coloque-o sob `research/benchmarks` e use
`extract_comparison_frames(video_path="data/clip.mp4")`. FFmpeg/ffprobe precisam
estar no PATH. A ferramenta preserva timestamps e recusa VFR/descontinuidades,
contagem acima do orçamento e truncamento implícito. Os frames decodificados são
lossless em PNG, mas já carregam as perdas do codec da entrada. Construa o manifest
com máscara/GT alinhados; a extração sozinha não cria ground truth.

## Contrato de dados

Um manifest contém `id`, `kind`, `categories`, `fps`, `frames`, diretórios `input`,
`mask`, `ground_truth` opcional, `scene_cuts` e direitos. Diretórios são relativos
ao manifest e não podem sair da sua pasta. Nomes, contagem e geometria devem
coincidir. Máscaras de avaliação são 0/255; alpha de composição deve ser um artefato
separado. Não redimensionar saída para esconder incompatibilidade. Vídeo com FPS
variável precisa preservar timestamps em uma etapa de preparação antes desta avaliação.

`inputs` registra hashes de todas as sequências e `output_sha256` identifica a saída.
PNG/BGR e SSIM devem permanecer iguais entre revisões para comparação reproduzível.
Para vídeos codificados, faça um braço adicional input→decode→encode sem remoção.
Compare o efeito do codec separado do efeito da composição.

## Métricas implementadas

| Campo | Definição | Limite |
|---|---|---|
| outside_mask_mae | Erro absoluto normalizado por canal fora da máscara contra entrada | Não avalia pixels removidos |
| boundary_outside_mae | Mesmo erro no anel externo de 1 pixel | Não captura toda a percepção de halo |
| mse_gt / psnr_db | MSE agregado normalizado e −10 log10(MSE) contra GT | Dominância de áreas grandes não editadas |
| ssim_gt | SSIM local Gaussian 11×11, sigma 1.5, BGR, média | Não é LPIPS nem julgamento humano |
| temporal_error_delta_proxy | Variação absoluta do erro contra GT entre frames, excluindo cuts | Sem warping: proxy, não flicker perceptual |
| laplacian_variance_proxy | Variância do Laplaciano | Pode premiar ruído |

PSNR infinito é representado como `psnr_db: null` e `perfect_gt_match: true`.
GT ausente gera campos GT nulos. Máscara total gera outside-mask nulo; máscara
vazia não prova remoção. LPIPS, OCR residual, ghosting e métricas com flow ainda
precisam de plugins de avaliação independentes e anotações. Nunca preencher com zero.

## Desempenho e custo

O tempo CPU atual inclui ler PNG, processar e gravar PNG; exclui a avaliação.
RSS é amostrado após cada frame e inclui o processo inteiro: não é pico exato nem
memória incremental do engine. GPU, VRAM e RunPod são nulos nesses controles.

Um runner GPU futuro deve registrar cold/warm start, loading, decode, OCR,
inpaint e encode, GPU/driver/CUDA/framework, commit, hash dos pesos, precisão,
resolução, janelas, seeds e comando. Sincronize CUDA nas fronteiras de medição.
Custo = tempo faturado × preço aplicável, incluindo cold start e retries cobrados;
não converter FPS CPU em custo RunPod. Preserve falhas/OOM no denominador.

## Protocolo para conclusão de qualidade

Use vídeos próprios/licenciados e reserve um conjunto sem ajuste de parâmetros.
Escolha uma variável por experimento, preserve a baseline e registre critérios
antes da execução. Para referências comerciais, confirme permissão específica:
os termos Vmake consultados impedem presumir autorização para melhorar outro serviço.

O objetivo futuro é 100+ casos reais, estratificados por categoria, com comparações
cegas, ordem randomizada, rubrica de 0–4 para resíduo/blur/flicker/ghosting/textura/
reconstrução/preservação, e vitória/empate/derrota por categoria. Defina empate
antes do julgamento e relate intervalo de confiança e discordância entre revisores.
Múltiplos frames do mesmo vídeo não são amostras independentes. Casos difíceis
precisam aparecer no resultado, sem seleção apenas dos melhores exemplos.
