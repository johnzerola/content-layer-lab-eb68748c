# Editor V2 — pesquisa open source e expansão com IA

Data: 13/09/2026

Estado: **RESEARCH_COMPLETE — AUDIO_BENCHMARK_REQUIRED**

**Complemento de auditoria e execução, 13/09/2026:** consultar o [pacote de áudio V2](../editor-v2/audio-separation/README.md) antes de implementar. Ele distingue o serviço antigo da integração V2 ainda ausente, corrige a descrição de fila (hoje lock em memória e 429, sem fila durável), exige misturas difíceis antes da inferência e inclui triagem de BandIt/CASS com licenças separadas da linha BANDA/v2. A arquitetura de ensemble abaixo é hipótese histórica, não etapa obrigatória ou modelo aprovado. A seleção atual começa por um modelo único; exportação deve usar a mesma versão ouvida na prévia.

## Decisão principal

A prioridade deve ser um pipeline confiável de `diálogo + música`, preservando todas as pessoas que falam no stem de diálogo. O VaiViral já possui upload autenticado, fila, cancelamento, arquivos WAV, duas trilhas no editor e mix com mute/solo. A troca mais eficiente é manter esse contrato e substituir o adaptador interno de inferência após benchmark.

Não é recomendável ampliar primeiro stickers ou efeitos de IA enquanto o stem de voz ainda contém música. A separação afeta legendas, cortes de silêncio, transcrição, ducking, clareza e exportação.

## Auditoria do estado atual

O backend em `backend/app/audio_separation.py` executa Demucs 4.1 em CPU, limitado a um job por vez e a 180 segundos. O perfil rápido usa `htdemucs`; o de qualidade usa `htdemucs_ft`. A opção chamada ensemble executa `mdx_extra` pelo próprio pacote Demucs e combina os WAV por média aritmética.

Limitações observadas:

1. Demucs é um separador musical geral e seu repositório oficial está sem manutenção ativa.
2. Não há RoFormer real no worker atual.
3. A média 50/50 entre modelos não considera confiança por tempo/frequência; pode somar vazamento de um modelo ao resultado melhor do outro.
4. `suppressMusicBleed` faz uma projeção global do stem de voz sobre o stem musical no navegador. Ela só reduz vazamento correlacionado e pode remover partes da fala quando música e voz compartilham energia.
5. O worker declara sempre `device=cpu`; o perfil de qualidade pode ficar lento e impedir concorrência.
6. Os testes confirmam autenticação, duração, formato, estados, mute e download. Eles não medem SI-SDR, inteligibilidade, vazamento, artefatos ou preferência humana.
7. Não existem fixtures congeladas representando diálogo baixo com música alta, diálogo alto com música baixa, duas pessoas, canto, efeitos sonoros, reverberação e música sem fala.

## Candidatos para a separação de diálogo e música

