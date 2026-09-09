# Editor profissional VaiViral — diagnóstico e evolução por fases

Data: 09/09/2026. Entrega: primeira fase de análise e planejamento solicitada pelo usuário. Não representa funcionalidades corrigidas ou implementadas.

## Direção de produto

O VaiViral precisa de um editor confiável para transformar vídeos em cortes sociais com identidade visual reutilizável: importar, selecionar fala, cortar, reenquadrar, legendar, aplicar identidade/template, ajustar ritmo e áudio, exportar e reaproveitar em lote. Podcast, comentário/notícia, conteúdo educativo, UGC e entretenimento são cenários iniciais sugeridos a partir das funções e catálogos existentes; validar sua prioridade com uso real.

A referência CapCut ajuda a estabelecer expectativas de manipulação direta, ritmo e materiais utilizáveis. A prioridade do VaiViral deve ser completar bem esse percurso, com a mesma aparência e duração na prévia e no arquivo final. Acrescentar cartões e presets antes de corrigir a composição só aumenta a inconsistência.

Preservar React/TanStack, Radix, tokens existentes e identidade escura/violeta. Evoluir o modelo de edição e seus adaptadores sem uma troca indiscriminada de framework ou motor.

## Método e limites

Avaliações independentes: A, leitura de UX e composição (`ux_review`); B, evidência técnica e detector (`evidence`); integração e inspeção adicional pelo agente principal. Base visual: imagem fornecida, referente à biblioteca de modelos; ela não demonstra o funcionamento da timeline. Base funcional: código local, não a versão publicada. Há alterações prévias no workspace, preservadas.

Não houve sessão autenticada de edição nem exportação audiovisual de ponta a ponta nesta fase. Os defeitos abaixo são identificados por fluxo de código; efeitos perceptuais, desempenho, compatibilidade de navegador e comportamento publicado precisam de reprodução controlada. Não atribuímos uma nota numérica de usabilidade sem observar tarefas reais.

## Diagnóstico com evidência

Referências relativas à raiz; linhas correspondem à inspeção desta data. P0 = confiabilidade/risco de trabalho perdido ou saída divergente; P1 = percurso principal; P2 = expansão.

