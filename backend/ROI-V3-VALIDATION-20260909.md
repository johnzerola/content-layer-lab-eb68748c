# CleanerIA: evolução automática e controle de custo

Atualização de 09/09/2026, aproximadamente 22:43 BRT. Substitui, para o estado
atual, a auditoria anterior em `CLEANERIA-ESTADO-E-CUSTOS-20260909.md`.

## Resultado e limites

Nova comparação: `G:\dowloand\teste\resultado-automatico-v3-20260909\comparison.html`.
Saída: 147 quadros, 4,9 segundos, 1080×1920, 30 FPS, áudio preservado; decodificação
integral com FFmpeg sem erro. SHA256 de `output.mp4`:
`e4aa6aaebdff8aedee3b24f75e7df9455da1b0ef66e91087433c99094d5295e4`.
O resultado refinado que o usuário avaliou como “95%” permanece intacto.

O modo legenda agora separa máscaras de reconstrução e composição por cena.
A primeira dá contexto ao modelo; a segunda limita a alteração à região da
legenda. As restrições de seleção, proteção e tempo continuam aplicadas.
Quadros com máscaras vazias permanecem candidatos a referências; isso não
prova que o detector acertou ou que estejam totalmente sem texto.

Duas regressões reais orientaram os ajustes:

- A faixa inteira escondia referências parciais da fivela. Uma sequência de
  legendas pequenas agora conserva essas partes visíveis na máscara de inferência.
- A janela temporal de 32 quadros perdia as referências do início da primeira
  cena. Cenas de até 80 quadros com candidatos consecutivos e referências
  amostradas podem usar a cena inteira, com referências menos densas. Os limites
  explícitos de memória continuam respeitados; uma tentativa após OOM reduz a janela.

A revisão dos quadros 30, 50, 60, 70, 73, 75, 85, 90, 103, 106, 120 e 140 mostrou
melhor recuperação da janela e da fivela. Ainda há pequena emenda no fim da
primeira cena e suavização no tecido da terceira. Não há equivalência comprovada
com Vmake, nem cobertura comprovada de neon, glow animado ou sombra extensa.
A referência Vmake tem deslocamento temporal e diferenças de aparência; não foi
usada como entrada do modelo ou para treinamento. A revisão visual foi por
quadros amostrados, não uma avaliação humana contínua de todo o movimento.

Os trechos alterados foram reprocessados com as máscaras automáticas já geradas;
os demais foram reutilizados após verificar igualdade de **todas** as máscaras
de inferência/composição e dos parâmetros temporais da política atual. O manifesto
identifica cada origem e checksum. Não houve escolha manual de máscaras por cena.
A região inicial de legenda foi a seleção revisada dessa amostra. Isso não
valida a seleção automática da região para qualquer vídeo enviado ao site.

## Publicação e operação

| Camada | Estado verificado |
| --- | --- |
| VPS Hostear | Publicada `scene-roi-v3`; `/v1/health` responde 200. Composição anterior, modelos e armazenamento preservados. |
| Separação de áudio | `/v1/audio/capabilities` responde 200 e Demucs pronto após a atualização. |
| Imagem RunPod | Publicada, importação do handler verificada em container sem GPU; template atualizado para digest imutável abaixo. |
| Capacidade RunPod | `workersMin=0`, `workersMax=0`; nenhum worker, Pod dedicado ou job ativo na última consulta. |
| Aplicação web | Código alterado e validado localmente; frontend e funções TypeScript ainda não publicados no site/Lovable. |

Imagem GPU: `docker.io/nivaldo12/leaneria-runpod@sha256:7be698717599c0d07c1e83538138812d6599fc76f600a06d2b12e37cf7356939`.
Endpoint: `km860ju9ded2e0`; template: `gi3jlnv69u`.
Imagem CPU: `content-layer-lab-cleaner-worker-cpu:scene-roi-v3-20260909`.
Rollback CPU: `content-layer-lab-cleaner-worker-cpu:before-roi-v3-20260909`.
Deploy reprodutível: `scripts/deploy_scene_roi_hostear.py`; preserva as camadas
Compose anteriores e exige confirmação de revisão pela saúde do serviço.

Um diagnóstico remoto limitado, ainda com a imagem v2, ficou `IN_QUEUE` até
atingir o prazo. **Nenhuma inferência remota da amostra foi submetida.** A saída
do diagnóstico cancelou/desabilitou capacidade e apagou o projeto temporário
criado na Hostear. A consulta posterior ao ID do diagnóstico retornou 404 e
confirmou fila/workers zerados. A v3 foi publicada sem repetir a solicitação GPU.
Não existe ainda tempo faturado medido por vídeo nessa nova revisão.

