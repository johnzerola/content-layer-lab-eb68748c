# Fase 5 - validacao variada e custo de tres minutos

O validador reproduzivel esta implementado em `phase5_validate.py`. Ele exige no
minimo dez casos e dez grupos de origem independentes, cobrindo tecido, linhas
retas, pele/rosto, cabelo, movimento, pouca luz, legenda simples, neon, sombra e
transicao. Cada entrada, baseline e candidato recebe SHA256 e FFprobe completo.

O gate rejeita mudanca de resolucao, FPS, contagem de quadros, duracao ou presenca
de audio. A revisao humana usa sete notas inteiras de 0 a 4: residuo, blur,
flicker, ghosting, textura, geometria e preservacao. O relatorio nunca promove
automaticamente uma variante; a decisao exige revisao cega e evidencia agregada.

## Estado atual

A infraestrutura da Fase 5 esta pronta, mas o conjunto real ainda nao esta. O
workspace possui um exemplo independente conhecido e derivados dele. Dividir o
mesmo video em dez trechos nao satisfaz o criterio de dez fontes independentes.
A variante RealBasicVSR tambem nao produziu candidato aceito na Fase 4. Por isso,
o custo real de tres minutos permanece `null` e `promotion_allowed` permanece
`false`.

O arquivo `phase5-manifest.example.json` documenta o contrato. Videos reais
licenciados devem ser cadastrados sem substituir os artefatos existentes. A
referencia Vmake pode entrar como comparacao comercial perceptual alinhada, mas
nao como ground truth pixel a pixel.
