# ChatScene — Matriz de licenças de voz e áudio

| Item | Origem | Uso permitido | Observação |
| --- | --- | --- | --- |
| Vozes sintéticas do elenco | TTS do gateway (server-side) | Uso comercial conforme termos do provedor | Vozes genéricas; nenhuma associada a pessoa real |
| Nomes dos presets (Clara, Bruno, ...) | Criados neste projeto | Livre | Rótulos próprios, não marcas |
| Estilos de fala (calma, nervosa, ...) | Direções de texto próprias | Livre | Apenas instrução textual ao TTS |
| Música de fundo | Fornecida pelo usuário via endereço | Responsabilidade do usuário | UI avisa "uso permitido"; nada é embutido no produto |
| Mídia enviada (foto, vídeo, figurinha) | Usuário | Responsabilidade do usuário | Mesmo aviso já aplicado na Phase 3 |

## Dependências do Voice Transform Engine V1

| Item | Fonte | Licença | Uso comercial | Atribuição / obrigações | Autor | Versão | Veredito |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ffmpeg-static` e binário FFmpeg empacotado | https://github.com/eugeneware/ffmpeg-static e https://ffmpeg.org/legal.html | GPL-3.0-or-later no pacote/build instalado; o FFmpeg base é LGPL-2.1-or-later, mas partes opcionais tornam este build GPL | Permitido, sujeito à GPL | Preservar licença, disponibilizar o código-fonte correspondente do binário distribuído e cumprir a GPL; uma build LGPL própria pode substituir via `FFMPEG_PATH` | Eugene Ware, Jannis R e contribuidores do FFmpeg/build gyan.dev | npm 5.3.0; FFmpeg 6.1.1 essentials | ALLOWED_WITH_GPL_OBLIGATIONS |
| Rubber Band (detectado no binário, não usado pelo V1) | Build FFmpeg instalado | Não avaliada para integração do produto | Não ativado | Nenhum backend ou filtro Rubber Band é chamado; nova avaliação obrigatória antes de ativar | Não aplicável nesta entrega | Não ativado | BLOCKED_UNTIL_REVIEWED |
| Piper runtime local | https://github.com/OHF-Voice/piper1-gpl | GPL-3.0-or-later | Permitido, sujeito à GPL | Preservar licença e disponibilizar código-fonte correspondente ao distribuir o runtime | Open Home Foundation | `piper-tts` 1.8.0 | ALLOWED_WITH_GPL_OBLIGATIONS |
| Voz `pt_BR-faber-medium` | https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR/faber/medium | MIT (repositório/modelo); dataset CC0 | Permitido | Sem atribuição obrigatória do dataset; manter licença do repositório ao redistribuir | OHF Voice / comunidade Piper | SHA-256 `858555e3a064209c57088fe6bd70c4c3dc54d03eaa00c45d5ecaf43a33f95aa7` | ALLOWED_LOCAL_PT_BR |
| Voz `pt_BR-cadu-medium` | https://huggingface.co/rhasspy/piper-voices/tree/1b182b342fcce87f72d0e4fdf88131e5144f62d8/pt/pt_BR/cadu/medium | MIT (repositório/modelo); dataset CC0 | Permitido | Manter licença MIT ao redistribuir; instalar somente no servidor | OHF Voice / comunidade Piper | revisão `1b182b3`; SHA-256 `765f0809a6ea9035d4a6d0d008dbf8876e68b2dd32029312672fa8f405bdb535` | ALLOWED_OPTIONAL_PT_BR |
| Voz `pt_BR-jeff-medium` | https://huggingface.co/rhasspy/piper-voices/tree/1b182b342fcce87f72d0e4fdf88131e5144f62d8/pt/pt_BR/jeff/medium | MIT (repositório/modelo); dataset CC0 | Permitido | Manter licença MIT ao redistribuir; instalar somente no servidor | OHF Voice / comunidade Piper | revisão `1b182b3`; SHA-256 `3a6f4c46355813c2b7bbc4d16b6d13d60ed72074b952a393baace82a7d0c94b5` | ALLOWED_OPTIONAL_PT_BR |
| Kokoro-82M e catálogo oficial | https://huggingface.co/hexgrad/Kokoro-82M | Apache-2.0 | Permitido | Preservar licença/NOTICE ao redistribuir | hexgrad | v1.0 | RESEARCHED_NOT_BUNDLED — vozes PT-BR oficiais existem, mas o pacote JS avaliado não as inclui |

## Regras firmes

## Local voice cloning (authorized adult voices, 2026-09-16)

| Item | Source | License | Commercial use | Attribution | Author | Version | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chatterbox Multilingual runtime | https://github.com/resemble-ai/chatterbox | MIT | Yes | Preserve copyright and license in third-party notices | Resemble AI | chatterbox-tts 0.1.6 | ALLOWED |
| Chatterbox multilingual weights | https://huggingface.co/ResembleAI/chatterbox | MIT | Yes | Preserve copyright and license; retain upstream PerTh watermarking | Resemble AI | `t3_mtl23ls_v2.safetensors`; revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18` | ALLOWED |
| `spacy-pkuseg` + `spacy_ontonotes` tokenizer data | https://github.com/explosion/spacy-pkuseg | MIT | Yes | Preserve copyright and license when redistributed | Explosion | runtime 1.0.1; model release 0.0.26, SHA-256 `b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe` | ALLOWED |

The user explicitly authorized adult voice references on 2026-09-16. This extends the earlier synthetic-only V1 scope. Uploaded references are private, scoped to the authenticated account, and are not bundled or published. No personal reference is used for development tests; tests use locally synthesized speech.

1. Clonagem de voz exige referência própria ou autorização escrita da pessoa adulta. O usuário confirmou este escopo em 2026-09-16; a interface registra a declaração no envio autenticado.
2. Nenhuma chave de provedor de voz sai do servidor.
3. Nenhum asset de áudio de terceiros é distribuído junto do produto.
4. Qualquer novo provider de voz entra por `VoiceProvider` e só após checagem de licença
   registrada nesta matriz.
