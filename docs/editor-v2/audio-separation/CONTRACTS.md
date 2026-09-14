# Contratos de implementação — áudio do Editor V2

Estado: **AUD-01_IMPLEMENTED / AUD-02_PERSISTENCE_RELINK_BROWSER_PASS / AUD-03_B0_B2_RUNTIME_PASS / AUD-04_BENCHMARK_IN_PROGRESS**. Entrada: [roadmap](README.md). Os tipos de grupo, representação ativa, comandos, extração local, persistência no navegador e relink existem; os adapters B0/B2 passaram somente nos contratos técnicos de pesquisa. Integração do job neural ao V2 e exportador continuam pendentes.

## 1. Semântica do resultado

`dialogue` significa fala de todas as pessoas, incluindo conversa sobreposta. Não selecionar falante-alvo por padrão. `music_background` significa o restante do áudio no produto inicial: música, canto que o modelo conseguiu separar, ambiente e efeitos. O rótulo da UI é “Música e ambiente”.

Compatibilidade: manter as rotas legadas `/stems/voice` e `/stems/music`. No documento V2, manter inicialmente `stemRole: voice | music`; acrescentar semântica e proveniência ao asset. O adapter traduz `dialogue.wav` para `voice` no contrato legado. Não renomear enums e endpoints indiscriminadamente.

Se houver três fontes nativas, guardar speech/music/effects no relatório e, para o primeiro produto, derivar `music_background = music + effects` com ganho unitário documentado. Canto mal classificado continua falha; juntar effects não corrige isso. O modelo que só oferece vocals/instrumental deve declarar essa semântica, mesmo quando a interface usa o rótulo desejado Diálogo.

## 2. Dados: asset, job e representação ativa

Evoluir `src/lib/editor-v2/types.ts`, sem criar um segundo documento de edição. Proposta de campos, a validar em AUD-01:

```ts
type AudioRepresentation = "embedded" | "extracted" | "separated";

interface SourceAudioDescriptor {
  sourceAssetId: string;
  sourceContentHash: string;
  streamIndex: number;
  sampleRate: number;
  channels: number;
  sampleCount: number;
  timelineOffsetSeconds: number; // PTS do início do áudio relativo ao vídeo
}

interface SeparationProvenance {
  jobId: string;
  resultRevision: string;
  sourceAudioAssetId: string;
  sourceContentHash: string;
  inputSampleRate: number;
  inputStartSample: number; // intervalo fonte processado, inclusivo
  inputEndSample: number;   // exclusivo
  engineId: string;
  checkpointSha256: string;
  configSha256: string;
  adapterVersion: string;
  outputHash: string;
  sampleRate: number;
  sampleCount: number;
  channels: number;
  semanticRole: "dialogue" | "music_background";
  qualityStatus: "unreviewed" | "accepted" | "rejected";
}

interface AudioSourceGroup {
  id: string;
  videoClipId?: string; // áudio importado pode não ter vídeo
  sourceAssetId: string; // vídeo ou áudio original, sempre disponível no grupo
  sourceStreamIndex: number;
  originalAudioAssetId?: string; // preenchido após extração; não exige novo Blob para embedded
  extractedClipId?: string;
  dialogueClipId?: string;
  musicClipId?: string;
  activeRepresentation: AudioRepresentation;
  linkedEditing: boolean;
  sourceRevision: string;
}
```

Não guardar tokens, blobs, data URLs, objetos AudioContext, referências DOM ou URLs assinadas expirantes no JSON do projeto. Guardar IDs/caminhos privados e resolver acesso em runtime. `jobId` não é autorização para acessar arquivos.

`AudioSourceGroup` é de uma instância de edição, não de um hash global. Dois vídeos reutilizando o mesmo asset podem compartilhar o resultado neural, mas têm representação ativa, ganho, mute e trims próprios. Duplicar o grupo cria IDs de clipes/grupo novos e reutiliza assets imutáveis. Não duplicar somente o vídeo perdendo os filhos vinculados.

Um `MediaAsset` de áudio precisa ter `kind=audio`, MIME coerente, duração, taxa/canais e hash de saída próprios. Não herdar largura/altura, poster do vídeo ou URLs da fonte de `createStemAsset`. Referências de licença da mídia e proveniência técnica dos pesos são campos distintos.

O campo de confiança atual não deve receber um número inventado. Só preencher se houver estimador definido, validado e calibrado; caso contrário, omitir e usar `qualityStatus=unreviewed`.

## 3. Tempo fonte, extração e alinhamento

