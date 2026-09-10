# Diagnóstico RunPod e publicação do CleanerIA

Continuação da entrega `scene-roi-v3`, em 09/09/2026 à noite (10/09 em UTC).

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
“You don't have access / Sign in”. O acesso GitHub está funcional. Sincronizar
o código com a branch `main` não publica automaticamente o aplicativo público;
a etapa final no editor é **Publish → Update**.
[Lovable, publicação](https://docs.lovable.dev/features/publish).

O script de teste limita a capacidade a um worker, encerra em prazo definido,
zera capacidade ao sair e remove somente seus próprios projetos temporários.
As amostras originais, resultados aprovados e modelos existentes são preservados.

Fontes usadas para o diagnóstico:
[RunPod, configuração](https://docs.runpod.io/serverless/endpoints/endpoint-configurations),
[CLI oficial e logs](https://github.com/runpod/runpodctl),
[API de credenciais de registro](https://docs.runpod.io/api-reference/container-registry-auths/POST/containerregistryauth).