| ID | Prioridade | Evidência e problema | Correção e aceitação |
|---|---|---|---|
| E01 | P0 | `src/components/editor/ToolPanels.tsx:70`: início/fim leem o primeiro segmento e substituem a lista inteira por um segmento. | Operar no clipe selecionado. Dividir em três, ajustar o segundo e manter os outros dois intactos; desfazer restaura um único comando. |
| E02 | P0 | Rota profissional `src/routes/projects.$projectId.editor.$videoId.tsx:300,323,937,1443`: exclusões da transcrição alimentam a marcação da timeline, mas não os segmentos enviados ao render. | Um comando de edição atualiza transcrição e montagem. Excluir fala remove o intervalo da prévia e MP4; modo “só legenda” preserva o vídeo. |
| E03 | P0 | `MediaStage.tsx:106,169` usa tempo original; `render-template.ts:631` compacta segmentos e desenha camadas com tempo de saída. | Relógio de projeto e mapeamento fonte/saída compartilhados. Após remover 5 s, legenda, overlay, música e agulha mantêm o mesmo alinhamento no MP4. |
| E04 | P0 | Rota `:257–266,803`: falha de autosave vira `idle`, mas a interface mostra “Salvo” fora de dirty/saving. Transcrição também engole falha `:271`. | Estados erro/offline, revisão salva, retry e recuperação local; uma resposta antiga não pode marcar edição nova como salva. |
| E05 | P1 | `TimelinePro.tsx:159–166,260–280,370`: seek/agulha usam largura total, enquanto clipes ocupam área deslocada por `left-28`. | Uma conversão pixel↔tempo sobre a área útil, inclusive zoom e scroll. Clicar no início/meio/fim do clipe posiciona a agulha no tempo correspondente. |
| E06 | P1 | `TemplateLibrary.tsx` usa `STARTER_PRESETS`/`Template`; `template.ts:687` usa `vv.templates`. Editor usa `READY_TEMPLATES` e registros `video_templates`. | Inventariar armazenamento local/nuvem e converter os modelos existentes para catálogo comum. O mesmo modelo aparece e aplica pela biblioteca e pelo editor. |
| E07 | P1 | Rota `:484–501`: template salvo vindo de `/estilos` só adiciona camadas; `:613–627`: “Meus” aplica bindings e composição. | Um serviço de aplicação com canvas, mídia, textos, fontes, duração e marca. Resultado equivalente em todas as entradas. |
| E08 | P1 | Rota `:462–482` aplica paleta/transição do preset; `:1331–1354` usa apenas `build` ao clicar em Prontos. | Mesmo comando e mesma opção de marca para os dois caminhos. Aplicação repetida não acumula títulos/faixas inadvertidamente. |
| E09 | P1 | `PreEdit`/`Segment` em `src/lib/preedit.ts` não têm taxa de velocidade. Há `VideoLayer.speed`, mas o caminho principal de vídeo não o aplica como retiming completo. | Implementar velocidade de vídeo integrada ao tempo, áudio e exportação; não confundir com velocidade da animação. |
| E10 | P1 | Rota `:884`: quatro colunas exigem mínimo de 1138 px, ativadas em lg/1024 px. | Painéis recolhíveis/redimensionáveis e breakpoint pelo espaço necessário; validar 1024, 1280, 1440 px e celular sem overflow obrigatório. |
| E11 | P1 | Prontos mostra cor/nome; Meus mostra metadados. Imagem enviada também mostra miniaturas pequenas, títulos truncados e descrições repetidas. | Prévia real sobre vídeo, detalhes acessíveis e busca/filtros; comparar antes de aplicar e desfazer imediatamente. |
| E12 | P1 | Rota `:235`: falha ao buscar templates é tratada silenciosamente, ficando indistinguível de biblioteca vazia. | Diferenciar carregando, vazio, falha, offline e tentar novamente; preservar seleção. |
| E13 | P1 | `MediaStage.tsx:129–146` e `render-template.ts:408–409` reutilizam a fonte global para camadas de vídeo. | Para B-roll/múltiplas mídias, resolver fonte, trim e relógio por clipe; duas camadas devem exibir dois arquivos distintos. |
| E14 | P1 | Transcrição vive em estado separado do documento/histórico; `onChange` usa `setTranscript`. | Undo/redo transacional abrangendo texto, cortes e estilo; operações compostas devem ser um passo. |
| E15 | P0 | `render-template.ts:350,614` lê `settings.boundCaptions`; a rota envia a transcrição como intervalos de fala para áudio, sem preencher esse campo. | Alimentar a composição com a transcrição editada e remapeada; gerar legenda, editar palavra e exportar deve preservar o texto e os tempos. |
| E16 | P0 | Rota `:998` usa `EditorCanvas` sem tempo atual; essa superfície de camadas não recebe relógio de reprodução. | Compartilhar avaliação temporal entre canvas de edição e saída, mantendo modo explícito para editar objetos fora do intervalo. Testar entrada/saída e animação de texto no playback. |

Os caminhos acima não são uma lista de todas as falhas possíveis: delimitam os problemas verificáveis nesta inspeção. Fontes ausentes, drift audiovisual e travamentos são riscos a testar, não ocorrências já reproduzidas.

## Fase 1 — estabilizar o trabalho existente

- [ ] Reproduzir E01–E05 e E14 com mídia sintética curta, som de marcação e palavras com timestamps conhecidos.
- [ ] Corrigir trim por seleção e proteção contra operações em camada bloqueada.
- [ ] Conectar exclusão por texto à montagem, sem destruir o arquivo original.
- [ ] Conectar legendas editadas ao renderer e validar duração/animação das camadas na prévia (E15/E16).
- [ ] Unificar histórico de ações compostas, seleção após undo/redo e restauração do projeto.
- [ ] Corrigir estados de salvamento, concorrência de respostas, retry, recuperação e aviso de alterações pendentes ao sair.
- [ ] Invalidar arquivo exportado quando conteúdo relevante muda; identificar a revisão usada por cada render, inclusive edições durante processamento.
- [ ] Corrigir cálculo da timeline e tornar o primeiro clipe manipulável mesmo quando `segments` ainda estiver vazio.