Asset extraído: todo o stream de áudio da origem, sem aplicar volume, fades, velocidade, filtros ou cortes do projeto. Preservar mono/estéreo e registrar stream selecionado; áudio multicanal exige downmix explícito e validado, nunca simplesmente descartar canais. Vídeo sem áudio recebe estado “Este vídeo não tem áudio”.

Clipe extraído: usa início/fim e velocidade do vídeo selecionado. Não inseri-lo em zero do projeto. Se há áudio começando depois do vídeo, preservar esse deslocamento e o silêncio inicial.

Para clipe ativo no intervalo **[projectStart, projectEnd)**:

```text
videoSourceTime = sourceIn + (projectTime - projectStart) * playbackRate
audioSourceTime = videoSourceTime - audioTimelineOffset
stemLocalTime = audioSourceTime - processedRangeStart
stemSample = round(stemLocalTime * stemSampleRate)
```

Fora do intervalo coberto pelo asset, emitir silêncio ou erro recuperável conforme o contrato; não reproduzir de zero nem repetir a última amostra. Taxa de origem, taxa de inferência e taxa de entrega são distintas e registradas. Não reescrever cabeçalho WAV para converter taxa.

Exemplo obrigatório: vídeo usa fonte 10–22 s, começa em 30 s na timeline e roda a 2×. Dura 6 s no projeto. Áudio completo extraído continua contendo toda a origem. Se o job separou 10–22 s, em projectTime=32 s o stem toca em 4 s; em 36 s esse clipe já não está ativo. Repetir com PTS de áudio diferente de zero.

Se o worker aceitar apenas 44.100 Hz, criar entrada de inferência nessa taxa uma vez. Guardar receita e contagem de samples. A saída canônica inicial também é 44.100 Hz; exportação a 48 kHz usa reamostragem explícita com contagem/duração testadas. Padding de contexto neural fica no contrato de inferência e é removido deterministicamente ao publicar o intervalo solicitado.

Não separar segmentos já acelerados para depois acelerar novamente no player. Velocidade exige política única de preservação de pitch em preview/render; enquanto não implementada para uma velocidade, informar a limitação e impedir exportação divergente.

## 4. Comandos e histórico

| Comando proposto | Mutação atômica | Undo/redo |
|---|---|---|
| `ExtractAudioCommand` | Registra asset pronto, cria clipe vinculado, ativa `extracted`, seleciona a nova faixa | Undo restaura representação anterior; redo não extrai arquivo novamente |
| `ApplySeparatedAudioCommand` | Registra dois assets prontos, cria dois clipes em faixas adequadas, ativa `separated`, atualiza seleção | Uma ação para ambos. Undo restaura áudio anterior e IDs relevantes; redo usa os mesmos resultados |
| `RestoreOriginalAudioCommand` | Ativa representação original preservada e desativa a separada | Mantém assets e edições para undo; não apaga arquivos |
| `SetAudioRepresentationCommand` | Troca representação compatível do grupo | Sem sobreposição do original com stems |
| `SetAudioLinkCommand` | Liga/desliga edição conjunta | Desvincular torna trims/movimentos independentes, sem mudar de imediato o som |
| Comandos existentes de ganho/mute/solo | Atualizam clipe/faixa com os limites definidos | Não executar job neural |
| Split/trim/move/ripple/delete existentes | Expandem seleção para filhos vinculados quando aplicável | Alteração conjunta e reversível, mantendo mapeamento fonte |

Não inserir placeholders como áudio tocável. Progresso de jobs fica fora do histórico. Preparar arquivos antes do comando: se só um download/persistência terminou, nada muda na timeline.

Ao excluir Música de um grupo separado, o grupo continua em `separated`, com Diálogo ativo. Excluir as duas trilhas deixa o grupo sem som; não restaurar original automaticamente. Oferecer “Restaurar áudio original” no vídeo. Apagar clipe é diferente de apagar arquivo: garbage collection só remove assets sem referências de projeto, histórico ou job, após retenção definida.

Delete direto em um stem exclui somente aquele stem, mesmo com edição vinculada. Delete no vídeo principal pode incluir os filhos vinculados e deve identificá-los antes da aplicação; se desvinculados, permanecem independentes. Essa exceção explícita impede que Excluir Música apague também a conversa. “Restaurar áudio original” volta ao clipe extraído preservado quando existir, ou ao stream embutido quando não existir; os ganhos anteriores dessa representação são recuperados, sem copiar envelopes incompatíveis dos stems.

Duplicar, dividir e mover devem respeitar lock das faixas envolvidas. Se um filho vinculado está bloqueado, rejeitar a operação conjunta com explicação; não editar metade do grupo. Ao mover para faixa com clipe sobreposto, criar/usar faixa livre conforme contrato de timeline, nunca esconder áudios sobrepostos numa única barra.

