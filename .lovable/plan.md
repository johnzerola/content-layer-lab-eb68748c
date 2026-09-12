# Galeria de fundos e validação completa do ChatScene

## Objetivo
Integrar a galeria pronta ao painel do ChatScene, garantindo troca imediata e prévia vertical 9:16 com o fundo animado atrás da conversa.

## Implementação
- Revisar o seletor de fundos para indicar claramente o item ativo e preservar loop, zoom, posição e desfoque no documento único do ChatScene.
- Garantir que a prévia 9:16 atualize o vídeo escolhido em tempo real e avance seus quadros pelo mesmo relógio da conversa.
- Manter a timeline ligada à duração real da fala, sem criar estado paralelo.

## Validação
- Abrir a demonstração, selecionar um fundo animado e confirmar visualmente a troca na cena.
- Gerar uma fala real para um personagem, reproduzir a cena e confirmar que voz, bolha, fundo e cursor da timeline avançam juntos.
- Rodar testes do ChatScene e verificar erros da aplicação.

## Fora de escopo
Sem alterações no Cleaner IA, Editor V1/V2, billing, clonagem de voz ou renderização em nuvem.