| Projeto | O que oferece | Adequação ao VaiViral | Licença observada | Decisão |
|---|---|---|---|---|
| [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) | API/CLI única para MDX, VR, Demucs, MDXC e RoFormer; modelos baixados por nome; CPU e CUDA | Melhor adapter para testar modelos sem reescrever o serviço. Mantém dois stems e permite trocar o motor por configuração | Código MIT; pesos precisam de registro individual | **P0 — protótipo isolado** |
| [BS-RoFormer / MelBand-RoFormer](https://github.com/lucidrains/BS-RoFormer) | Separação no espectrograma com atenção entre bandas e tempo | Forte candidato ao perfil de qualidade para `vocals/instrumental`; precisa de GPU/tempo e pesos comerciais verificados | Código MIT no repositório; licença/proveniência de cada checkpoint precisa ser registrada | **P0 — benchmark** |
| [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui) | Catálogo de MDX, VR e Demucs, ensembles e parâmetros maduros | Referência de modelos e de UX. Não incorporar a GUI; usar o catálogo para selecionar poucos candidatos | Código MIT; pesos heterogêneos | **P1 — referência e seleção** |
| [Demucs](https://github.com/facebookresearch/demucs) | `htdemucs`, `htdemucs_ft` e modelos MDX | Baseline já integrado. Útil como controle e fallback, sem justificar nova evolução exclusiva | MIT; projeto sem manutenção ativa | **KEEP como baseline** |
| [AudioSep](https://github.com/Audio-AGI/AudioSep) | Separação por consulta textual como “human speech” ou “background music” | Interessante para sons abertos, aplausos e ruído; stack maior, áudio a 32 kHz e menor previsibilidade para o caso central | MIT; checkpoint/datasets precisam de revisão | **P2 — pesquisa, fora do caminho principal** |
| [ClearerVoice-Studio](https://github.com/modelscope/ClearerVoice-Studio) | Denoise, speech enhancement, separação entre falantes e extração audiovisual do falante alvo | Bom depois da separação para voz ruidosa ou, futuramente, isolar uma pessoa específica. Separação entre falantes não deve dividir a conversa por padrão | Apache-2.0; revisar pesos e componentes incluídos | **P1 — acabamento/experimento** |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | Supressão de ruído full-band de baixa complexidade | Bom acabamento opcional após obter o stem de diálogo; não substitui a separação de música | MIT ou Apache-2.0 | **P1 — acabamento leve** |
| [Resemble Enhance](https://github.com/resemble-ai/resemble-enhance) | Denoise e restauração perceptual de voz em 44,1 kHz | Pode recuperar presença da fala, mas pode alterar identidade/timbre e exige benchmark próprio | Verificação específica de código e pesos obrigatória antes de produto | **P2 — somente laboratório** |

## Arquitetura de áudio proposta

```text
vídeo original
  -> FFmpeg: WAV float32 estéreo 44,1 kHz
  -> detector de regiões com fala
  -> candidato A: RoFormer vocals/instrumental
  -> candidato B: MDX23C ou MDX vocal
  -> seletor/fusão por máscara e confiança
  -> consistência da mistura: diálogo + música ≈ original
  -> acabamento opcional do diálogo, limitado às regiões de fala
  -> voice.wav + music.wav + relatório de qualidade
  -> assets versionados do Editor V2
```

O primeiro benchmark deve comparar um único RoFormer e um único MDX contra `htdemucs` e `htdemucs_ft`. Não iniciar com cinco modelos ou ensembles grandes. O adapter `python-audio-separator` permite manter o contrato HTTP atual e trocar somente a função que produz os stems.

A fusão deve ser feita por blocos tempo/frequência usando confiança e atividade de fala. A música detectada entre frases pode ser removida agressivamente do stem de diálogo; durante a fala, o gate deve ser conservador para preservar consoantes, respiração e reverberação. A soma reconstruída deve permanecer próxima do original para evitar energia perdida ou duplicada.

## Benchmark obrigatório do áudio

### Conjunto mínimo

- diálogo a -15, -10, -5, 0 e +5 dB em relação à música;
- voz masculina e feminina;
- duas ou mais pessoas conversando;
- música instrumental, música com canto e música com percussão forte;
- fala com reverberação, compressão e ruído ambiente;
- trechos só de música e só de fala;
- arquivos mono e estéreo;
- pelo menos cinco casos reais licenciados fora das misturas sintéticas.

### Gates

- SI-SDRi/SDR dos dois stems quando houver ground truth;
- vazamento musical no diálogo durante fala e entre frases;
- perda de fala no stem musical;
- inteligibilidade e alteração de timbre;
- `voice + music` comparado ao original;
- duração, sample rate, canais, clipping e loudness;
- tempo, RAM, VRAM, cold start e custo por minuto entregue;
- escuta cega A/B em fones e alto-falante comum.

O teste precisa responder duas perguntas separadas: “silenciar música mantém toda a conversa?” e “silenciar diálogo mantém a música sem vozes?”. Para o produto, a primeira é o gate prioritário.

## UX recomendada para áudio

Depois do job, criar quatro estados de audição, sempre reversíveis:

- Original;
- Diálogo;
- Música e ambiente;
- Mix final.

Mostrar confiança e aviso somente quando necessário. O botão principal deve ser “Separar diálogo e música”. O usuário poderá silenciar a música e ouvir apenas a conversa, ajustar volume, aplicar ducking e restaurar o original. A timeline deve apresentar os dois stems alinhados e um comando único de undo/redo. Em baixa confiança, manter o original como fallback explícito e permitir comparar trechos críticos.

## Cortes automáticos, legendas e estrutura

| Projeto | Recurso aproveitável | Aplicação no V2 | Decisão |
|---|---|---|---|
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | Rótulos temporais, limiar em dB, margens, combinação de áudio e movimento, exportação de decisões | Evoluir o detector RMS atual para um mapa de decisão não destrutivo, com preview dos trechos removidos e padding ajustável | **P0 — portar o modelo de interação/contrato** |
| [WhisperX](https://github.com/m-bain/whisperX) | Transcrição alinhada por palavra e diarização | Legendas precisas, remoção de filler e pausas, seleção por falante e editor por texto | **P0 — benchmark de alinhamento** |
| [pyannote.audio](https://github.com/pyannote/pyannote-audio) | VAD, mudança de locutor, fala sobreposta e embeddings | Marcar pessoas na conversa e impedir cortes durante sobreposição | **P1 — revisar licença dos pipelines/pesos** |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | Detecção de cortes e transições via Python/OpenCV | Snap em cenas, divisão automática, thumbnails e highlights por cena | **P1 — integração de baixo risco** |

O VaiViral já tem dois detectores RMS e remoção de silêncio no editor antigo. O melhor próximo passo é portar o resultado como comando V2 com três classes visíveis: manter, encurtar e remover. O usuário deve ouvir os cortes, alterar sensibilidade/margem e aplicar tudo atomicamente. A decisão deve combinar VAD/transcrição com RMS; música constante torna RMS puro inadequado.

## Remoção de fundo, tracking e reenquadramento

| Projeto | Recurso | Limite | Decisão |
|---|---|---|---|
| [SAM 2](https://github.com/facebookresearch/sam2) | Segmentação e propagação de objetos em vídeo a partir de clique/caixa | Máscara de objeto não é alpha matting perfeito para cabelo; requer worker e cache temporal | **P1 — objeto/máscara/tracking, Apache-2.0** |
| [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting) | Matting humano temporal, ONNX/TF.js/PyTorch e alta velocidade reportada | GPL-3.0 conflita com incorporação direta em produto proprietário; projeto antigo | **RESEARCH ONLY até decisão jurídica** |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Segmentação, face/pose e tracking multiplataforma | Qualidade e licença dos modelos precisam ser verificadas por tarefa | **P1 — protótipo local de reenquadramento** |
| [TalkNet-ASD](https://github.com/TaoRuijie/TalkNet-ASD) | Detecção audiovisual da pessoa que está falando | Pipeline pesado e generalização fora dos datasets precisa ser medida | **P2 — auto-reframe de conversas** |

Para vídeos de uma pessoa, MediaPipe ou um modelo compatível de matting pode alimentar reenquadramento vertical local. Para objetos arbitrários e tracking, SAM 2 é mais flexível. Remoção de fundo precisa de um alpha temporal com inspeção de cabelo, mãos, motion blur e oclusões; uma máscara binária visualmente aceitável em um frame não aprova vídeo.

## Padrões de arquitetura observados em editores

[OpenCut](https://github.com/OpenCut-app/OpenCut) está sendo reescrito com core compartilhado, API do editor, plugins, modo headless e render em lote. Os padrões úteis para o VaiViral são:

- documento independente de React/DOM;
- comandos serializáveis e desfazíveis;
- core de render acessível por UI e automação;
- plugins isolados por capacidade;
- projetos recuperáveis quando um asset falha;
- render headless para lotes.

O V2 já segue parte desse caminho com `EditorProjectV2`, command bus e manifest. Trocar o core por Rust agora aumentaria o risco sem resolver a prioridade de áudio. O ganho imediato vem de adapters tipados para análise de mídia e IA, cada um produzindo assets e metadados versionados.

## Recursos modernos recomendados

1. **Separar diálogo/música** com comparação A/B e confiança.
2. **Corte inteligente de pausas** usando stem de diálogo, VAD e palavras; nunca RMS do mix musical como única fonte.
3. **Editor por transcrição** com fillers, repetições, pausas e falantes agrupados.
4. **Legenda por falante** com cores e posicionamento estáveis.
5. **Auto-reframe por pessoa ativa** em podcasts e conversas.
6. **Detecção de cenas** para split, thumbnails e aplicação de transição.
7. **Remoção de fundo e tracking** com máscara editável e keyframes de correção.
8. **Ducking semântico**: música diminui somente quando há diálogo confiável.
9. **Melhoria de voz opcional** após a separação, com intensidade e comparação instantânea.
10. **Sugestões de highlights** baseadas em transcrição, energia, cena e duração, sempre apresentadas como propostas editáveis.

## Ordem de implementação

### A0 — verdade do áudio

Congelar fixtures e relatório de qualidade. Remover o pós-processamento global do navegador do caminho de aprovação; mantê-lo apenas como braço comparativo. Nenhuma mudança de modelo entra em produção sem stems arquivados.

### A1 — adapter multi-engine

Adicionar `python-audio-separator` em imagem experimental separada. Integrar um RoFormer e um MDX com nomes, hashes, configurações e licenças congelados. Não alterar o endpoint usado pela UI.

### A2 — benchmark e seleção

Executar os quatro braços: `htdemucs`, `htdemucs_ft`, RoFormer e MDX. Escolher um modelo principal. Testar fusão somente se os erros dos dois melhores forem complementares.

### A3 — integração V2

Produzir assets `voice` e `music` versionados, waveform, solo/mute, comparação com original, progresso por etapa e cancelamento. Validar preview e export.

### A4 — corte inteligente

Rodar VAD e transcrição sobre o stem de diálogo; gerar propostas de manter/encurtar/remover como comando de timeline. Testar que palavras não são cortadas.

### A5 — demais IA

PySceneDetect, auto-reframe, SAM 2 e acabamento de voz entram como jobs separados depois da aprovação do áudio.

## Licenças e exclusões iniciais

- registrar separadamente licença do código, configuração, pesos e datasets;
- não incorporar Robust Video Matting GPL-3.0 no produto fechado sem análise jurídica;
- não integrar Ultralytics/YOLO sob AGPL-3.0 sem licença comercial ou decisão de abertura compatível;
- não assumir que licença MIT do wrapper concede licença comercial a todos os pesos baixados;
- manter modelos e adapters desligáveis, com fallback para o original.

## Próximo experimento concreto

Criar uma imagem experimental do worker com `python-audio-separator`, sem publicar nem substituir Hostear. Selecionar exatamente um checkpoint RoFormer vocal e um MDX23C/MDX vocal após verificar seus arquivos de licença. Executar localmente as fixtures A0 e gerar relatório lado a lado com o Demucs atual. Somente o vencedor segue para um smoke no Hostear.