## 5. Resultado assíncrono e concorrência de edição

No pedido, capturar projeto, grupo, hash da fonte, stream, intervalo processado e versão da receita. A revisão global do projeto serve para diagnóstico; uma edição de texto não deve invalidar um job de áudio.

Ao terminar:

1. Validar hash, duas saídas, formatos e cobertura do intervalo.
2. Persistir os dois assets; resultado fica `readyToApply` na biblioteca de resultados.
3. Na aplicação explícita, revalidar se grupo e fonte ainda existem.
4. Se houve apenas movimento na timeline, usar os tempos atuais. Se houve trim dentro da cobertura, usar o trecho atual. Se a fonte mudou ou o trim expandiu além da cobertura, não aplicar silenciosamente: pedir nova análise/usar resultado na biblioteca.
5. Se o clipe foi excluído, cancelado ou desfeito, manter resultado separado; não ressuscitar clipes.
6. Registrar idempotência por projeto + grupo + resultRevision. Duplo clique ou reconexão não criam quatro áudios.

Undo de aplicação é local ao documento; não reinicia/cancela inferência concluída. Reprocessar cria nova revisão sem substituir a anterior até o usuário aplicar. Preservar ganho, fades e envelope no reprocessamento apenas se o domínio temporal continuar compatível; caso contrário, apresentar a alteração antes de aplicar.

## 6. API e operação

Preservar a interface existente durante a migração:

```text
GET  /v1/audio/capabilities
POST /v1/audio/jobs/{job_id}/upload
POST /v1/audio/jobs/{job_id}/start
GET  /v1/audio/jobs/{job_id}
POST /v1/audio/jobs/{job_id}/cancel
GET  /v1/audio/jobs/{job_id}/stems/voice
GET  /v1/audio/jobs/{job_id}/stems/music
```

Extensões devem ter negociação de versão/capacidade; o `runStemJob` antigo rejeita estados desconhecidos. Não emitir `queued` para clientes antigos sem suporte. Adicionar novo cliente V2 ou versão explícita e preservar testes do legado.

Resposta de capabilities proposta: schemaVersion, semântica do modelo, perfis realmente disponíveis, readyReason, limites de input/duração, device efetivo, suporte a fila/cancel/retomada e política de retenção. Não confiar só na existência de pacote importável: pesos/config, executáveis, acesso a storage e smoke também precisam passar.

Registro de job: dono/projeto, input hash/intervalo, recipe hash, status/stage, progresso medido ou null, timestamps, cancelRequested, duração por etapa, erro com código, IDs de assets, expiração e resultado de validação. Não incluir tokens nos logs. Recuperação após reinício marca trabalho interrompido ou o retoma a partir de checkpoint comprovado; nunca `completed` por arquivos parciais.

Estados V2 desejados:

```text
extracting -> uploading -> queued -> running -> validating -> persisting
           -> readyToApply -> applied
qualquer estado não terminal -> cancelRequested -> cancelled
falha -> failed; arquivos expirados -> expired; mídia indisponível -> needsRelink
```

`queued` só existe com fila implementada. Antes disso, 429 aparece como “Servidor ocupado” com ação Tentar novamente, sem spinner fingindo processamento. Não fazer retry cego de POST; usar idempotency key e consulta de estado. Retry de transporte é limitado/backoff; erro de modelo não troca engine automaticamente.

Fila inicial pode usar armazenamento transacional já disponível no projeto após auditoria. Exigir claim/lease, limite de concorrência e cancelamento de itens pendentes. Não multiplicar processos FastAPI com locks independentes. Separar limite de upload do limite de inferência sem criar corrida sobre o mesmo job.

Renovação de ticket exige autenticação e ownership no servidor. Job conhecido não autoriza emitir novo ticket para qualquer usuário. Persistir resultado fora do diretório temporário do worker antes do TTL e marcar `readyToApply` somente após isso. Se uma trilha falhar ao salvar, manter o original e oferecer retomar somente a transferência.

Cache de resultados: escopo de tenant + hash da fonte + stream + intervalo + versão de extração + checkpoint/config/adapter + precisão + pós-processamento. Evitar deduplicação entre usuários que revele existência de arquivos. Configuração ou pesos diferentes geram outra chave.

## 7. Prévia, mix e exportação

`resolveAudioMixFrame` deve resolver áudio embutido e explícito com a mesma regra de grupo. O vídeo visual continua muted quando a reprodução sonora está centralizada; isso impede duplicação acidental pelo DOM.

O resolvedor fornece asset, sourceTime, playbackRate, ganho, estado ativo e semântica. Faixa oculta visualmente não significa muda; documentar mute, solo, clip.enabled e lock separadamente. Solo é global entre fontes audíveis, inclusive áudio embutido, com mute explícito prevalecendo. A representação inativa do original não se torna audível por um solo de faixa.

