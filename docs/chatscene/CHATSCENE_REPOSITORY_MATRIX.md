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
