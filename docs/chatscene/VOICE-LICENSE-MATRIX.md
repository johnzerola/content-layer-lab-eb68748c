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
| Qwen3-TTS código/runtime | https://github.com/QwenLM/Qwen3-TTS | Apache-2.0 | Permitido | Preservar copyright, licença e NOTICE; pesos são tratados separadamente | QwenLM / Alibaba Cloud | qwen-tts 0.1.1; commit `5ecdb67327fd37bb2e042aab12ff7391903235d3` | ALLOWED_ISOLATED_GENERATOR |
| Qwen3-TTS 0.6B Base pesos | https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base | Apache-2.0 | Permitido | Preservar licença do modelo; avaliado somente em ambiente isolado, sem ativação no produto | QwenLM / Alibaba Cloud | revisão instalada em 2026-09-27 | ALLOWED_RESEARCH_NOT_SHIPPED — fidelidade não superou Chatterbox nas amostras curtas |
| Qwen3-TTS 1.7B VoiceDesign pesos | https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign | Apache-2.0 | Permitido | Preservar licença do modelo; os WAVs derivados deste catálogo carregam a proveniência no `catalog.json` | QwenLM / Alibaba Cloud | revisão `5ecdb67327fd37bb2e042aab12ff7391903235d3` | ALLOWED_AFTER_WEIGHT_DOWNLOAD |
| OpenVoice V2 código e checkpoints oficiais | https://github.com/myshell-ai/OpenVoice e https://huggingface.co/myshell-ai/OpenVoiceV2 | MIT | Permitido | Preservar copyright e licença MIT; português não é idioma nativo do V2, portanto usar somente como conversor de timbre e validar PT-BR antes de integrar | MyShell.ai / MIT / Tsinghua University | código `74a1d147b17a8c3092dd5430504bd83ef6c7eb23`; checkpoint oficial HF V2 `fd98110` | ALLOWED_ISOLATED_EVALUATION |
| Catálogo PT-BR sintético de 15 identidades | Gerado por `backend/chatscene_voice/generate_qwen_catalog.py` | Derivado de pesos Apache-2.0; nenhum locutor real | Permitido no escopo da licença do modelo | Não representa pessoa real; manter `catalog.json`, prompt e hash WAV; não usar como clonagem | Projeto VaiViral | schema 1 | ALLOWED_SYNTHETIC_CATALOG |
| Voz base autorizada 1 | `voz 1.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `b50367984d636990e2846bb812c373a29bd69077a156e4a00b0a3ab410b12b39` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 2 | `voz 2.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `c6ffd2faa3fbde8922e5fb7a88fe61e7c8b82ce20ca38c10e939745f45ecd7fb` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 3 | `voz 4.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `118d41d5173359b0469072003d4d0416e7af71c127d1de7c1ae753b307f95c8b` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 4 | `voz 6.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `60c4bf08f7ea000b96ef87981f05442ebae1611fa6fca7caf7b610ff370e5a25` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 5 | `voz 7.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `8866e4757b6e020572aaa7bd82318586e23bf323a20995fb889eccb4cf4893b8` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 6 | `voz 8 .MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `c190c4329ac026bb66de4f37966c6e5053e402c2fb896bc1eda9c9140bd8d5fa` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 7 | `voz 9.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Sem atribuição; manter fora do Git e preservar manifesto privado | Usuário/titular autorizado | SHA-256 `282e39f52020feb13bf72a2e8ea228273000c09c01f2524f884c37f37e3e44dd` | ALLOWED_PRIVATE_BASE_CATALOG |
| Voz base autorizada 8 | `voz 10.MP3`, fornecida pelo usuário | Autorização direta do titular | Somente projeto privado/não comercial confirmado | Arquivo contém duas pessoas; manter fora do Git e usar somente o trecho isolado autorizado de 35,4–44,8 s no catálogo privado | Usuário/titular autorizado | SHA-256 original `c6166f2c19325beb353df8444de9b08e5753c45eaff8a096e52c8f1ac0ce1a03`; referência preparada `bf2893c83843017d04486977d7c8b8762c7786bed6e4966c0365a99f6431bcfd` | ALLOWED_PRIVATE_BASE_CATALOG |

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
