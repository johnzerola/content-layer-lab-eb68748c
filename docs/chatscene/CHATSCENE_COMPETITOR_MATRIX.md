# ChatScene — Competitor / Product Benchmark

Data: 2026-09-12. Fonte: páginas públicas, App Store e material de marketing.
Nenhum login, assinatura ou recurso pago foi acessado. Objetivo: entender padrões
de produto e achar oportunidades — não copiar identidade visual, código ou
interface protegida.

Legenda: `sim` / `não` / `?` (não documentado publicamente).

## Matriz de funcionalidades

| PRODUCT | WEB_OR_APP | PARTICIPANTS | GROUP_CHAT | TEXT | IMAGE | VIDEO | GIF | STICKER | VOICE_NOTE | TTS | MULTIPLE_VOICES | REACTIONS | REPLIES | READ_RECEIPTS | TYPING | CUSTOM_TIMING | BACKGROUND | AI_SCRIPT | LIVE_PREVIEW | VIDEO_EXPORT | EXPORT_RESOLUTION | LOCAL_OR_CLOUD_RENDER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatTales (iOS) | app | multi (personagens) | sim | sim | sim | sim | ? | ? | ? | sim | sim | sim | sim | sim | sim | sim | ? | ? | sim | sim | HD | local (device) |
| Chatimator | web | multi nomeados | sim | sim | sim | sim | ? | ? | sim (waveform) | não | não | sim | sim | sim | sim | sim | backdrop custom | sim | sim | sim | 1080p 60fps (Pro); 720p com marca no free | local (WebCodecs) |
| texting.video | web | 2+ | sim | sim | ? | ? | ? | ? | ? | ? | ? | sim | ? | sim | sim | sim | 13 temas | paste de script | sim | sim | 1080p MP4/WebM, 5 proporções | local (browser) |
| FakeMessenger | web | 2 | não | sim | sim | não | não | não | não | não | não | não | não | ? | sim | pausa 1–5s por msg | cor/tema | não | sim | sim | Normal/HD/Ultra HD | local |
| HeyFake | web (beta) | 2 | ? | sim | ? | ? | ? | ? | ? | ? | ? | sim | ? | ? | sim (+ teclado animado) | sim, 0.5x–2x global | ? | ? | sim (loop) | sim | ? | render com envio por e-mail |
| MockChats | web | 2+ | sim | sim | sim | ? | ? | emoji | sim | ? | ? | sim | ? | sim (tique azul) | sim | ? | wallpaper, dark/light | ? | sim | sim | vertical | cloud/web |
| Nova Clipper | web | 2 lados | não | sim | não | não | não | não | não | sim | sim (1 por lado) | não | não | ? | sim | automático | vídeo de fundo em loop | sim | ? | sim | 9:16 | cloud |
| GhostShorts | web | 2 | ? | sim | ? | ? | ? | ? | ? | sim | sim | ? | ? | ? | sim | automático | sim | sim | sim | sim | HD | cloud (créditos) |
| TextingStory | app | 2 | não | sim | sim | ? | ? | ? | ? | não | não | ? | ? | sim | gravação em tempo real | gravado pelo autor | não | não | sim | sim | HD | local |
| Fake Chat Story Maker | app | multi | sim | sim | sim | ? | ? | ? | ? | ? | ? | ? | ? | ? | sim | automático | temas | sim | sim | sim | vertical | ? |

## Forças, fraquezas e o que aproveitar

