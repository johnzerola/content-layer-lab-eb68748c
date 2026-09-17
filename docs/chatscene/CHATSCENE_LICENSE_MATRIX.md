# ChatScene — License Matrix

Toda entrada precisa de seis campos. Licença desconhecida = BLOCKED.

| Item | Source | License | Commercial | Attribution | Author | Version | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Remotion | github.com/remotion-dev/remotion | Remotion License | condicional (empresa paga) | não | Remotion | 4.0.x | PENDING — validar antes de adotar |
| Remotion Agent Skills | github.com/remotion-dev/skills | acompanha Remotion | condicional | não | Remotion | 4.0.523 | ALLOWED (uso como conhecimento) |
| emoji-mart | github.com/missive/emoji-mart | MIT | sim | não | Missive | latest | ALLOWED |
| lottie-react | github.com/LottieFiles/lottie-react | MIT | sim | não | LottieFiles | latest | ALLOWED (arquivos .json avaliados 1 a 1) |
| chat-ui-kit-react | github.com/chatscope | MIT | sim | não | ChatScope | — | STUDY_ONLY |
| motion-canvas | github.com/motion-canvas | MIT | sim | não | Motion Canvas | — | REJECTED (escopo) |
| Kokoro-82M + vozes oficiais | huggingface.co/hexgrad/Kokoro-82M | Apache-2.0 | sim | preservar licença/NOTICE ao redistribuir | hexgrad | v1.0 | RESEARCHED — PT-BR existe nos pesos, mas bloqueado no JS V1 porque o pacote não inclui essas vozes |
| Piper runtime | github.com/OHF-Voice/piper1-gpl | GPL-3.0-or-later | sim, com obrigações GPL | preservar licença e oferecer código-fonte correspondente ao distribuir | Open Home Foundation | piper-tts 1.8.0 | ALLOWED_WITH_GPL_OBLIGATIONS para execução local |
| Piper `pt_BR-faber-medium` | huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/faber/medium | MIT (repositório/modelo); dataset CC0 | sim | sem atribuição exigida pelo dataset; preservar licença do repositório ao redistribuir | OHF Voice / comunidade Piper | SHA-256 858555e3a064209c57088fe6bd70c4c3dc54d03eaa00c45d5ecaf43a33f95aa7 | ALLOWED — voz masculina PT-BR local |
| VoxCPM | github.com/OpenBMB/VoxCPM | a verificar | a verificar | a verificar | OpenBMB | — | BLOCKED até verificação |
| Fontes do projeto | Google Fonts | OFL-1.1 | sim | não | vários | — | ALLOWED |
| Temas de chat | interno | interno | sim | não | VaiViral | 1 | ALLOWED |

## Regras

- Código permissivo não implica pesos de modelo permissivos: avaliar separado.
- Item com atribuição obrigatória precisa de plano de crédito visível antes do uso.
- Nenhum item entra no aplicativo sem os seis campos preenchidos.
