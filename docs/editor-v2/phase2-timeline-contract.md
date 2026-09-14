# Editor V2 — contrato da timeline da Fase 2

## Estado compartilhado

A timeline lê e modifica `EditorProjectV2` exclusivamente por comandos. As operações de adicionar mídia, mover, aparar, dividir, duplicar, apagar e alterar controles de trilha são serializáveis e reversíveis. Seleção e relógio continuam compartilhados com o canvas e o inspector.

## Trilhas

O documento possui seis tipos visíveis:

- vídeo;
- sobreposições;
- legendas;
- voz;
- música;
- efeitos sonoros.

Vídeo pode ser movido entre vídeo e sobreposições. Texto, formas e imagens ficam em sobreposições; legendas ficam em legendas; áudio pode circular entre voz, música e efeitos sonoros. Destinos incompatíveis são recusados pelo comando e indicados durante o arraste.

Cada trilha expõe mute, visibilidade e bloqueio. O bloqueio impede move, trim, delete e duplicação de seus clipes. Visibilidade afeta imediatamente o canvas. O mix de áudio real pertence à Fase 5.

## Edição temporal

- o movimento horizontal respeita snapping quando ativo;
- o movimento vertical resolve a trilha pelo ponteiro;
- trim de início e fim preserva os limites de fonte;
- ripple desloca os clipes posteriores ao mover, aparar ou apagar;
- split usa o mesmo relógio de composição;
- seleção múltipla e duplicação são ações atômicas;
- cada mutação do documento entra uma única vez no histórico.

## Escala e desempenho

A timeline renderiza somente marcas e clipes dentro da janela horizontal visível, com overscan de dois segundos. O cabeçalho das trilhas permanece fixo durante a rolagem. O painel inferior e as colunas principais continuam redimensionáveis.

## Mídia local

Vídeo, imagem e áudio podem ser importados da máquina. O documento armazena apenas um identificador `local-session://`; os objetos `blob:` e posters ficam em estado transitório e são revogados ao desmontar o editor. Isso evita salvar base64 grande no projeto.

O upload persistente, proxies, waveform calculada, cache de mídia e exportação desses assets serão integrados nas Fases 5 e 6.
