# Plano mestre de estabilização e evolução do VaiViral

## Objetivo
Transformar o sistema atual em um fluxo confiável de ponta a ponta: importar, editar, gerar cortes/legendas, renderizar mesmo com o navegador fechado, baixar resultados e publicar nas contas sociais sem estados falsos ou travamentos silenciosos.

## Diagnóstico confirmado

- A aplicação compila e os **135 testes atuais passam**, mas a cobertura está concentrada em integrações sociais e utilitários; os fluxos críticos de render, editor e retomada de jobs ainda não têm testes de ponta a ponta.
- A VPS pública responde, porém está em **CPU**, sem CUDA, ProPainter ou DiffuEraser; apenas o fallback clássico está pronto. Além disso, a versão implantada não expõe `/v1/render/jobs`, embora essa fila já exista no código local do worker. Por isso “renderizar na nuvem” falha hoje.
- O site publicado ainda não contém mudanças recentes: `/exclusao-de-dados` e `/api/public/meta/data-deletion` retornam 404 em produção, enquanto o callback do Facebook existe. É necessário publicar a versão atual antes de validar a configuração da Meta.
- O OAuth gerado pelo app usa `config_id`, callback exato e não envia escopos manuais. O erro genérico da Meta ocorre antes do callback e aponta principalmente para configuração/publicação do app ou `config_id`, não para a construção atual da URL.
- Facebook/Instagram usam o mesmo Facebook Login for Business e todas as Páginas autorizadas são salvas automaticamente; ainda não existe uma etapa para o usuário escolher quais Páginas conectar.
- TikTok e YouTube aparecem como indisponíveis. Há base de OAuth para TikTok, mas a publicação TikTok/YouTube ainda não deve ser considerada concluída enquanto as APIs oficiais não estiverem ativas.
- A Biblioteca registra exportações, mas o botão “Baixar” está permanentemente desativado e os arquivos locais não são persistidos no backend.
- A rota principal tem 3.610 linhas e importa todos os estúdios pesados de forma estática. O preview redesenha continuamente mesmo pausado, e a timeline recalcula miniaturas/waveform no thread principal. Isso contribui para lentidão e alto uso de CPU.
- Há feedback fragmentado entre docks e telas; em celular eles podem competir por espaço. Várias rotas ainda têm metadados incompletos e alguns estados globais/erros continuam em inglês.

## Fase 1 — Corrigir o ambiente real e impedir promessas falsas (P0)

1. **Publicar e validar a versão atual do app**
   - Publicar as rotas de exclusão de dados e callbacks já implementadas.
   - Confirmar HTTP 200 para a página pública e comportamento assinado dos endpoints Meta.
   - Manter os callbacks exatos já cadastrados.

2. **Implantar a fila de render no worker existente**
   - Fazer deploy atômico do `backend/` atual na mesma VPS, preservando segredo, domínio e armazenamento.
   - Confirmar `features.batch_render=true` e testar criar, enviar, iniciar, acompanhar, cancelar e baixar um lote real.
   - Antes do deploy público, fechar a possibilidade de DNS rebinding/SSRF nos downloads por URL e aceitar somente origens autorizadas ou um IP validado e fixado na conexão.
   - Não criar outra VPS.
   - Expor na interface um diagnóstico claro quando a versão do worker não oferece fila de render.

3. **Alinhar CleanerIA à capacidade real**
   - Enquanto a VPS estiver em CPU, oferecer apenas o preset realmente disponível e identificá-lo como restauração clássica.
   - Para vender “ProPainter profissional”, instalar GPU/CUDA, pesos oficiais e licenciamento adequado; só então habilitar `quality`/`max` quando o health check confirmar prontidão.
   - Nunca fazer downgrade silencioso de ProPainter para fallback.

4. **Bloquear falsos sucessos sociais**
   - Garantir que provedores ainda não ativos retornem “não disponível”, nunca “publicado”.
   - Manter TikTok/YouTube desabilitados até OAuth, permissões e publicação real terem sido validados.

