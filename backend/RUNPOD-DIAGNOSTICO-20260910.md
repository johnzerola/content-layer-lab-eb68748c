# Diagnóstico RunPod e publicação do CleanerIA

Continuação da entrega `scene-roi-v3`, em 09/09/2026 à noite (10/09 em UTC).

Estado final atualizado em 10/09/2026, aproximadamente 00:26 BRT.

## Qualidade comparada com o resultado aprovado

Comparação direta criada em
`G:\dowloand\teste\comparacao-v3-vs-aprovado-20260910\comparison.html`.
Ela inclui o refinado que o usuário chamou de “95%”, o automático v3 e a
referência Vmake. Imagens ampliadas e um `review.json` documentam os quadros.

A fivela está mais definida nos quadros 85/90. A janela tem qualidade próxima
à versão aprovada nos quadros amostrados e ainda apresenta emenda no quadro 73.
O tecido continua suavizado dentro da área reconstruída, sem melhora consistente
sobre o refinado manual. A vantagem demonstrada é a automação e ganhos locais;
não foi demonstrado que todo o vídeo superou a avaliação subjetiva de 95%.

## Causa encontrada e correção

Uma tentativa com o modelo dentro da imagem e sem volume regional conseguiu
alocar o worker `sno9hr2k54ek28`. O log do sistema, em
`2026-09-10T02:44:21Z`, informou falha ao baixar a imagem privada: `pull access denied`.
Nenhuma inferência do vídeo ocorreu nesse worker.

Foi cadastrada uma credencial de registro usando, sem exposição em logs ou
arquivos do projeto, a credencial Docker já funcional da VPS. Os templates v3
e portátil foram atualizados; tanto a API REST quanto GraphQL confirmaram o
vínculo. Um novo diagnóstico com essa credencial permaneceu na fila até o prazo;
portanto ainda não comprova inicialização bem-sucedida com a correção.

Outros achados operacionais:

- Remover `networkVolumeIds` e enviar `dataCenterIds: []` pela API REST não
  limpou o campo legado `locations`. A consulta GraphQL ainda mostrava `EU-RO-1`.
  O teste sem região exigiu limpar `locations` explicitamente por `saveEndpoint`.
- A criação REST com `workersMax: 0` retornou máximo 3. Isso foi detectado e
  corrigido para zero antes de qualquer solicitação de processamento. Ler de
  volta os limites é necessário; confiar apenas no corpo enviado é insuficiente.
- O endpoint temporário criado para isolamento retornou HTTP 403 na API de
  invocação. Não foram enviados jobs a ele. A validação seguiu pelo endpoint
  existente que a credencial já permite acessar.
- A disponibilidade consultada indicou RTX 4090 alta em `EU-RO-1`; isso é uma
  indicação do catálogo, não garantia de alocação Serverless imediata.

## Imagem portátil

`Dockerfile.runpod-portable` conserva o runtime e a revisão v3 e incorpora os
três pesos ProPainter, com checksums iguais aos usados localmente (~199 MB).
Sua importação e disponibilidade de pesos foram verificadas sem GPU ou volume.
Digest publicado:
`sha256:3916f8e5a671fec9a416b2577b369d6bd13448748556d1f920ce53ea88c5ac02`.
Essa variante não incorpora os pesos grandes do DiffuEraser; não habilita o
preset Máxima qualidade sem a configuração adicional correspondente.

## Cobrança e publicação

O validador agora registra saldo e taxa corrente antes/depois, além do tempo do
provedor. O saldo pode atualizar com atraso e inclui armazenamento; sua diferença
não deve ser apresentada como uma fatura exata do vídeo.

O navegador de automação não está autenticado no Lovable: o editor responde
“You don't have access / Sign in”. O código da entrega foi enviado à `main` do
GitHub no commit `44ec662`, em avanço linear, preservando as migrações recentes
vindas do Lovable. A sincronização com a branch `main` não publica automaticamente o aplicativo público;
a etapa final no editor é **Publish → Update**.
[Lovable, publicação](https://docs.lovable.dev/features/publish).

O script de teste limita a capacidade a um worker, encerra em prazo definido,
zera capacidade ao sair e remove somente seus próprios projetos temporários.
As amostras originais, resultados aprovados e modelos existentes são preservados.

## Resultado final dos testes limitados

Após a correção da credencial, houve duas tentativas com prazo, sem repetidor
automático: imagem portátil sem volume regional e imagem v3 original na RTX 4090
com o volume original em `EU-RO-1`. Ambas terminaram na fila. O último diagnóstico,
`40c7a274-5626-4895-9ffe-ee1fcebe7751-u2`, expirou; a saída confirmou fila e workers
zerados e apagou o projeto temporário `df447ef1-3207-416a-8280-71a5270e9d37` da VPS.
Nenhum processamento de vídeo foi submetido porque a verificação de prontidão
não passou. **Não existe ainda custo real medido por vídeo da v3 na RunPod.**

O endpoint e o template temporários foram excluídos com resposta HTTP 204, após
confirmar ausência de workers e capacidade zero. O endpoint principal conserva
o template e volume originais, agora com a credencial de registro corrigida.
As cinco opções de GPU anteriores ao teste foram restauradas; a escolha exclusiva
da 4090 era apenas do diagnóstico. Limites finais: mínimo **0**, máximo **0**,
ociosidade **5 s**, execução **600 s**. Para operar o site, ainda será necessário
validar a inicialização e habilitar no máximo um worker; publicar a tela sozinho
não resolve a indisponibilidade GPU.

O saldo retornado pela API permaneceu igual entre o início e o fim do último
teste, mas pode haver atraso de faturamento. A taxa corrente informada pela
conta foi **US$ 0,005/h**, com zero Pods/workers e o volume de 50 GB preservado;
isso não é custo de um vídeo nem prova de ausência de cobrança futura.
A auditoria final está em `RUNPOD-COST-AUDIT-20260909.json` (data real no campo
`checked_at`). A VPS e seu armazenamento continuam existindo.

O validador foi corrigido para retornar código de saída 1 em falha, expiração
ou limpeza pendente. Antes, a exceção registrada no relatório terminava com código
0. Agora também lê de volta os limites após configurar um worker e após zerar a
capacidade. Quatro testes isolados, sem rede ou GPU, passaram: prontidão inválida,
worker com falha, expiração na fila e API que não aplica o limite solicitado.
TypeScript, build e os 28 casos únicos do CleanerIA também passaram na entrega.

Os relatórios locais completos ficam em
`.codex/artifacts/runpod-portable-20260910/`. A saúde pública da VPS confirmou
`scene-roi-v3`; a separação de áudio continuou pronta com Demucs.

Fontes usadas para o diagnóstico:
[RunPod, configuração](https://docs.runpod.io/serverless/endpoints/endpoint-configurations),
[CLI oficial e logs](https://github.com/runpod/runpodctl),
[API de credenciais de registro](https://docs.runpod.io/api-reference/container-registry-auths/POST/containerregistryauth).
