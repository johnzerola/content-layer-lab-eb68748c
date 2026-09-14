# Roadmap

- [x] Auditar e ativar Skills de Remotion, React, UX/UI, acessibilidade e FFmpeg sem alterar o aplicativo
- [ ] MCPs: apenas Sentry está disponível no catálogo e depende da sua autorização; Lovable, GitHub, Playwright, Context7 e Supabase não são conectáveis por aqui
- [x] Ajustes/efeitos apenas na área do vídeo (fundo desfocado fica natural) — draw.ts
- [ ] Configurar envs do Instagram OAuth em produção: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI (aguardando valores do usuário)
- [x] Tornar a galeria de Estilos visível e aplicável no painel contextual do editor
- [x] Corrigir lentidão e ausência do menu em /templates e permitir selecionar novamente o mesmo vídeo
- [x] Criar Estúdio de câmera/microfone com envio direto ao editor profissional
- [x] Corrigir navegação travada em Integrações e padronizar o menu nas ferramentas internas

## Analogue ChatScene — fundação
- [x] UI Fidelity + Conversation Engine + Voice Cast System
- [x] Auditoria de skills e ferramentas do workspace
- [x] Ativação do pacote Remotion oficial (best-practices, captions, multimedia, saas, interactivity)
- [x] Criação das 11 skills ChatScene
- [x] Documentação em docs/chatscene/ (skill, mcp, repository, knowledge, license)
- [ ] Context7: indisponível neste ambiente; reavaliar com o app de desktop
- [ ] Figma MCP: exige app de desktop; opcional
- [x] Fase 1 do ChatScene: documento, relógio, temas, prévia 9:16, exportação MP4 e salvamento
- [x] Fase 2 do ChatScene: vozes reais por participante, velocidade/pitch, notas, reações, respostas e timeline sincronizada
- [x] Benchmark de concorrentes e matriz de funcionalidades do ChatScene
- [x] Gap analysis e escopo MUST/SHOULD/V2/FUTURE/DONT
- [x] ChatScene: corrigir vídeo de fundo atrás da conversa e incluir efeitos sonoros no download sem vozes
- [x] ChatScene: integrar galeria de fundos 9:16 com troca em tempo real, loop e desfoque
- [ ] ChatScene: validar em navegador a fala real sincronizada com chat e fundo animado (aguardando login na prévia)
- [x] ChatScene: presets reutilizáveis de atuação vocal em pt-BR, salvos por personagem
- [x] ChatScene: história completa gera elenco nomeado e falas reais pt-BR, sem fallback mock

## ChatScene V5 — Fases B/C/D (concluídas)
- [x] Personalidade de escrita por personagem (presets) e ritmo de digitação derivado
- [x] Histórico inicial (`initial`) visível no quadro zero
- [x] Linha de eventos + `getStateAt` (estado único do relógio)
- [x] Entregue/lido com tempo, bolhas agrupadas e rabinho só na última
- [x] Desfazer/refazer do documento (Ctrl+Z / Ctrl+Shift+Z)
- [x] Altura da janela de conversa 40/50/60%
- [x] Fase E: gerador de história por IA (tema, tom, duração, personagens) com vozes e personalidades automáticas
- [ ] Pendente: motor de gameplay (biblioteca inteligente de fundos), editor avançado completo
- [x] ChatScene: efeitos de entrada/saída com alças de duração e intensidade na linha do tempo
- [x] ChatScene: estilo por personagem (cor do balão, cor/fonte/tamanho do texto, negrito e itálico)
- [x] Banco: índices e listagens leves em projetos, transcrições e lotes

## Lançamento
- [x] Biblioteca: botão Baixar para os vídeos guardados na conta (link temporário)
- [x] TikTok real na Biblioteca e Agenda via API oficial, com OAuth, renovação e link da publicação
- [x] Tela inicial: estúdios carregam sob demanda
- [ ] Pagamento real (Paddle ou Stripe) — adiado por decisão do usuário
- [ ] Retenção de arquivos por plano com aviso antes de apagar
