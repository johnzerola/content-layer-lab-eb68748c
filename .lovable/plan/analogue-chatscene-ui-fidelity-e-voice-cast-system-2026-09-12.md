# Analogue ChatScene — UI Fidelity e Voice Cast System

## Resultado desta rodada

Evoluir o ChatScene existente para um criador profissional de conversas animadas, com Creator Split fiel às referências, tempo determinístico e um Voice Cast reutilizável por personagem. Não serão adicionados billing, clonagem de voz, exportação cloud, Kokoro ou ElevenLabs nesta rodada.

## Auditoria: o que será preservado

- `ChatSceneProject` já é a fonte de verdade de participantes, mensagens, tempo, fundo, tema e render.
- O Canvas renderer já é compartilhado pela prévia e pelo MP4.
- `ConversationClock`, timing humano, auto-scroll calculado, animações de entrada e câmera já são determinísticos.
- Texto, imagem, vídeo, GIF, figurinha, áudio, respostas, reações, sons e fundo em vídeo já têm base funcional.
- Creator Split e outros layouts já existem como presets ajustáveis.
- Voz por participante, pré-escuta, cache em memória, geração em lote, duração real, mixagem, normalização e ducking já existem em formato inicial.
- Cleaner IA, Editor V1, Editor V2, rotas e contratos externos permanecem intocados.

## 1. Modelo único e migração compatível

- Evoluir o documento versionado com `voiceProfiles[]` reutilizáveis e `participant.voiceProfileId`.
- Adicionar `message.voiceDirection` opcional com emoção, multiplicador de velocidade/energia e pausas antes/depois.
- Manter leitura retrocompatível do atual `participant.voice`, migrando-o para um perfil estável sem perder projetos salvos.
- Tratar seleção, frame atual, reprodução, progresso e buffers de áudio como estado efêmero do estúdio; conteúdo, timing e identidade vocal continuam derivados do projeto.
- Criar seletores/comandos focados para participante, mensagem e voz, sem criar um segundo store nem mover toda a estrutura existente.

## 2. Creator Split e fidelidade visual

- Refinar o preset Creator Split para fundo em vídeo ocupando 100% e cartão de conversa flutuante ajustável entre aproximadamente 82–90% da largura, 5–10% do topo e 45–60% da altura.
- Reutilizar o renderer atual e consolidar cabeçalho, wallpaper, balões, timestamps, tiques, labels de grupo, mídia e sombras como uma composição coerente.
- Garantir que o wallpaper interno nunca substitua o gameplay externo e que a conversa cresça/role sem áreas vazias incoerentes.
- Manter controles existentes de posição, escala, altura, raio, desfoque e câmera; nenhum tamanho será rígido.

## 3. Conversation Clock, ScrollPlanner e animações

- Formalizar seletores de frame para mensagens visíveis, digitando atual, voz ativa, mídia ativa, câmera e fundo.
- Extrair o cálculo atual de rolagem para um `ScrollPlanner` puro, usado pelo mesmo pipeline da prévia e do MP4.
- Considerar altura real de imagens, stickers, GIFs, vídeos e mensagens de voz para evitar cortes, saltos e vibração.
- Preservar os presets atuais de entrada e garantir que a animação dependa somente de projeto + frame.
- Recalcular a timeline com typing, entrada, voz real, leitura e pausa; sem voz, manter a estimativa por texto e pontuação.

## 4. Voice Cast de domínio

- Expandir `VoiceProfile` com identidade estável, provider, voice ID, idioma/localidade, idade/estilo vocal, energia, expressividade, aspereza, calor, brilho, cadência e configurações específicas.
- Separar identidade do personagem de emoção da mensagem.
- Criar catálogo inicial completo de presets sintéticos genéricos solicitado: juvenil, teen, adultos, família, trabalho, amigos e narradores.
- Presets serão composições de características e direções, não apenas alterações de pitch; nenhum preset representará pessoa real.
- Adicionar resolução `message → participant → voiceProfile → voiceDirection` com fallback seguro.

## 5. Provider Registry, capacidades, cache e fila

- Ampliar o contrato para `listVoices`, `getCapabilities`, `previewVoice`, `synthesize` e `estimateCost?`.
- Criar registry com modos `AUTO`, `LOCAL` e `PREMIUM`, sem conectar novos serviços nesta rodada.
- Implementar `MockVoiceProvider` determinístico para prévia local; manter o provider real existente apenas como adaptador legado, fora do novo fluxo padrão.
- Exibir somente controles suportados pelo provider selecionado; custo aparece apenas quando houver estimativa real.
- Fortalecer a chave de cache com texto, provider, voice ID, perfil, locale e override emocional.
- Fazer a fila gerar somente mensagens sem áudio válido, mostrar quantidade/caracteres/progresso e oferecer Retry, Change Voice e Continue Without Voice.
- Preservar áudio pré-gerado no playback; nunca sintetizar durante frames.

## 6. Interface Voice Cast e inspetores

- Transformar a aba atual de vozes em `Voice Cast`, com um cartão por personagem, resumo da persona e ações Ouvir/Editar.
- Ao editar um perfil, atualizar automaticamente todas as mensagens do participante sem override.
- No inspetor de participante: preset, provider, voice, style, speed, energy, pitch quando suportado, Preview e Advanced progressivo.
- No inspetor da mensagem: usar voz do participante ou override opcional de emoção, velocidade e pausas.
- Mostrar prévia curta padronizada e cacheada; manter linguagem pt-BR e feedback claro para carregamento/falha.

## 7. Áudio e sincronização

- Aplicar duração real do áudio na reconstrução da timeline.
- Manter vozes, sons de mensagem e áudio do background como trilhas separadas antes da mixagem.
- Expandir ducking com amount, attack e release; manter normalização leve, proteção de pico e dinâmica da voz.
- Usar o mesmo schedule na prévia e no MP4 e eliminar divergência entre relógio visual e relógio de áudio.

## 8. Demo e QA

- Substituir/adicionar a demo original “Primeiro dia no trabalho” com Chefe, Pedro, Colega e Mãe, quatro VoiceProfiles distintos, texto, typing, imagem, emoção, auto-scroll e fundo de gameplay configurável.
- Criar `ChatSceneVisualQA` com os 14 critérios solicitados e bloqueio de aprovação quando algum item ficar abaixo de 3 ou a média abaixo de 4.
- Criar checklist de Voice QA por perfil; presets não serão promovidos quando a pronúncia pt-BR falhar.
- Cobrir números, datas, reais, Pix, nomes brasileiros, perguntas, exclamações e gírias leves na preparação textual.

## 9. Testes e validação final

- Testar mapping participante/perfil, resolução da voz da mensagem, overrides, hash do cache, emoção alterando a chave, duração real recalculando timeline, grupos com muitos participantes, provider ausente/falhando e fallback cacheado.
- Testar ScrollPlanner com mensagens pequenas e mídia grande, além da equivalência determinística entre frames.
- Rodar TypeScript, ESLint, testes completos, build, console do navegador e QA em desktop e celular.
- Gerar screenshot do estúdio e MP4 de validação com Creator Split e quatro personagens.

## Arquivos e limites

A implementação continuará na estrutura equivalente existente em `src/lib/chatscene` e `src/components/chatscene`; não haverá migração cosmética para uma nova árvore `features/`. Serão criados apenas módulos focados de perfis, providers, registry, cache/fila, resolução vocal, ScrollPlanner e QA quando não houver equivalente funcional.

**Fora desta rodada:** novos providers reais, billing/créditos, clonagem/upload de voz, persistência cloud de cache de áudio e render cloud.