5. **Corrigir consistência imediata do processamento local**
   - Marcar o job como concluído em todos os caminhos de exportação bem-sucedidos, não apenas quando o pool de workers é usado.
   - Corrigir o pool local para usar o paralelismo suportado pela máquina sem ultrapassar limites seguros de memória.
   - Representar cancelamento como `cancelled`, e não como falha, em toda a cadeia do CleanerIA.

## Fase 2 — Pipeline persistente, retomável e observável (P0/P1)

1. Tornar a fila em nuvem a opção recomendada para lotes; o processamento local fica como modo rápido/compatibilidade.
2. Implementar upload retomável por partes, com retry exponencial, checksum e idempotência por item; um arquivo falho não reinicia todo o lote.
3. Persistir estados e eventos de job: `uploading`, `queued`, `processing`, `completed`, `failed`, `cancelled`, fase, progresso, heartbeat, tentativa e erro estruturado.
4. Adicionar lease/heartbeat e watchdog no worker para recuperar jobs abandonados após reinício.
5. Atualizar a interface por evento/callback com sequência monotônica para impedir que um callback atrasado faça um item pronto voltar a “processando”; usar polling apenas como contingência e permitir retomar lote ao reabrir o app.
6. Separar falhas de rede, arquivo inválido, capacidade ocupada, worker incompatível e falha do encoder, cada uma com ação apropriada.
7. Unificar ActivityDock, BatchProgressDock e fila da nuvem em uma central de atividades responsiva, sem sobreposição.
8. Registrar métricas operacionais: tempo de upload/fila/render, FPS, tamanho, encoder, retries, erros por etapa e versão do worker.
9. Substituir o consumidor único global da VPS por concorrência limitada e justa por usuário/lote, dimensionada pela CPU/GPU e memória disponíveis.

## Fase 3 — Render consistente entre preview, local e VPS (P1)

1. Definir um manifesto de render versionado contendo template, crop, keyframes, transições, legendas, branding, áudio e antiduplicidade.
2. Fazer o worker interpretar esse manifesto; hoje o FFmpeg da VPS apenas escala/padroniza o vídeo e não reproduz todo o resultado visual do editor.
3. Criar fixtures audiovisuais de referência para vertical/horizontal, áudio, B-frames, cortes, legendas, transições e variações.
4. Validar automaticamente duração, resolução, áudio presente, A/V sync, frames pretos/corrompidos e tolerância visual entre preview e export.
5. Manter WebCodecs como caminho local rápido, com fallback explícito e limite de tempo; arquivos incompatíveis devem migrar para a fila da VPS, não ficar em 0%.
6. Preservar áudio e timestamps no FFmpeg e adotar aceleração por hardware somente quando o worker confirmar suporte.

## Fase 4 — Biblioteca de resultados e continuidade do trabalho (P1)

1. Persistir cada arquivo final no storage privado com caminho, tamanho, hash, duração, origem, versão do template e lote.
2. Gerar URLs assinadas de curta duração para preview/download; o botão “Baixar” deixa de ser inativo.
3. Unificar resultados locais e de nuvem na Biblioteca, com filtros, preview, download individual/ZIP, reagendar, duplicar edição e excluir.
4. Definir retenção e quota por plano, com avisos antes da expiração e limpeza segura.
5. Ligar autosave de projeto ao lote e permitir “Continuar editando” sem depender de `blob:` URLs ou somente do navegador anterior.
6. Ao excluir conta ou atender uma solicitação de exclusão, remover também todos os objetos do storage do usuário, não apenas as linhas do banco e o login.

## Fase 5 — Contas sociais, Meta e agendamento real (P1)

1. **Meta externo, antes de alterar novamente o OAuth**
   - Publicar o app e testar no domínio publicado.
   - No painel da Meta, comparar o App ID com o `config_id`, confirmar que a configuração está publicada, app em modo Live ou usuário como tester, permissões aprovadas, domínio, ícone e dados básicos completos.
   - Se persistir, usar o diagnóstico do próprio Login for Business e registrar o código/trace retornado pela Meta.

