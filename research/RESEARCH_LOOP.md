# Ciclo contínuo de pesquisa

1. Observe um caso e preserve artefatos/hashes/direitos em `failures/`.
2. Busque conhecimento interno por sintoma, engine e técnica.
3. Inspecione o componente local e registre versão; confirme deployment separadamente.
4. Consulte fonte pública original, código de inferência, paper e issues/PRs.
5. Formule hipótese falsificável e procure também evidência contrária.
6. Registre experimento isolado, baseline, dataset e critérios de sucesso.
7. Execute runner apropriado ou importe saída com proveniência.
8. Meça, compare por categoria e preserve regressões/custo.
9. Registre decisão e atualize card, grafo e skill correspondente.

`research_loop.py` implementa rodadas finitas retomáveis de coleta com cache,
registro de falha por provedor e estado persistente. Cada execução observa o
intervalo configurado; não instala scheduler nem fica eternamente em background.
Pode ser chamado por agendador existente quando desejado. A pesquisa semântica e
a decisão de experimento são trabalho das skills, não conclusões inventadas pelo coletor.

## Revalidação

Consulte releases e issues semanalmente e licenças antes de cada adoção. Use a
revisão upstream fixada nos cards; compare novas revisões antes de atualizar.
Coletas 403/429 devem registrar limite e parar o provedor, sem repetição agressiva.
Quando uma API estiver indisponível, a skill pode consultar páginas públicas
normais e registrar cobertura menor. Conteúdo de marketing é evidência de alegação,
não da implementação interna ou da qualidade medida.