Aceitação: editar → desfazer/refazer → recarregar preserva a última revisão confirmada; falha de rede é visível; exportação não contém fala marcada para corte. Não liberar novas funções de edição temporal com esses casos falhando.

## Fase 2 — base temporal e velocidade

Dependência: Fase 1. Introduzir versão/migração do documento, preservando projetos antigos.

- [ ] Separar tempo da fonte, início na montagem e duração de saída; dar ID estável a cada clipe e emenda.
- [ ] Centralizar duração, seek, seleção, split, trim, transcrição, áudio e render no mesmo mapa temporal.
- [ ] Preservar ordem editorial; `keptSegments` hoje ordena por início da fonte, insuficiente para reordenar clipes livremente.
- [ ] Velocidade constante por clipe: proposta inicial 0,25× a 4×, presets 0,5×/1×/1,5×/2× e entrada numérica. Validar limites com o motor.
- [ ] Exibir nova duração antes de aplicar, manter pitch da voz quando suportado, e oferecer reset para 1×.
- [ ] Definir comportamento de ripple: clipes ligados e legendas acompanham; música independente mantém posição ou segue mediante opção explícita.
- [ ] Retemporizar palavras, efeitos, keyframes e transições. Interpolação de frames para slow motion é entrega separada, não uma qualidade implícita.
- [ ] Curvas de velocidade e rampas somente depois da velocidade constante validada; prever pontos editáveis e easing no modelo.

Aceitação: fonte de 10 s em 2× gera 5 s; em 0,5× gera 20 s. Testar clipe recortado, dois clipes com taxas diferentes, áudio desligado/ligado e legenda atravessando split. Prévia e saída concordam dentro de um frame na taxa escolhida; medir áudio com marcador conhecido.

## Fase 3 — espaço de edição e timeline

- [ ] Topo: nome, salvamento, desfazer/refazer e Exportar. Publicação permanece etapa posterior ao arquivo pronto.
- [ ] Biblioteca contextual à esquerda; vídeo no centro; propriedades do objeto selecionado à direita; timeline persistente embaixo.
- [ ] Unificar painéis redundantes de estilo/texto e reduzir categorias simultâneas. Propriedades devem acompanhar seleção no palco e na timeline.
- [ ] Painéis recolhíveis e redimensionáveis, ajuste do preview à área disponível e timeline com altura ajustável.
- [ ] Trilhas reais de vídeo, B-roll/imagem, texto/legenda e áudio no mesmo eixo; múltiplas fontes dependem de E13.
- [ ] Miniaturas de vídeo, waveform, nomes úteis, régua dependente do zoom, timecode por frame, snap e auto-scroll durante arraste.
- [ ] Dividir, aparar bordas, mover/reordenar, duplicar, excluir, excluir fechando espaço, inserir espaço e seleção múltipla.
- [ ] Mute/solo, ocultar/bloquear, grupos e vincular/desvincular áudio; menu contextual consistente.
- [ ] Atalhos descobríveis e sem interferir na digitação: espaço, setas/frame, split, delete, undo/redo; arraste cancelável com Escape.
- [ ] No celular, preview e transporte visíveis, ferramenta em painel único e alvos de toque adequados; não apenas empilhar o desktop.

Aceitação: montar três trechos, inserir B-roll, ajustar bordas e reposicionar música por arraste ou teclado, sem perder seleção e sem divergência de tempo após zoom/scroll.

## Fase 4 — templates unificados e utilizáveis