2. **Fluxo de conexão no produto**
   - Manter uma única estratégia oficial para Instagram profissional + Páginas do Facebook e remover/arquivar o fluxo direto de Instagram que não é usado.
   - Após a autorização, mostrar as Páginas retornadas e permitir selecionar quais conectar; não salvar todas sem confirmação.
   - Exibir claramente Página, Instagram vinculado, permissões, validade/reautorização e última publicação.
   - Ao desconectar, revogar/invalidar credenciais quando suportado e remover dados relacionados com segurança.

3. **Publicação e agenda**
   - Adicionar validação de mídia por plataforma antes de agendar.
   - Tratar reautorização, rate limit, retry e falhas permanentes sem duplicar posts.
   - Implementar TikTok Content Posting e YouTube Data API somente após aprovação/configuração oficial, com testes reais e status retornado pelo provedor.
   - Manter seleção explícita da conta por postagem/lote e impedir postagem em conta pendente.

## Fase 6 — Performance, editor e UX (P1/P2)

1. Dividir `index.tsx` por ferramenta e carregar ClipStudio, VideoStudio, CleanerIAStudio e CleanupStudio sob demanda.
2. Isolar estado por estúdio e memorizar canvas/timeline para não rerenderizar o editor inteiro a cada alteração.
3. Mover waveform, miniaturas e análise pesada para workers/cache; mostrar progresso e cancelar cálculos obsoletos.
4. Pausar o loop de desenho do preview quando o vídeo estiver pausado e nada tiver mudado.
5. Adaptar o editor para desktop/tablet/mobile: painéis recolhíveis, timeline rolável, alvos de toque e sem sobreposição dos docks.
6. Usar a localização do roteador para navegação ativa; hoje algumas telas usam `window.location.pathname`.
7. Completar rótulos acessíveis, foco, teclado, contraste e estados de carregamento/erro.
8. Padronizar português, remover textos técnicos da interface e completar metadados únicos de todas as rotas.
9. Substituir mocks visíveis por estados honestos “indisponível/em preparação” até a implementação real.

## Testes e critérios de aceite

- Testes unitários para manifesto de render, transições, áudio, retries, estados da fila e erros por provedor.
- Testes de integração para upload interrompido/retomado, callback perdido, reinício do worker, cancelamento e expiração de download.
- Testes específicos de segurança para URL remota/DNS rebinding, callbacks fora de ordem, RBAC administrativo e exclusão integral de dados/storage.
- Testes E2E autenticados para: conectar conta, selecionar Página, importar pasta, gerar legendas, gerar cortes, editar, renderizar na VPS, fechar/reabrir, baixar e agendar.
- Matriz visual em 375×812, tablet e 1280×1800, sem sobreposição e sem texto cortado.
- Lote mínimo real com vídeo que contém áudio e B-frames: progresso deve sair de 0%, sobreviver ao fechamento do navegador e terminar com A/V sync validado.
- Nenhuma ação pode marcar “concluído/publicado” sem confirmação do worker ou provedor.
- Build sem erros, suíte existente preservada e novos testes cobrindo os caminhos críticos.

## Ordem de entrega recomendada

```text
Publicar app atual
    ↓
Implantar worker atual na VPS e validar fila
    ↓
Corrigir estados falsos + central de atividades
    ↓
Manifesto de render e Biblioteca persistente
    ↓
Meta: seleção de Páginas + publicação validada
    ↓
Performance/editor responsivo
    ↓
TikTok e YouTube oficiais
```

## Decisões técnicas

- Backend de dados/autenticação permanece no Lovable Cloud; a VPS fica responsável por mídia pesada.
- Segredos e tokens permanecem somente no servidor, cifrados, com links assinados e RLS por usuário.
- A fila deve ser idempotente e persistida; nada crítico dependerá de memória do navegador ou de um único processo da VPS.
- Deploy de VPS será atômico, com health check, rollback e validação externa antes de trocar o tráfego.
- Alterações de esquema serão feitas por migrações com grants e RLS; nenhuma tabela de usuário será tornada pública.
