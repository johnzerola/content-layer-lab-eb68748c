# Acabamento leve de legendas ? 10/09/2026

Implementa??o experimental integrada ao ProPainter por cena. Ativa??o expl?cita
por `CLEANER_SUBTITLE_FINISH=1`; padr?o desligado at? comprovar ganho visual.
N?o altera a revis?o operacional v3 nem requer outra infer?ncia GPU.

## Implementado

- Recupera??o leve de detalhe de lumin?ncia de quadros originais da mesma cena,
  com alinhamento ORB/RANSAC e verifica??o local de visibilidade/apar?ncia.
  Exclus?o das m?scaras doadoras com margem; rejei??o quando falta confian?a.
- Acabamento de cor/bordas e nitidez limitado por evid?ncia e intensidade.
  Corre??o de acabamento limitada a tr?s n?veis por canal; detalhe a quatro.
- Suaviza??o temporal dos par?metros de acabamento, com reset nas cenas,
  m?scaras vazias e evid?ncia incompat?vel. N?o mistura pixels de quadros
  desalinhados; n?o adiciona gr?o aleat?rio. A aceita??o de detalhe ? por quadro,
  portanto ainda exige avalia??o em movimento para detectar oscila??o.
- At? oito recortes doadores em mem?ria, at? quatro comparados por quadro.
  Sequ?ncias incompletas falham; sa?da intermedi?ria RGB sem perdas ? at?mica.
  ?udio ? recuperado do original na montagem. Intermedi?rios inclu?dos na limpeza.

## Compara??o reproduz?vel

`python backend/scripts/validate_subtitle_finish.py V3_DIRECTORY NEW_OUTPUT`

Artefato: `G:/dowloand/teste/resultado-acabamento-v4-20260910/comparison.html`.
Usa os mesmos quadros/modelo da v3, sem executar GPU, e verifica os checksums
anteriores e igualdade de todos os pixels decodificados dos inputs por cena.
Nenhum arquivo aprovado foi sobrescrito.

147 quadros, 4,9 s, 1080?1920, 30 FPS, ?udio presente. Decodifica??o final integral
sem erro. SHA256: `79d082c2909581b59b2255c8e2d9e535a2cd6b15c2c2b419b29f5cf4a8457ea3`.
O wrapper levou 44,239 s localmente incluindo montagem, exporta??o e verifica??o;
n?o ? medi??o de infer?ncia nem custo por v?deo na RunPod.

O acabamento de apar?ncia mudou um quadro da primeira cena em no m?ximo um
n?vel por canal. Recupera??o de detalhe mudou dois quadros da terceira cena,
no m?ximo quatro n?veis. A segunda cena n?o recebeu corre??o aceita.

Revis?o visual amostrada: quadros 4,73,90,120,141,144. A emenda da janela e a faixa
lisa no tecido continuam. **N?o foi demonstrada melhora visual significativa.**
N?o h? novo percentual de qualidade nem equival?ncia Vmake comprovada. A origem
Vmake n?o entrou no processamento. Os relat?rios JSON discriminam cada aceita??o.

## Decis?o de entrega

Preservar as rotinas e compara??o como experimento opt-in. N?o ativar por padr?o
nem redeployar infraestrutura com processamento extra sem benef?cio demonstrado.
Nenhum recurso RunPod foi iniciado nesta etapa; publica??o p?blica do site continua
pendente conforme RUNPOD-DIAGNOSTICO-20260910.md.

Para melhorar o tecido de forma evidente ser? necess?rio validar refer?ncias com
movimento local mais flex?vel ou uma reconstru??o alternativa. Afrouxar os crit?rios
atuais apenas para alterar mais pixels n?o constitui melhoria comprovada.

Valida??o: su?te backend com 186 testes passando e 1 ignorado; o teste adicional
de integra??o foi executado depois, junto dos cinco testes do wrapper (6 passaram).