Ganho interno é linear; UI usa dB (`20*log10(gain)`; zero é -infinito/mute). Usar GainNode ou renderer adequado para valores acima de 1. Não aprovar UI de +6 dB se o monitor limita em 0 dB. Medir pico; não normalizar cada stem independentemente ao importar. Limiter, se necessário, deve ter configuração explícita e equivalente nos dois caminhos.

Evitar pause/play a cada render React. Transporte precisa de iniciar/parar, seek explícito, correção de drift medida, playbackRate, tratamento de autoplay e buffering; um relógio comum. Comparar mixer Web Audio e renderer offline com fixtures PCM, preservando mesmas curvas de ganho/fades. AudioWorklet é opção mediante necessidade medida, não requisito automático.

Para o primeiro mix de stems, ducking desligado: música já pertence à mesma mistura original. Ducking posterior deve usar atividade de fala e attack/release; um clipe Diálogo de três minutos não prova fala contínua. A pré-escuta Original/Diálogo/Música usa bypass temporário de ganho criativo/ducking, com volume de monitor comum. Mix final aplica as decisões reais.

Manifest precisa ser autossuficiente em processo novo: assets resolvíveis, seleção de streams, fonte embutida, grupos, estados enabled, ganho/mute/solo das faixas, clipes, envelopes, time map, taxa de mix, política de pitch e versões. `visualClips` também precisa vincular asset de vídeo; o manifest atual não deve ser presumido pronto para render completo.

Teste obrigatório: serializar manifest, encerrar referências ao store/DOM, renderizar vídeo + áudio em processo independente e comparar ao PCM esperado. Exportador indisponível significa gate de produto aberto, mesmo se `resolveAudioRenderFrame` passar.

## 8. Estados de interface e critérios verificáveis

| Situação | Apresentação e ação | Garantia |
|---|---|---|
| Nada selecionado | Instrução “Selecione um vídeo ou áudio” | Nenhum job iniciado |
| Vídeo sem stream de áudio | Ação indisponível com motivo | Não gerar WAV de silêncio fingindo extração |
| Fonte local perdida | “Localizar arquivo” | Não substituir por outra mídia |
| Extração | Etapa e Cancelar; vídeo continua editável | Só mudar representação depois de asset pronto |
| Áudio maior que capacidade | Duração permitida + seleção de trecho | Não descartar final sem informar |
| Serviço indisponível/ocupado | Manter extração local disponível e opção de nova tentativa | Original preservado |
| Separando | Etapas reais; porcentagem apenas se medida | Tela não trava nem inventa ETA |
| Resultado incompleto | Erro + retomar transferência | Não aplicar só uma trilha |
| Resultado pronto | Comparação 5–10 s + Aplicar | Usuário ouve antes de substituir |
| Aplicado | Duas faixas visíveis, foco no grupo e feedback breve | Uma operação de desfazer |
| Silenciar Música | Ícone/label ativo, Diálogo permanece audível | Mesmo comportamento na exportação |
| Excluir Música | Faixa removida; Restaurar original disponível | Original continua inativo |
| Cancelado | Estado terminal confirmado; possível “Cancelando” intermediário | Resultado tardio não se aplica |

Atalhos globais só quando foco não está em input/slider/menu; Espaço play/pause, undo/redo e Delete reaproveitam contrato V2. Não criar teclas de solo/mute em conflito. Controles de volume acessíveis por setas; menus por teclado; aria-pressed/labels indicam solo/mute; status live region sem anunciar cada frame. Ícones com tooltip não substituem nome acessível.

Conferir desktop 1440×900 e viewport estreito; no móvel abrir painel inferior contextual, sem tirar a timeline do alcance. Contraste mínimo proposto de 4,5:1 para texto comum e 3:1 para componentes/foco; avaliar com os tokens efetivos. Testar preferências de movimento reduzido e zoom de navegador 200%.

## 9. Regras de preservação

- Nenhuma exclusão automática do vídeo original, stems aprovados ou evidência de benchmark.
- Não enviar mídia a serviços externos de demonstração; testes usam assets autorizados e o worker configurado.
- Não alterar Cleaner, pesos de vídeo ou configuração de GPU para este fluxo.
- Nenhuma mudança de padrão de modelo antes do gate de qualidade. Em falha, informar e oferecer original; nunca apresentar original como diálogo separado.
- Feature flag desabilita novas separações, mas não impede tocar/exportar stems já salvos. Rollback de runtime mantém leitura de documentos novos ou restaura versão compatível, sem amputar campos.
