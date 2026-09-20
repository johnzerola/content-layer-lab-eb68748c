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
| Kokoro-82M e catálogo oficial | https://huggingface.co/hexgrad/Kokoro-82M | Apache-2.0 (pesos e cartão do modelo) | Permitido | Preservar licença/NOTICE ao redistribuir; os pesos ficam no servidor, não no bundle web | hexgrad | v1.0; revisão `30618d04b530efb8e3ac3bace784f9d4a8dcaa01` | ALLOWED_SERVER_ONLY — três locutores PT-BR distintos: `pf_dora` (feminino), `pm_alex` e `pm_santa` (masculinos); **nenhuma faixa etária declarada** |
| Kokoro Python runtime | https://github.com/hexgrad/kokoro | Apache-2.0 | Permitido | Preservar licença/NOTICE ao redistribuir | hexgrad | `kokoro==0.9.4` | ALLOWED_SERVER_ONLY |
| Misaki G2P, dependência do Kokoro | https://github.com/hexgrad/misaki | Apache-2.0 | Permitido | Preservar licença/NOTICE ao redistribuir | hexgrad | transitiva de `kokoro==0.9.4` | ALLOWED_SERVER_ONLY |
| eSpeak NG, fonemização PT-BR | https://github.com/espeak-ng/espeak-ng | GPL-3.0-or-later | Permitido, sujeito à GPL | Servidor usa pacote do sistema; ao redistribuir, cumprir licença/código-fonte correspondente | eSpeak NG | pacote da distribuição do servidor | ALLOWED_WITH_GPL_OBLIGATIONS |
| OmniVoice runtime/código | https://github.com/k2-fsa/OmniVoice | Apache-2.0 | Permitido para o código | Preservar licença/NOTICE ao redistribuir | k2-fsa | API 0.2.1 planejada | INTEGRATION_PREPARED_NOT_INSTALLED |
| OmniVoice pesos oficiais | https://huggingface.co/k2-fsa/OmniVoice | CC-BY-NC, salvo concessão comercial separada | **Não pelo termo público** | Conferir documento privado de licença comercial, titular, escopo SaaS, distribuição e prazo antes de baixar/servir | k2-fsa | 0.6B | BLOCKED_UNTIL_COMMERCIAL_GRANT_VERIFIED |
| Perfis de voz projetados com OmniVoice | Criados pelo produto a partir de atributos genéricos | Dependem dos direitos sobre os pesos e revisão de qualidade | Não publicados nesta etapa | Cada perfil precisa de amostra PT-BR audível, aprovação e prompt reutilizável; nomes não representam pessoas reais | VaiViral | 18 candidatos | CANDIDATES_NOT_VOICES_YET |

## Regras firmes

## Local voice cloning (authorized adult voices, 2026-09-16)

| Item | Source | License | Commercial use | Attribution | Author | Version | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chatterbox Multilingual runtime | https://github.com/resemble-ai/chatterbox | MIT | Yes | Preserve copyright and license in third-party notices | Resemble AI | chatterbox-tts 0.1.6 | ALLOWED |
| Chatterbox multilingual weights | https://huggingface.co/ResembleAI/chatterbox | MIT | Yes | Preserve copyright and license; retain upstream PerTh watermarking | Resemble AI | `t3_mtl23ls_v2.safetensors`; revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18` | ALLOWED |
| Chatterbox dedicated PT-BR V3 weights | https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br | MIT | Yes | Preserve copyright and license; retain upstream PerTh watermarking. The checkpoint is a model, not a catalogue of 50 distinct speakers. | Resemble AI | `t3_pt_br.safetensors` and `s3gen_v3.safetensors`; revision `b3952f18bc2eaa72b9bd7c17d2c4653bcad4770d` | ALLOWED_MODEL_ONLY; NO_BUNDLED_VOICE_CATALOG |
| `spacy-pkuseg` + `spacy_ontonotes` tokenizer data | https://github.com/explosion/spacy-pkuseg | MIT | Yes | Preserve copyright and license when redistributed | Explosion | runtime 1.0.1; model release 0.0.26, SHA-256 `b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe` | ALLOWED |

The user explicitly authorized adult voice references on 2026-09-16. This extends the earlier synthetic-only V1 scope. Uploaded references are private, scoped to the authenticated account, and are not bundled or published. No personal reference is used for development tests; tests use locally synthesized speech.

1. Clonagem de voz exige referência própria ou autorização escrita da pessoa adulta. O usuário confirmou este escopo em 2026-09-16; a interface registra a declaração no envio autenticado.
2. Nenhuma chave de provedor de voz sai do servidor.
3. Nenhum asset de áudio de terceiros é distribuído junto do produto.
4. Qualquer novo provider de voz entra por `VoiceProvider` e só após checagem de licença
   registrada nesta matriz.
