# ChatScene — Repository Decision Matrix

Nenhuma instalação foi feita. Licenças reconfirmadas na origem antes de qualquer
`bun add`.

| Projeto | Decisão | Licença declarada | Motivo |
| --- | --- | --- | --- |
| remotion-dev/remotion | USE_AS_DEPENDENCY (fase futura) | Remotion License (gratuita para indivíduos e times pequenos; empresa exige licença paga) | Renderizador candidato. **Verificar a licença comercial antes de adotar.** |
| remotion-dev/skills | IMPORTED | acompanha o Remotion | Já presente como Agent Skills |
| chatscope/chat-ui-kit-react | STUDY_ONLY | MIT | Referência de componentes de chat; nosso visual é estratégico e precisa de controle total do render |
| motion-canvas/motion-canvas | REJECT | MIT | Concorre com o renderizador escolhido; misturar dois motores de animação é dívida técnica |
| missive/emoji-mart | USE_AS_DEPENDENCY | MIT | Seletor de emoji maduro; não vale reimplementar |
| LottieFiles/lottie-react | FUTURE | MIT (arquivos Lottie têm licença própria) | Para figurinhas animadas; cada arquivo passa pelo gate de licença |
| hexgrad/kokoro | FUTURE | Apache-2.0 (pesos: verificar) | TTS leve; depende de infraestrutura e da licença dos pesos |
| OpenBMB/VoxCPM | STUDY_ONLY | verificar antes de qualquer uso | TTS/voice design; custo e licença dos pesos não validados |

## Princípio

Biblioteca madura resolve problema comum. Componente estratégico é nosso.
Repositório de inspiração fica em STUDY_ONLY — não copiamos projetos inteiros.

## Busca dirigida — repositórios de chat animado (2026-09-12)

Busca por: animated chat video, chat story generator, message animation, fake
chat generator, WhatsApp-style React chat, iMessage-style animation, texting
story, conversation renderer, Remotion chat, WebCodecs video export.

| REPOSITORY | STARS/ACTIVITY | LAST_UPDATE | TECH_STACK | LICENSE | FEATURES | CODE_QUALITY | WHAT_TO_REUSE | WHAT_TO_STUDY_ONLY | SECURITY_RISK | COMMERCIAL_COMPATIBILITY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anthony80188/chat-video-renderer-nextjs | 0 estrelas, projeto novo | 2026 | Next.js 16, React 19, @remotion/player | não declarada | editor de chat iMessage/Telegram com prévia Remotion | não avaliado, projeto de uma pessoa | nada | arquitetura Player + composição | sem licença declarada = não usar | INCOMPATÍVEL sem licença |
| Trumbo110/text-message-video-skills | 0 estrelas, fork | 2026 | HTML/Shell (skills de agente) | MIT | roteiro → vídeo de conversa a partir de array de mensagens | conteúdo textual, não biblioteca | ideias de estrutura de roteiro | formato do array de mensagens | baixo | COMPATÍVEL (MIT) |
| remotion-dev/template-prompt-to-video | 244/127 estrelas, oficial | 2026 | Remotion, TypeScript | Remotion License | história com imagens e narração para TikTok | alta | padrão de pipeline roteiro→voz→render | orquestração de TTS + render | baixo | sujeito à licença comercial do Remotion |
| remotion-dev/template-prompt-to-motion-graphics-saas | 244 estrelas, oficial | 2026 | Remotion, Next.js | Remotion License | SaaS de motion graphics por prompt | alta | padrão de SaaS de render | fila e player | baixo | idem acima |
| ChatScope chat-ui-kit-react | maduro | ativo | React | MIT | componentes de interface de chat | boa | nada por ora (interface é nossa) | acessibilidade e estrutura de bolha/lista | baixo | COMPATÍVEL (MIT) |

**Conclusão:** não existe projeto aberto maduro de vídeo de conversa animada.
Os que existem são protótipos de uma pessoa, muitos sem licença. Decisão:
implementação própria; reaproveitar apenas bibliotecas de propósito único
(emoji, lottie) e os padrões oficiais do Remotion. Nenhum código de terceiro foi
copiado.
