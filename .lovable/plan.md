# ChatScene — fechamento de UI Fidelity e Voice Cast

## Resultado

Concluir e validar o criador profissional de conversas animadas sem reconstruir o ChatScene. O documento `ChatSceneProject`, o renderer compartilhado, o Creator Split, o relógio determinístico, o auto-scroll, a timeline e o Voice Cast existentes serão preservados.

O TTS real já aprovado permanece como fluxo principal. O Mock Provider fica apenas como implementação de referência e apoio a testes; não haverá regressão para áudio simulado.

## O que já existe e será preservado

- Creator Split ajustável, fundo 100%, chat flutuante, câmera, cabeçalho, wallpaper, balões, timestamps e mídia rica.
- Conversation Clock, timing humano, animações por frame e ScrollPlanner puro usados pelo renderer.
- `voiceProfiles[]`, `participant.voiceProfileId` e overrides de emoção/ritmo por mensagem.
- Catálogo completo de personagens vocais sintéticos genéricos, capability detection e resolução por `participantId`.
- Prévia de voz, TTS real server-side, cache determinístico, geração em lote, duração real, timeline sincronizada, normalização e ducking.
- Demo original “Primeiro dia no trabalho” com Chefe, Pedro, Colega e Mãe.
- Cleaner IA, Editor V1, Editor V2, cobrança, autenticação e render cloud permanecem intocados.

## Implementação das lacunas reais

### 1. Voice Cast e inspetor de mensagem

- Completar o editor de override da mensagem selecionada: usar voz do participante, emoção, velocidade, energia e pausas antes/depois.
- Mostrar apenas controles realmente suportados pelo provider ativo.
- Corrigir a contagem de falas ausentes para considerar cache/chave atual, não apenas `voiceMs` salvo.
- Adicionar estados de falha com ações claras: tentar novamente, trocar voz ou continuar sem voz.

### 2. Provider, cache e fila

- Alinhar capabilities declaradas entre registry e provider real.
- Garantir que a voz persistida (`providerVoiceId`) seja usada, em vez de sempre voltar à voz padrão do preset.
- Fazer a fila gerar apenas mensagens cujo áudio válido não está disponível para a chave atual.
- Manter cache por texto, provider, voice ID, locale, perfil e emoção; sem sintetizar durante frames.
- Não mostrar custo quando o provider não oferecer estimativa confiável.

### 3. Sincronização e timeline

- Consolidar a duração real da fala com pitch/velocidade no mesmo schedule usado por prévia e MP4.
- Validar clique e navegação na faixa de voz, typing, entrada, fala, leitura e pausa.
- Cobrir mudanças de perfil e override invalidando somente os clipes afetados.

### 4. Demo, QA e fidelidade visual

- Completar a demo com uma mensagem de imagem e um fundo pronto animado, preservando roteiro original e quatro vozes.
- Aplicar o checklist visual e vocal já existente, registrando limitações reais sem pontuações inventadas.
- Verificar Creator Split, auto-scroll, mensagens grandes e painel Voice Cast em desktop e celular.

### 5. Testes e entrega

- Ampliar testes para provider ausente/falhando, fallback cacheado, mudança de emoção, múltiplos participantes, grupo e recálculo por duração real.
- Rodar TypeScript, lint, testes, build e console do navegador.
- Entregar screenshot do ChatScene e relatório curto de arquivos alterados, recursos validados, limitações e próximo passo.

## Limites

Não implementar billing, clonagem/upload de voz, Kokoro, ElevenLabs, novos providers, render cloud ou alterações no Cleaner e nos Editores V1/V2.