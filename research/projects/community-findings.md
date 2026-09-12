# Issues, PRs e forks: achados iniciais

## ProPainter

[Issue 106](https://github.com/sczhou/ProPainter/issues/106) relata OOM mesmo com
subvideo_length pequeno. É relato de um ambiente específico, sem reprodução local.
A presença de tensores globais no script torna o mecanismo plausível; diminuir
apenas uma janela não garante limitar toda VRAM.

[PR 112](https://github.com/sczhou/ProPainter/pull/112) propõe manter frames em RAM
e processar chunks com sobreposição/blending. No estado consultado está aberta;
o autor reconhece limitações de validação e possível pressão de RAM. Não é correção
upstream estabelecida. Antes de testar, fixar SHA base/head, comparar costuras e
verificar se cada pixel e frame recebeu pesos de composição corretos.

[PR 104](https://github.com/sczhou/ProPainter/pull/104) divulga um projeto que alega
redução de VRAM por gerenciamento de residência de tensores. A porcentagem citada
pelo autor não foi reproduzida; exigir medição de pico, mesma resolução e saída.

O inventário também coletou amostra de forks, releases e PRs em
`evidence/propainter.json`. Listar um fork não significa tê-lo validado. A coleta
de diffs imutáveis dos PRs foi interrompida por limite da API GitHub; nenhuma
otimização foi promovida com base apenas no título.

## Outros componentes

As coletas dos nove primeiros projetos contêm amostras de issues/PRs e arquivos
relevantes. A triagem semântica por OOM, máscara, blur, CUDA e duração ainda deve
ser ampliada. VideoPainter e Cutie foram consultados por páginas públicas após
limite da API; cobertura menor está indicada nos respectivos cards.

## Critério para aceitar um fork

Fixar upstream e fork, ler diff funcional, manter avisos/licenças, executar os
mesmos casos e registrar qualidade, tempo, VRAM e RAM. Uma redução de memória que
altere resolução, duração ou cobertura da máscara não é comparação equivalente.
