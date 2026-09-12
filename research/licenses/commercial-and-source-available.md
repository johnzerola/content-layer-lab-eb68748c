# Registro comercial e source-available

Esta extensao da [matriz principal](matrix.md) separa uso de conhecimento de uso de codigo, modelo, pesos, dataset e API. Nao e aconselhamento juridico.

| Categoria | Estudo publico | Producao | Decisao |
|---|---|---|---|
| A — permissiva comercial | Sim, com avisos e auditoria de artefatos | Apos revisar cadeia | BUILD candidato |
| B — source-available + licenca comercial | Apenas nos direitos expressos | Compra/autorizacao | LICENSE candidato |
| C — pesquisa nao comercial | Se os termos permitirem | Nao sem nova permissao | RESEARCH |
| D — SDK/API comercial | Documentacao e contrato | Conforme contrato | BUY candidato |
| E — pesquisa proprietaria | Papers/patentes/talks publicos | Nao implica direito de uso | BUILD por principios |

| Projeto | Autor | Codigo / modelo / dados | Uso comercial | Caminho | Estado |
|---|---|---|---|---|---|
| DynaFill | Robot Learning Lab, Univ. Freiburg | Codigo e checkpoints GPLv3 para academico; dataset nao comercial | Autores pedem contato para uso comercial | Pagina oficial | C — estudar principios; nao incorporar |
| UPOCR | autores do paper | Paper e repositorio publico localizados; licenca do artefato exato nao arquivada | UNKNOWN | UNKNOWN | Nenhuma permissao inferida |
| Adobe CAF / Cloak | Adobe | Documentacao e pesquisa publicas; modelo/pesos proprietarios | Conforme contrato Adobe, nao revisado aqui | Adobe | D/E — aprender principios publicos |
| Vmake | Starii Tech | Servico/termos publicos; implementacao proprietaria | Termos restringem melhorar outro servico de IA | Pedido formal | Sem benchmark para melhoria sem permissao |

Fontes: [DynaFill](https://inpainting.cs.uni-freiburg.de/) e [UPOCR](https://arxiv.org/abs/2312.02694). A pagina DynaFill declara o recorte academico/GPLv3 e o caminho de contato; ela nao concede automaticamente direito ao Cleaner.

## Ficha de aprovacao obrigatoria

Antes de qualquer candidato de deploy, registrar projeto/autor, SHA/versao, origem e data; disponibilidade e licenca de codigo; licenca de modelo, pesos, dataset e cada dependencia; redistribuicao, modificacao, SaaS/API, atribuicao e derivados; restricoes; licenca comercial/contato; substituto; e revisao legal. `UNKNOWN` bloqueia a aprovacao: nao e permissao implicita.

O [grafo recursivo](dependency-graph.json) registra por que Apache/MIT em um wrapper nao libera priors, pesos e datasets transitivos.
