# Ferramentas de design

## Instalado em 2026-09-09

| Recurso | Escopo | Função |
| --- | --- | --- |
| Impeccable | `.agents/skills/impeccable` | Direção visual e revisão de interfaces |
| VaiViral product design | `.agents/skills/vaiviral-product-design` | Contexto e critérios do produto |
| Playwright skill | Instalação pessoal do Codex | Automação de navegador por CLI |
| Screenshot skill | Instalação pessoal do Codex | Capturas de tela quando necessárias |
| Playwright MCP 0.0.80 | `.codex/config.toml` | Testes de interação e snapshots acessíveis |
| Chrome DevTools MCP 1.9.0 | `.codex/config.toml` | Console, rede e análise de desempenho |

A skill web-perf já estava disponível neste ambiente. Figma não foi conectado;
depende de uma integração específica caso o trabalho utilize arquivos do Figma.

## Origem e manutenção

- Impeccable: https://github.com/pbakaus/impeccable — commit
  `cd12f8660e2dde57b9615c8a6b8ea674101f9cfc`, diretório `.agents/skills/impeccable`.
  Licença do upstream preservada no diretório da skill.
- Skills Playwright e Screenshot: https://github.com/openai/skills — commit
  `49f948faa9258a0c61caceaf225e179651397431`, diretórios `skills/.curated/playwright`
  e `skills/.curated/screenshot`. A instalação pessoal não acompanha um clone do repo.
- MCPs: https://github.com/microsoft/playwright-mcp e
  https://github.com/ChromeDevTools/chrome-devtools-mcp.

Versões fixadas evitam alterações imprevistas durante uma tarefa. Para atualizar,
revisar release, licença e instruções; atualizar a versão e repetir o teste de conexão.
Não foi criado atualizador automático nem tarefa em segundo plano. O launcher do
Impeccable pode baixar seu motor na primeira execução e verifica o checksum.

## Ativação e privacidade

Abrir uma nova sessão do Codex no projeto confiável para descobrir as novas skills
e MCPs; se necessário, reiniciar a extensão. Conferir com `codex mcp list`.
A configuração usa `cmd`/`npx` no Windows e Node.js com suporte a `--use-system-ca`.
Não desabilita validação TLS. Em outra plataforma, adaptar o launcher de comando.

Os navegadores são headless e isolados, sem reaproveitar cookies pessoais. A coleta
de estatísticas e a integração CrUX do Chrome DevTools foram desativadas. Não colocar
chaves, tokens, `.env.local`, vídeos privados ou capturas sensíveis no Git.
Os MCPs são ferramentas de desenvolvimento, não dependências enviadas ao navegador
do usuário final. Configurá-los não altera nem publica o site.

Teste local de handshake e abertura de navegador: `python scripts/test-design-mcp.py`.
Esse teste não faz upload de mídia, não inicia GPU e não testa a aplicação inteira.

Validação local em 2026-09-09: os dois MCPs passaram no handshake e na abertura de
navegador isolado (Playwright: 24 ferramentas; Chrome DevTools: 29). Playwright
também gerou um snapshot de `about:blank`. `codex mcp list` reconheceu os dois
servidores habilitados. A skill VaiViral passou no validador de skills.
Nenhuma alteração visual ou publicação foi realizada nesta etapa de configuração.
