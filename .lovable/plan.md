# Estilos visíveis e Estúdio direto no editor

## Objetivo
Corrigir definitivamente a aba de Estilos e adicionar uma tela de captura de câmera/microfone que cria um corte e abre o editor profissional, sem passar pelo ViralBatch.

## Implementação

### 1. Galeria de Estilos no editor
- Tornar **Estilos** uma ferramenta principal com painel completo no lado direito, em vez de apenas apontar para outra coluna.
- Exibir galeria visual de templates completos, paletas e tipografias mesmo quando o projeto ainda não possui camada de legenda.
- Ao aplicar qualquer estilo, criar automaticamente a camada de legenda quando necessário e aplicar, em um clique: cores, fonte, peso, preset, animação e transições.
- Melhorar estados selecionado/hover e prévias visuais, preservando os tokens e a identidade VaiViral.

### 2. Tela de Estúdio
- Criar a rota `/estudio` com metadados próprios e proteção de autenticação.
- Implementar prévia ao vivo de câmera e microfone, seleção de dispositivos, mute, contador, gravação, pausa/retomada, descarte e revisão da captura.
- Usar `MediaRecorder` no navegador, com fallback de formato suportado e encerramento correto das tracks.
- Após confirmar, registrar o arquivo capturado na sessão, criar o projeto no banco e navegar diretamente para `/projects/$projectId/editor/$videoId`.

### 3. Integração e navegação
- Adicionar “Estúdio” à área de criação da navegação principal.
- Manter o arquivo capturado disponível para prévia, transcrição, corte, áudio e renderização dentro do editor profissional.
- Não alterar ViralBatch, publicação, planos, créditos, contratos ou banco.

## Validação
- Verificar compilação e testes existentes.
- Validar no navegador: abrir Estilos, aplicar um template, acessar Estúdio, conceder/recusar permissões com estado claro e confirmar a navegação direta ao editor.
