# Editor V2 — expansão criativa e inspeção profissional

Data: 13/09/2026

Estado: **FUNCTIONAL_PASS_EXPORT_ADAPTER_PENDING**

## Resultado

O Editor V2 agora reaproveita as partes maduras do editor anterior por meio do documento, dos comandos e do resolvedor temporal da nova arquitetura. O pacote deixa de mostrar categorias vazias e adiciona edição funcional para vídeo, stickers, textos, legendas, filtros, efeitos e animações.

## Conteúdo disponível

- mais de 60 estilos de legenda provenientes da biblioteca profissional existente;
- 12 presets de texto;
- 14 stickers vetoriais animados, com o mesmo renderer na biblioteca e no canvas;
- 12 efeitos visuais, incluindo zoom burst, shake, flash, RGB split, glitch, VHS, film grain, light leak, slow zoom, vignette, pulse e whip;
- 12 filtros de vídeo e imagem;
- 19 animações distribuídas entre entrada, saída e loop;
- importação de legendas SRT e VTT com cues e palavras temporizadas.
- geração automática de legendas em português, reaproveitando o serviço real do editor anterior e respeitando corte, velocidade e posição do clipe no projeto.

## Inspector contextual

Ao selecionar um vídeo ou imagem, o painel apresenta controles de Básico, Velocidade, Animação, Ajuste e Efeitos. A velocidade aceita de 0,1× a 4× e atualiza a duração do clipe. Animações de entrada, saída e loop têm duração e intensidade próprias. Os ajustes cobrem exposição, brilho, contraste, saturação, temperatura, matiz, realces, sombras, fade, nitidez, vinheta, grão e blur.

Textos e legendas receberam contorno, sombra, caixa alta, espaçamento, altura de linha, destaque e motion por palavra. Stickers permitem alterar texto, cores e velocidade.

## Contrato de preview e exportação

O canvas e o manifesto de render usam `resolveClipPresentation`, que resolve no mesmo tempo de projeto os ajustes, filtros, efeitos e animações. O manifesto serializa esses parâmetros junto do clipe. Isso elimina dois estados concorrentes, mas a equivalência do MP4 final ainda depende da implementação e validação do adaptador de exportação da Fase 6.

## Validação

- TypeScript: passou com `npx tsc --noEmit`;
- build de produção: passou com `npm run build`;
- biblioteca Editor V2: 6 testes passaram;
- documento, comandos e render: 33 testes passaram;
- navegador real em 1440×1000: passou sem erros de console e sem overflow global;
- fluxo coberto no navegador: selecionar vídeo, alterar velocidade para 1,5×, aplicar filtro Vibrante, efeito Zoom Burst, loop Flutuar, inserir sticker vetorial e importar duas legendas SRT.

A geração automática foi validada no contrato de transformação temporal e preservação do tempo por palavra. Uma chamada paga/externa de transcrição não foi disparada nesta rodada; a disponibilidade final depende das credenciais e da cota do serviço já usado pelo editor anterior.

O teste visual encontrou inicialmente uma exceção quando um sticker era montado antes de o canvas receber dimensões. O renderer passou a usar dimensões mínimas seguras e o fluxo completo foi repetido com sucesso.

## Limites e próximos módulos

Este pacote não declara paridade total com CapCut. Permanecem para as próximas entregas:

1. workspace de transcrição com busca, correção, substituição e edição do vídeo pelo texto;
2. curvas de velocidade, congelamento, reverso e remapeamento temporal;
3. máscaras, remoção de fundo, tracking e reenquadramento automático;
4. estabilização, redução de ruído, melhoria de imagem e LUTs importáveis;
5. navegador de mídia com favoritos, recentes, download e gestão de assets;
6. adapter final que renderiza no arquivo exportado todos os recursos resolvidos no manifesto;
7. comparação automática e visual entre preview, frames exportados, áudio e legendas antes do rollout.

O próximo gate deve começar pelo adaptador de exportação e por fixtures curtas que combinem legenda animada, sticker, filtro, efeito e animações de entrada/saída/loop. Só depois o Editor V2 deve substituir o editor atual em projetos reais.
