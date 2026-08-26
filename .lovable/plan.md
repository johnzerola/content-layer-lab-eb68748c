# Biblioteca Viral sempre ativa no "Gerar clipes"

## Situação atual (verificada no código)

- A biblioteca já influencia o corte, **mas só quando o usuário escolhe um nicho manualmente**. O padrão é "automático" (`clipNiche = null`), e nesse caso `nicheContext(null)` devolve `null` — o gerador roda sem palavras-chave, sem pesos e sem duração do formato.
- O ganho de score por contexto só existe quando há transcrição (o boost lê o texto do trecho). Sem transcrição, a biblioteca não pesa em nada.
- A biblioteca guarda 7 nichos (lives, podcasts, filmes/séries, gameplay, notícias, humor, tutoriais) com gancho, tema, desfecho, duração ideal, palavras-chave, hashtags e pesos de etiqueta. O que ela **não** entrega hoje: título/gancho sugerido e hashtags no clipe gerado, e nenhuma justificativa de "por que este corte casou com o padrão X".

## O que será feito

1. **Detecção automática de nicho**
   Ao clicar em "Gerar clipes" no modo automático, o sistema classifica o vídeo pela transcrição (contagem ponderada das palavras-chave de cada nicho) e escolhe o nicho vencedor. Sem transcrição, usa duração + densidade de fala como heurística (vídeo longo e falado → podcast; curto e agitado → live/humor). Nunca mais roda "sem contexto".

2. **Contexto aplicado sempre**
   O nicho detectado (ou escolhido) passa palavras-chave, pesos de etiqueta e faixa de duração recomendada ao motor. A duração do formato só entra quando o usuário está no preset "Automático" — se ele fixou 30-60s, a escolha dele manda.

3. **Boost também sem transcrição**
   Os pesos de etiqueta do nicho passam a valer sempre (gancho, pico, reação, fala contínua), não apenas quando existe texto.

4. **Padrão casado por clipe**
   Cada clipe recebe o padrão da biblioteca mais próximo: título/gancho sugerido, hashtags do nicho e uma linha de explicação ("casou com padrão de podcast: opinião forte + desfecho"). Isso aparece no card do clipe e alimenta a legenda/caption sugerida no agendamento.

5. **Transparência na UI**
   No CorteIA, o chip "automático" mostra o nicho detectado depois da análise ("automático · Podcasts & entrevistas"), com opção de trocar e regerar.

## Detalhes técnicos

- `src/lib/viral-library.ts`: novas funções `detectNiche(sentences, meta)` e `matchPattern(clip, ctx)`; `nicheContext` ganha fallback controlado.
- `src/lib/clips.ts`: aplicar `contextTagWeights` independentemente da transcrição; anexar `pattern` (hook, hashtags, motivo) ao clipe retornado.
- `src/routes/index.tsx`: no `autoClip`, detectar nicho antes de `findClips`, guardar em `clipNiche` para exibição, e usar a faixa de duração do nicho apenas no preset automático.
- `src/components/ClipStudio.tsx` / `ViralLibrary.tsx`: exibir o nicho detectado e o padrão casado por clipe.

Sem mudanças de banco de dados.