O volume `cleaneria-models`, 50 GB, fica em `EU-RO-1`. A restrição de localização
pode afetar a oferta de GPU, mas a consulta realizada não comprovou a causa
da fila. A documentação confirma essa restrição dos volumes de rede:
[RunPod, configuração do endpoint](https://docs.runpod.io/serverless/endpoints/endpoint-configurations).

## Desligamento e limpeza

- O controlador web passa a verificar, antes de enviar jobs, mínimo zero,
  máximo um worker, uma GPU, idle timeout de até 5 s e execução até 600 s.
  Capacidade zerada ou revisão incompatível bloqueiam envio. Essa proteção web
  está no código local; sua publicação ainda falta.
- As solicitações têm prazo de execução e TTL. Cancelamentos que falham ficam
  pendentes para nova tentativa; jobs concluídos não são despachados novamente.
- Trocar o preset na tela deixa de iniciar um diagnóstico GPU pago. O botão
  explícito de teste informa a possibilidade de cobrança. O cancelamento mostra
  quando a limpeza ainda está pendente, em vez de afirmar que já foi concluída.
- Após upload da resposta, o handler RunPod limpa os diretórios temporários do
  job em `finally`. O controlador remove arquivos dos chunks após salvar o resultado.
- A VPS publicada já limpa máscaras, cenas e intermediários ao terminar, falhar
  ou cancelar, com proteção contra apagar processamento ainda ativo, links ou
  caminhos fora do armazenamento. Limpezas pendentes são tentadas novamente.
- Original enviado, resultado e prévia permanecem disponíveis para comparação
  e download; a retenção atual na VPS é **72 horas**. Arquivos originais em `G:`
  e comparações locais não fazem parte dessa limpeza. Os modelos são preservados.

Existe migração de cron para `/api/public/cleaner-chunk-tick` no repositório.
A alteração permite repetir limpezas de jobs terminais mesmo com GPU desativada;
a execução do cron no site publicado não foi verificada nesta entrega.
A VPS permanece ligada porque hospeda os serviços; seu custo não é eliminado
pelo desligamento da GPU. Um volume de rede também continua cobrado sem workers.

## Valores consultados

`scripts/audit_runpod_costs.py` consulta a conta sem iniciar recursos. Resultado
salvo em `RUNPOD-COST-AUDIT-20260909.json`. A API informou **US$ 0,005/h** de gasto
corrente da conta, com zero workers e um volume de 50 GB. Essa taxa instantânea
não é a fatura histórica nem a tarifa de uma placa em processamento.

| GPU permitida no endpoint | Referência pública Serverless, USD/h |
| --- | ---: |
| A5000 / L4 / RTX 3090 | 0,69 |
| RTX 4090 | 1,10 |
| RTX 5090 | 1,58 |

São tipos configurados, não identificação de uma placa efetivamente alocada
neste teste. Preços de Pods dedicados são outra modalidade. A tabela pública
de armazenamento padrão indica US$ 0,07/GB/mês: 50 GB correspondem a cerca de
US$ 3,50/mês. A projeção da taxa horária arredondada da API pode diferir disso.
[RunPod, preços](https://www.runpod.io/pricing).

Exemplo apenas aritmético: cinco minutos faturados em uma 4090 a US$ 1,10/h
custam US$ 0,0917 de GPU. Isso **não** significa cinco minutos de vídeo. A
cobrança considera os períodos faturáveis do worker, incluindo preparação e
ociosidade conforme as regras do provedor; armazenamento e VPS são separados.
[RunPod, cobrança Serverless](https://docs.runpod.io/serverless/pricing).

Agora são registrados nome da GPU, revisão, tempo do handler incluindo upload e
tempo de execução informado pelo provedor, inclusive falhas observadas. Nenhum
desses relógios isolados é uma fatura completa. O benchmark local na RTX 2060
não foi convertido em estimativa de velocidade/preço de placas RunPod.

## Verificação e pendência operacional

- Backend final: **150 passaram, 1 ignorado** (teste de symlink sem suporte no Windows).
- CleanerIA TypeScript: **28 testes passaram** em cinco arquivos.
- TypeScript sem erros; build de produção validado.
- Nova montagem: duração, FPS, resolução, áudio, checksums e decode verificados.
- Browser local sem erros de console e sem overflow nas larguras 390 e 1366;
  a tela autenticada do estúdio não foi exercitada na sessão de navegador disponível.

Falta concluir uma inferência curta na RunPod, conferir GPU/tempo e imagem da
saída, e então publicar e validar o fluxo autenticado no site. Até isso ocorrer,
não afirmar que enviar um vídeo pelo site já reproduz esta comparação.
