# ChatScene — checkpoint operacional

15/09/2026. **Formatos e criação implementados; testes e exportações visuais locais aprovados. Qualidade vocal e smoke autenticado pendentes.**

## GOAL

Escolha clara entre Fake WhatsApp e histórias do Reddit, criação por prompt, UI/UX e resultado final orientados pelos seis prints em G:/dowloand/aachat e pelo Short JeQX0EKT4z4. Autorização para aproveitar os repositórios já registrada; não pedir novamente nem instalar novos pacotes/MCPs.

## DECISIONS / CURRENT_ARCHITECTURE

Preservar Canvas, documento, autenticação, providers e relógio/scheduler ativos. CreatorFormatPicker/StoryPanel alimentam story-generation ou reddit-story. O ConversationPlan legado continua comum à prévia e exportação.

layout.pagination = pages usa fontes, balões e mídia para particionar a conversa. reddit-draw desenha título/atribuição do relato ativo e seu trecho atual. Fundo mantém tempo absoluto. Clock V3 permanece experimental e isolado.

voice-request preserva instruções até 1600 caracteres; cache ator-br-3 invalida áudio antigo. Preset novo substitui timbre anterior e isola perfis compartilhados. Idade/gênero declarados chegam ao provider. Isso não demonstra naturalidade de áudio ainda não gerado.

## FILES_CHANGED

Ver [CREATOR_EXPERIENCE_20260915.md](CREATOR_EXPERIENCE_20260915.md) para implementação, evidências, uso e rollback. Alterações limitadas a ChatScene. .codex/ preexistente não deve ser removido ou incluído automaticamente em commit. Sem push/deploy, mudança de Cleaner/banco ou nova dependência.

## TESTS

- 19 arquivos / 220 testes ChatScene passaram; TypeScript, ESLint direcionado e build com saída 0. A última correção do título ativo também passou nos 13 testes de formatos e no build final.
- Harness com componentes, histórico e Canvas reais: formatos, prompt preservado, revisão/importação, desfazer/refazer, teclado, estado ocupado e transporte.
- 1440/1366/390 px sem overflow horizontal; zero erros de console após recarregar.
- MP4 reais sem áudio: H.264 720×1280/30fps, WhatsApp 513 frames/17,1s e Reddit 714 frames/23,8s; ffprobe e quadros decodificados conferidos.
- HTMLCanvas/OffscreenCanvas apresentam diferenças residuais de rasterização: igualdade pixel a pixel não aprovada.
- Suíte global anterior tem falha TLS separada, registrada em VALIDATION_20260915.md; não repetida sem necessidade.

## KNOWN_FAILURES / CONSTRAINTS

http://127.0.0.1:8091/chatscene está disponível e exige login no navegador isolado. Autenticação preservada, nenhum token pessoal copiado. Harness não valida provedor, cobrança, upload, persistência remota ou áudio final. Testes de prompt validam contrato, não qualidade literária gerada.

Página e quadro real do canal foram vistos. Download comum de áudio retornou 403; nenhuma escuta crítica ou paridade de voz aprovada. Exemplos são originais, sem áudio ou gameplay copiado.

Documentos antigos continuam em WhatsApp/scroll. Para adotar a apresentação nova, usar o seletor ou Aplicar visual. Texto excepcionalmente longo é reduzido para caber e deve ser dividido para legibilidade. V3 continua recusando speed diferente de 1 e initial até migrar contrato.

## OPEN_ITEMS / NEXT_STEP

Gerar e revisar roteiro original de 30–45s na sessão autenticada; ouvir prévias de 2–3 personagens; gerar elenco completo; exportar com áudio e revisar ritmo, pausas e fundo. Não criar outra engine antes desse gate.

Sol / medium para UI/contratos cobertos; Sol / high para áudio/timing. Astra / high somente para conflito causal/arquitetural. São orientações, não benchmark de custo.

## ROLLBACK

Desfazer recupera o documento anterior ao visual. Desativar pages/Reddit não remove blocos importados. Preservar mídias, artefatos e história publicada do Lovable.