- [ ] Inventariar templates legados, nuvem, layouts prontos, estilos e templates de legenda; documentar campos sem equivalência.
- [ ] Criar adaptadores versionados e migração idempotente, mantendo cópia original e aviso dos recursos incompatíveis.
- [ ] Catálogo único com tipo explícito: composição, estilo de legenda, título animado, efeito e transição; filtros por finalidade, formato e duração.
- [ ] Uma ação de aplicar usada por todas as rotas, com bindings de vídeo, título, logo e legendas resolvidos.
- [ ] Escolha clara entre substituir composição e adicionar elementos. Preservar mídia e edição temporal; mostrar impacto antes de substituição relevante.
- [ ] “Manter minha marca” ou “Usar aparência do modelo”; salvar como novo modelo, duplicar, renomear, favoritar e restaurar versão.
- [ ] Previews do renderer real, com play/pausa acessível; carregar thumbnails sob demanda, sem decodificar todo o catálogo de uma vez.
- [ ] Estados de importação, carregamento e falha, busca, favoritos e recentes; arquivos exportáveis/importáveis com validação de versão.
- [ ] Uso em lote como instâncias independentes; alterar uma não modifica o original nem os demais vídeos.

Aceitação: os modelos da biblioteca fornecida ficam disponíveis no editor, incluindo os salvos; aplicar o mesmo modelo por três entradas produz a mesma composição. Salvar, reabrir e exportar preserva aparência, fontes e bindings.

## Fase 5 — tipografia, legendas e conteúdo pronto

- [ ] Separar fonte da interface de fonte do vídeo; controlar assets, pesos, licença e carregamento antes de renderizar/exportar.
- [ ] Editar texto diretamente, quebras, entrelinha, espaçamento, caixa, alinhamento, contorno, sombra e fundo; mostrar fallback de fonte.
- [ ] Sincronizar transcrição e camada de legenda; correção por palavra/bloco, ajuste temporal, dividir/unir legendas e importar/exportar SRT/VTT.
- [ ] Estilos prontos com leitura real: frase limpa, palavra destacada, karaokê, caixa editorial, podcast, educativo e notícia. Não tratar troca de cor como novo sistema tipográfico.
- [ ] Prévia animada com fala de exemplo e com vídeo do usuário; aplicar globalmente ou somente à seleção.
- [ ] Destacar palavras-chave sem mover todo o bloco; limites de linhas, área segura, contraste e posicionamento que preserve rostos.
- [ ] Pacote inicial sugerido: seis composições completas (podcast, notícia, educativo, UGC, comentário e minimal), seis estilos de legenda e quatro títulos/CTAs. Quantidade é proposta de escopo, não conteúdo já produzido.
- [ ] Cada composição deve conter vídeo de demonstração licenciado/sintético, versão 9:16, comportamento definido em 1:1/16:9, tipografia, áreas seguras e exportação de referência.

Aceitação: revisar acentos em português, texto longo, nomes próprios, fala rápida, silêncio e vídeo claro/escuro. Preview e MP4 mantêm quebra de linha, peso e posição. Nenhum preset obrigatório depende de uma fonte silenciosamente ausente.

## Fase 6 — áudio, efeitos e acabamento

- [ ] Volume por clipe e trilha, fades por alças, waveform e pré-escuta; voz, música e efeitos sonoros identificáveis.
- [ ] Ajustar início/fim/loop da música, ducking configurável e medição de clipping; validar após cortes e mudanças de velocidade.
- [ ] Biblioteca sonora com busca, duração, prévia e informação de licença; recuperação de mídia indisponível.
- [ ] Distinguir filtro de cor, efeito temporal, animação de camada e transição entre clipes.
- [ ] Prévia antes de aplicar, intensidade, intervalo e reset; cópia de ajustes entre clipes.
- [ ] Transições vinculadas à emenda por ID, duração limitada pelos clipes e opções iguais na prévia/exportação.
- [ ] Keyframes além de crop conforme suporte: posição, escala, rotação, opacidade e volume, com easing.
- [ ] Enquadramento com guias, snap/alinhamento, fit/fill, fundo, safe zones, títulos inferiores e overlays úteis. Evitar decoração cobrindo o conteúdo por padrão.
- [ ] Separação de voz/ruído deve mostrar progresso, falhas e prévia comparativa; não confundir job concluído com qualidade aprovada.

Aceitação: efeitos e áudio têm intervalo, intensidade e resultado auditável; nenhum recurso “aplicado” existe apenas no cartão ou na prévia.

