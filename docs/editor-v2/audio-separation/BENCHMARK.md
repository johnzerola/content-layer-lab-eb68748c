# Pesquisa, seleção e benchmark de diálogo/música

13/09/2026. **Nenhum vencedor medido neste pacote.** O objetivo é escolher o menor pipeline que preserve conversa e remova acompanhamento com qualidade e latência aceitáveis. “Mais moderno”, stars e SDR publicado em músicas não elegem o modelo do VaiViral.

## 1. Shortlist revisada e fontes primárias

| Candidato | Evidência pública e adequação | Decisão para este projeto |
|---|---|---|
| [Demucs oficial](https://github.com/facebookresearch/demucs) | Repositório arquivado em 01/01/2025; código MIT. É a família integrada atualmente | `htdemucs` é controle; `htdemucs_ft` é segundo braço. Registrar pesos além do pacote |
| [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator) | Wrapper MIT, Python/CLI, famílias MDX/MDXC/Demucs/RoFormer e execução CPU/CUDA. Documenta cache, parâmetros de normalização e seleção de precisão | Primeira opção para adapter experimental musical. Congelar versão; testar dependências e amplitude, sem copiar defaults cegamente |
| [BS-RoFormer](https://github.com/lucidrains/BS-RoFormer) e [Mel-Band RoFormer](https://arxiv.org/abs/2310.01809) | Código da implementação consultada MIT; pesquisa de separação musical por bandas/tempo | Selecionar **um** checkpoint vocal BS ou MelBand após licença/proveniência. Não presumir que vocal significa diálogo sem canto |
| [UVR](https://github.com/Anjok07/ultimatevocalremovergui) e [catálogo MSST](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md) | Fontes de arquiteturas e checkpoints, incluindo MDX/MDX23C. Catálogo é índice, não licença universal dos pesos | Selecionar **um** MDX/MDX23C com artefatos verificáveis. Não incorporar GUI nem baixar catálogo inteiro |
| [BandIt original](https://github.com/kwatcharasupat/bandit) | Separa diálogo, música e efeitos; código Apache-2.0. Publica inferência/configs e benchmark de recursos em trecho curto | Acrescentar triagem de candidato CASS, mais aderente semanticamente. Resultados publicados em outro hardware não viram ETA Hostear |
| [Landing dos autores](https://github.com/kwatcharasupat/source-separation-landing) e [BANDA](https://github.com/kwatcharasupat/banda) | Landing aponta unificação alpha. BANDA declara AGPLv3 para pesquisa acadêmica/não comercial e licença comercial para demais usos | Não tratar BandIt original, v2/BANDA e wrappers como licença única. BANDA não entra automaticamente no produto fechado; exigir revisão dos termos exatos |
| [Facing the Music](https://arxiv.org/abs/2408.03588) | Pesquisa CASS distingue diálogo, instrumental, canto e efeitos | Motiva cenário de canto sob conversa. Publicação não prova checkpoint comercial pronto para o nosso runtime |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | Código MIT ou Apache-2.0; melhoria de fala/supressão de ruído full-band 48 kHz | Acabamento opcional depois de escolher separador. Testar taxa, latência e preservação; não usar como substituto de separação musical |
| [ClearerVoice-Studio](https://github.com/modelscope/ClearerVoice-Studio) | Toolkit Apache-2.0 com enhancement, separação e extração de falante-alvo | Backlog. Não dividir pessoas nem privilegiar um falante na função padrão |

A recomendação de BandIt é **inferência de adequação à tarefa**, não ranking de qualidade. O download/licença individual dos checkpoints BandIt não foi concluído nesta auditoria: a página de pesos indicada pelo projeto não pôde ser recuperada na consulta. Marcar `WEIGHTS_LICENSE_UNVERIFIED`; isso não impede trabalho de contratos/UI, mas impede promoção desse checkpoint.

AUD-03 congelou pacote, configuração e peso do B0 `htdemucs` no registry e executou um smoke CPU isolado. Também congelou B2 MelBand-RoFormer e executou smokes CUDA no RTX 2060 em runtime separado. B1 e B3 ainda não têm todos os SHAs/licenças e permanecem bloqueados; não preencher campos faltantes com nomes presumidos. A compatibilidade de implantação na Hostear continua por testar. Nenhum pacote novo entrou no ambiente de produção.

## 2. Registro de candidatos antes de executar

Criar em AUD-03 um `model-registry.json` com entradas imutáveis contendo:

```text
id / family / expected_native_stems / expected_semantics
code_repository / code_commit / package_version / lockfile_hash
checkpoint_url / checkpoint_sha256 / config_url / config_sha256
code_license / weights_license / license_evidence_path
commercial_use_status / redistribution_status / attribution
known_training_datasets / dataset_terms / provenance_unknowns
device / effective_precision / sample_rate / channels_policy
chunk_length / overlap / context / batch_size / shifts
normalization_policy / output_scale / postprocess_version
runtime_image_digest / supported_platforms / preflight_result
```

Valores desconhecidos ficam explícitos. Origem documentada não equivale a aprovação comercial. Licença do wrapper não substitui licença de pesos, datasets ou dependências. Checkpoint pickle/torch é artefato executável potencial: somente origem confiável/hash congelado, ambiente isolado sem credenciais de produção, rede e permissões mínimas. Desabilitar download por job após preflight, verificar cache efetivo do Torch/ONNX/modelo — não assumir que `HF_HOME` controla todos.

Política de seleção: primeiro checkpoint cuja licença permite o uso pretendido, config/pesos correspondem, a semântica é adequada e o smoke passa no orçamento de memória; se houver dois equivalentes, escolher o documentado/reproduzível de menor custo. Se nenhum for elegível, registrar bloqueio de licença/runtime e manter baseline. Não introduzir dez candidatos para contornar uma decisão difícil.

## 3. Braços e sequência econômica

| Braço | Configuração | Papel |
|---|---|---|
| B0 | `htdemucs`, CPU, shifts=0, segment=7, overlap=0.25, saída float32 | Controle correspondente ao default de código auditado; revalidar configuração efetiva |
| B1 | `htdemucs_ft`, CPU, shifts=1, segment=7, overlap=0.5, saída float32 | Perfil quality de código; custo maior precisa ser medido |
| B2 | Um BS-RoFormer **ou** MelBand-RoFormer com receita congelada | Candidato musical |
| B3 | Um MDX **ou** MDX23C com receita congelada | Candidato complementar |
| B4 condicional | Um BandIt/CASS elegível | Candidato orientado a diálogo; só executar após licença/runtime |
| H histórico | Ensemble Demucs + `mdx_extra` e limpeza global, isoladamente identificados | Ablação se houver evidência reaproveitável; não vencedor presumido |

B0/B1 não são comparação causal apenas de pesos porque shifts/overlap diferem. Se a pergunta for causal, criar ablação separada com parâmetros comuns; para o produto, comparar a receita completa de cada candidato. Não usar `--device auto` no ensaio CPU nem comparar GPU quente com CPU fria como se fosse efeito de modelo.

Ordem: controles sem modelo → B0 curto → candidatos curtos sequenciais → eliminar inválidos → conjunto de desenvolvimento → congelar receita → validação → holdout. Limitar a duas correções por adapter diante de erro identificado; não ajustar parâmetros indefinidamente ao ouvir o caso de teste.

Sem GPU paga nesta sequência. Se um modelo não cabe/é lento na Hostear, registrar resultado e manter fora do perfil inicial. Uma futura comparação remota exige contrato separado com teto concreto, duração, stop condition e verificação de encerramento/remoção dos recursos ao final.

## 4. Fixtures verdadeiras

Não reutilizar rótulos `voice-high-music-low` do validador antigo como evidência de mistura de entrada. Os ganhos precisam ser aplicados **antes** de executar o modelo.

Conjunto proposto, a congelar em AUD-00:

- Oito pares independentes de fala limpa + música autorizada, trechos de 12–20 s: quatro para desenvolvimento, dois para validação, dois reservados para holdout. Pessoas, gravações e músicas de holdout diferentes; outras proporções da mesma fonte não são holdout.
- Seis relações diálogo/música por par: **-15, -10, -5, 0, +5 e +10 dB**. Total: 48 misturas.
- Controles adicionais: somente fala, somente música instrumental, somente música com canto, silêncio digital, mono, estéreo com canais distintos/antifase, áudio 48 kHz, PTS deslocado, fala sobreposta, reverberação e compressão. Casos podem compartilhar categorias, mas devem ter manifest explícito.
- Pelo menos cinco trechos reais autorizados: entrevista, conversa com mais de duas pessoas, narração com trilha alta, canto sob diálogo e fala fraca/reverberante. Sem GT, não calcular SI-SDR fictício.

Um piloto usa somente três misturas de desenvolvimento (-15, 0 e +10 dB) e controles fala/música/silêncio. Não processar 48 entradas com cinco modelos antes de provar que decodificação e stems estão corretos. Se faltarem fontes autorizadas, o resultado é `FIXTURES_REQUIRED`; sinais sintéticos validam engenharia, não qualidade humana.

Para uma relação alvo r em dB, calcular RMS da fala e da música nas mesmas regiões de fala anotadas, sem incluir longos silêncios que distorçam o nível. Com fala d e música m:

```text
gain_music = RMS(d) / (RMS(m) * 10^(r/20))
mixed = common_gain * (d + gain_music * m)
GT_dialogue = common_gain * d
GT_background = common_gain * gain_music * m
```

Escolher `common_gain` para evitar clipping sem alterar a relação. Registrar RMS, picos, loudness descritivo, masks de fala, ambos os ganhos e hashes. No teste com ambiente/SFX, adicionar terceira fonte conhecida e documentar sua alocação. Reverb da fala pertence ao GT de diálogo na receita que o aplica. Preservar um master float; MP3/AAC são cópias de teste, não novo GT.

Não reamostrar/normalizar GT de forma diferente para cada modelo. Para receitas em taxas distintas, mapear ambas as saídas à taxa de avaliação com o mesmo resampler declarado. Preservar saída bruta anterior a compensações.

## 5. Métricas que respondem à pergunta certa

| Pergunta | Medida e limite de interpretação |
|---|---|
| A fala foi recuperada? | SI-SDRi do diálogo contra GT, por trecho e falante; WER/CER de transcrição fixa como auxiliar, conferência humana da frase |
| Ficou música sob a fala? | Energia interferente estimada contra música GT nas regiões de fala, além de escuta; projeção é proxy e exige fontes identificáveis |
| A fala vazou para o fundo? | Mesma avaliação no stem de background e escuta de consoantes/palavras |
| Houve “voz metálica”, pumping ou sílabas apagadas? | Escuta cega sincronizada, notas por timestamp; métricas de energia não bastam |
| A soma é correta? | Erro relativo entre original e soma, ganho/polaridade/latência/canais; não prova separação semântica |
| O tempo está correto? | Número de samples, atraso inicial e final, PTS, taxa/canais. Não alinhar por busca irrestrita para esconder drift |
| Quanto custa? | Tempo total e por etapa, RTF=segundos de execução/segundos de áudio, pico RSS/VRAM, disco, cold/warm, falhas/cancelamentos |

SI-SDR em GT silencioso não é definido: registrar null com motivo e medir energia residual. Para vazamento em mistura com fontes altamente correlacionadas, registrar a condição numérica da projeção e tratar a estimativa como inconclusiva quando necessário. Correlação global voice/music sozinha não identifica vazamento; subtrair um stem do outro também pode remover fala.

Conservar dois caminhos: diagnóstico bruto, sem compensação; avaliação com apenas atraso fixo de resampler/engine previamente medido e declarado. Proibir alinhamento elástico e normalização independente que façam a saída ruim parecer alinhada/inteligível.

## 6. Gates a congelar antes dos candidatos

Os números seguintes são **limites de aceitação propostos**, não resultados alcançados nem padrão universal. AUD-00 testa se são calculáveis/reproduzíveis no controle, documenta ajustes justificados e os congela antes de ver B2–B4. Não relaxar um limite depois de conhecer o holdout.

| Gate | Critério inicial |
|---|---|
| G0 — engenharia | Dois arquivos decodificáveis, PCM finito, sem troca de canais/roles, duração exata após compensação documentada; discrepância máxima de 1 sample na taxa canônica |
| G1 — segurança da fala | Nenhum falante inteiro, frase ou sílaba essencial desaparece nos casos críticos revisados; falha grave em qualquer caso reprova essa classe |
| G2 — qualidade relativa | Mediana SI-SDRi de diálogo pelo menos 1 dB acima de B0 no conjunto com GT; nenhum caso crítico perde mais de 1 dB contra B0; listar resultados individuais |
| G3 — controle fala pura | Sem alteração audível importante de timbre/inteligibilidade; WER não pode aumentar mais de 2 pontos percentuais absolutos no agregado com transcrição confiável; WER não substitui G1 |
| G4 — diálogo isolado | Escuta de todos os críticos sem música perceptível no trecho de diálogo para reivindicar esse resultado; quando restar música, declarar limitação e não promover a promessa dessa classe |
| G5 — background isolado | Ausência de conversa inteligível na escuta do stem musical; avaliar canto separadamente da conversa |
| G6 — mix e amplitude | Soma sem ganho oculto/normalização independente, drift ou clipping introduzido; medir erro de reconstrução. Se houver projeção de consistência, congelar tolerância e testar preservação separadamente |
| G7 — recursos | Nenhum OOM, timeout ou processo órfão; pico de memória dentro do limite reservado do worker. Meta exploratória Hostear: RTF quente ≤3, a validar contra capacidade real |
| G8 — produto | Solo/mute/delete/save/load/export reais passam testes de CONTRACTS; resultado só em memória não basta |

G2 sozinho não aprova modelo; requer gates técnicos, G1, escuta e licenças. Ganho grande de média não compensa falha grave numa conversa. Se todos falharem G4 em música +15 dB, classificar a limitação honestamente; não chamar o modo de “voz limpa perfeita”. É possível entregar redução útil com escopo explícito e original recuperável, após aprovação dessa proposta de produto.

Para escuta: IDs cegos aleatórios, trechos sincronizados, headphones e alto-falante comum. Registrar preferência, inteligibilidade, vazamento, artefatos e confiança da avaliação. Dois revisores quando disponíveis, incluindo revisão do usuário; ausência de revisão humana deixa gate `PENDING`, nunca aprovado por métricas. Não normalizar stems independentemente na evidência principal. A/B com loudness equiparado pode existir como ensaio adicional identificado.

## 7. Testes do harness antes de confiar nos scores

- Separador-oráculo recebe GT e deve passar; passthrough da mistura deve falhar vazamento; stems trocados devem falhar identificação.
- Stem de diálogo zerado deve falhar preservação, ainda que não haja música nele.
- Adicionar 10% de música conhecida ao GT de diálogo deve piorar o indicador de vazamento.
- Atraso fixo, sample rate rotulado incorretamente, ganho 2×, canal trocado e drift progressivo devem ser detectados.
- Caso musical silencioso e caso speech silencioso devem retornar métricas apropriadas, sem NaN transformado em sucesso.
- Mistura perfeita por soma com vazamento cruzado deve falhar gate semântico, mesmo passando consistência.
- Mocks cobrem rede/contrato; somente execução com pesos reais cobre inferência. Marcar isso no relatório.

## 8. Ensemble e acabamento: só depois

Só abrir ensaio de ensemble se os dois melhores modelos apresentarem erros complementares identificados nos mesmos trechos e um modelo único não cumprir o alvo. Congelar antes o estimador de confiança; confiança não sai automaticamente do modelo nem de VAD.

Combinação temporal/espectral exige latência/fase/gain alinhados, transições suaves e estudo de consistência. GT serve para avaliar, nunca para escolher pesos em produção. Comparar seleção por trecho, ensemble e melhor modelo único com custo total. A média 50/50 atual continua apenas controle. Se não há melhoria reprodutível, parar e manter modelo único.

DeepFilterNet ou outro denoiser gera `dialogue-enhanced` versionado com receita/taxa próprias. Avaliar depois de separar, sem trocar o stem bruto. Não usar VAD para zerar automaticamente início/fim de palavras, respiração ou fala baixa. Silêncio detectado é indício; máscara agressiva pode fabricar um score de vazamento melhor destruindo o conteúdo.

## 9. Operação e artefatos do ensaio

Cada execução arquiva manifest de entrada/receita, logs completos privados, versões, hash dos WAV, saída bruta, métricas JSON, tabela por cenário, tempo, pico de memória, falhas e decisão `PASS / RETEST / REJECT / INCONCLUSIVE`. Nunca substituir evidência anterior.

Medir separadamente extração, upload, fila, cold start/download, inferência, validação, armazenamento e download. Um vídeo de 10 s não prova comportamento de 30 min. Não extrapolar RTF em poucos casos como P95/SLA.

Na Hostear, registrar CPU, RAM reservada, uso de outros serviços, espaço/throughput de disco e throttling do container; variar threads uma vez por hipótese. Cache de pesos e modelo residente são otimizações posteriores com teste de liberação de RAM/cancelamento. Não carregar dois modelos residentes numa máquina limitada sem medição.

Tamanho PCM float32 estéreo a 44.100 Hz: aproximadamente 20,2 MiB/min por stream. Input + dois stems dão cerca de 60,6 MiB/min, antes de buffers/modelo/cache. A extração completa de um vídeo longo deve usar leitura em blocos; desenhar waveform não justifica carregar horas de PCM na RAM do navegador.

Custos: relatar tempo CPU/RAM/disco e custo marginal/infraestrutura alocada conforme dados reais. CPU já contratada não significa custo total zero. `cost_per_successful_audio_minute` inclui falhas e overhead; não misturar custo de desenvolvimento com inferência. Preços ou orçamento remoto não foram estimados nesta entrega.