| PRODUCT | STRENGTHS | WEAKNESSES | IDEAS_FOR_US |
| --- | --- | --- | --- |
| ChatTales | maturidade, milhões de usuários, elenco de personagens, várias vozes, mídia rica | só iOS, sem web, pouco controle fino de render | modelo de "personagens" como entidade reutilizável entre projetos |
| Chatimator | render local por WebCodecs, sem fila e sem upload; grupos, notas de voz com waveform, reações, respostas; AI script | sem TTS/voz falada; fidelidade colada em três aplicativos | WebCodecs para prévia e export rápido; grupos nomeados; waveform |
| texting.video | 13 temas completos (inclusive terminal, JRPG, true crime), 5 proporções, safe zones visíveis, sem cadastro, import de script/JSON | sem voz, mídia limitada | temas como "mundos", não variação de cor; conferência de safe zone embutida; import de roteiro em texto simples |
| FakeMessenger | fluxo de 1 minuto, sem cadastro, controles mínimos (tema, som, pausa, proporção) | recursos rasos, sem grupo, sem voz | esse é o alvo do nosso Modo Simples: 5 controles, nada mais |
| HeyFake | timing por mensagem + velocidade global 0.5x–2x, teclado animado, prévia em loop | beta, render assíncrono por e-mail | velocidade global como um único controle; teclado animado como recurso opcional |
| MockChats | detalhe de interface (tique azul, status online, wallpaper), reações e notas de voz | foco em imitar um aplicativo só | recibos de leitura como recurso narrativo com tempo próprio |
| Nova Clipper | uma voz de IA por lado, vídeo de fundo em loop, legendas cinéticas | apenas dois lados, sem grupo, sem mídia | elenco de vozes por participante + fundo em vídeo + legendas |
| GhostShorts | roteiro → vídeo, vozes por personagem, catálogo amplo de formatos | crédito caro, pouco controle fino | fluxo "escreveu, saiu o vídeo" como caminho rápido |
| TextingStory | gravação do ritmo humano: hesitação, erro, correção | dois participantes, sem voz, sem grupo | **gravação de digitação humana** é o diferencial mais forte disponível |
| Fake Chat Story Maker | prompt → história com personagens e reviravoltas | qualidade de saída irregular | geração de roteiro fica para fase futura |

## Gap analysis

**O que todos fazem:** bolhas animadas, indicador de digitação, rolagem
automática, exportação vertical, tema claro/escuro.

**O que só alguns fazem:** grupos nomeados, notas de voz com waveform, reações e
respostas citadas, timing por mensagem, render local, vídeo de fundo, TTS.

**O que ninguém faz bem:**
1. **Voz e conversa juntas.** Quem tem voz (Nova, GhostShorts) não tem grupo,
   mídia nem controle fino. Quem tem conversa rica (Chatimator, MockChats) não
   tem voz.
2. **Ritmo humano.** Só o TextingStory grava hesitação e correção, e é limitado a
   duas pessoas, sem voz.
3. **Linha do tempo de verdade.** A maioria expõe "pausa por mensagem"; ninguém
   oferece uma linha do tempo determinística com áudio sincronizado.
4. **Mídia dentro da conversa.** Vídeo, GIF e figurinha dentro da bolha são raros
   ou ausentes.
5. **Lote.** Ninguém produz dezenas de variações de uma mesma conversa — e o
   VaiViral já tem processamento em lote, agenda e publicação.

**O que é frustrante hoje:** fila de render na nuvem, marca d'água, crédito caro,
tema que é só troca de cor, e refazer a conversa inteira para mudar o ritmo.

## Nosso diferencial

Elenco de vozes por participante + conversa rica em grupo + ritmo humano +
linha do tempo determinística + lote e agenda já existentes no VaiViral.
Nenhum concorrente combina esses cinco.

## Escopo proposto

**MUST HAVE V1**
- Participantes múltiplos com avatar e nome (grupo desde o começo).
- Mensagens: texto, imagem, emoji, sistema, digitação.
- Modo Simples: escrever, escolher tema, pré-visualizar, exportar.
- Temas próprios (mínimo 4) claro/escuro.
- Linha do tempo determinística com velocidade global e atraso por mensagem.
- Prévia ao vivo 9:16 com safe zones visíveis.
- Exportação MP4 1080p, render local.
- Gate de licença em todo asset.

**SHOULD HAVE V1**
- Reações, respostas citadas, recibos de leitura com tempo próprio.
- Vídeo, GIF e figurinha dentro da bolha.
- Fundo: cor, imagem ou vídeo em loop.
- Import de roteiro em texto simples (`Nome: mensagem`).
- Proporções 1:1 e 16:9.

**V2**
- Elenco de vozes: uma voz por participante, com duração medida.
- Notas de voz com waveform.
- Ritmo humano: hesitação, erro e correção.
- Legendas cinéticas sobre a conversa.
- Lote: várias variações da mesma conversa, ligadas à agenda existente.

**FUTURE**
- Roteiro gerado por IA a partir de uma premissa.
- Teclado animado.
- Integração com o Editor V2 por adaptador.
- Exportação com fundo transparente.

**DON'T BUILD**
- Cópia pixel a pixel de interface de aplicativo protegido ou uso de logos de
  terceiros.
- Gerador de captura estática falsa como produto principal.
- Segundo sistema de assets, de agenda ou de publicação.
- Clonagem de voz de pessoa real.