## Fase 7 — exportação, desempenho e liberação

- [ ] Preflight de mídia, fontes, duração, codec, áudio e tamanho antes do trabalho; resolução/FPS definidos e duração/tamanho estimados identificados como estimativas.
- [ ] Progresso por etapa, cancelamento, retry e recuperação; arquivo identifica revisão e configurações utilizadas.
- [ ] Não reduzir silenciosamente a qualidade: comunicar incompatibilidade e permitir escolha da saída suportada.
- [ ] Comparar frames de referência em início, emendas, legendas, efeitos e final; analisar marcadores de áudio e duração.
- [ ] Proxies para preview, originais na saída, cache de thumbnails/waveforms, limpeza de URLs/decoders e carregamento sob demanda.
- [ ] Medir seek, reprodução, memória e responsividade em máquina de referência documentada; usar projeto curto e projeto com muitas camadas. Não prometer performance sem medição.
- [ ] Automatizar fluxos com fixtures locais: importar → montar → legendar → template → velocidade → salvar/reabrir → exportar.
- [ ] Validar desktop estreito/amplo e celular, teclado, foco, nomes acessíveis, contraste e reduced motion.
- [ ] Liberar gradualmente com migração reversível, recuperação de projetos e catálogo de capacidades por navegador.

Aceitação: nenhuma falha P0 aberta no percurso principal; matriz de recursos com evidência de prévia, persistência e exportação. Recursos pendentes ficam explicitamente indisponíveis, sem mensagens falsas de conclusão.

## Ordem de implementação e teste

Primeiro lote: E01, E02/E03, E04 e E05, com regressões comportamentais. Em seguida, modelo temporal/velocidade e integração de templates. A nova organização visual pode ser preparada com fixtures após esses contratos definidos; a biblioteca visual só deve escalar quando aplicar/reabrir/exportar funcionar.

Cada item passa por: pendente → reproduzido/especificado → implementado → validado em preview → validado ao reabrir → validado na exportação. Tarefas puramente visuais não exigem teste unitário que espelhe CSS, mas exigem inspeção de interação nos viewports afetados.

Não há prazo fechado nesta fase: retiming de áudio, migração dos formatos e suporte real a múltiplas mídias são dependências técnicas que precisam de uma prova pequena antes de estimar o restante.

## Verificação realizada nesta fase

Comando: `npm test -- src/lib/__tests__/audio-mix.test.ts src/lib/__tests__/cut-template-binding.test.ts src/lib/__tests__/template-timeline.test.ts src/lib/__tests__/render-manifest.test.ts`.

Resultado: **4 arquivos, 17 testes aprovados**. Eles validam funções existentes; não cobrem o percurso integrado, a geometria real da timeline ou qualidade audiovisual. Sem alteração de código de produto, não foi executado build de uma implementação nova.

Detector Impeccable: a varredura da rota profissional e componentes encontrou um aviso estético de paleta/gradiente violeta na rota, linha 869. A varredura da entrada `/editor`, componentes e biblioteca encontrou dois alertas de `bounce` em estilos de conteúdo, a revisar como provável falso positivo porque se referem ao vídeo exportado, não à movimentação da interface. Não equivalem a uma auditoria de acessibilidade ou performance aprovada. Ferramentas de navegador estavam disponíveis, mas o fluxo autenticado não foi exercitado nesta auditoria estática; não houve overlay, servidor temporário, sessão privada, upload, processamento pago ou publicação. Os relatórios JSON de diagnóstico ficaram no diretório temporário do sistema, fora do produto.

Referência externa consultada em 09/09/2026: [controle e curvas de velocidade no CapCut](https://www.capcut.com/tools/change-video-speed) e [speed ramp por clipe](https://www.capcut.com/tools/speed-ramp). Usadas apenas para expectativa de interação, não como prova de implementação interna, preço ou disponibilidade universal.

Perguntas de próximo passo omitidas: o usuário já definiu que esta entrega deve listar e organizar o trabalho em fases; a sequência acima é concreta e não depende de nova autorização para existir.
