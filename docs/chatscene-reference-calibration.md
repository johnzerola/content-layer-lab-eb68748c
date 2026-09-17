# ChatScene — calibração das referências locais

## Contrato de referência (17/09/2026)

- Fonte: dois MP4 e um MP3 fornecidos em `Desktop/inspirar`. Originais intactos.
- Alvo: aproximação próxima da composição e do ritmo, dentro do renderizador existente.
- Aproveitar: painel escuro no alto, largura ~86%, altura variável, texto grande,
  páginas de mensagens, identificação de remetentes em grupos, cortes entre contatos,
  falas curtas e efeitos sonoros pontuais.
- Não incorporar: vídeos de gameplay, fotos, figurinhas, roteiros integrais, marcas
  ou identidade vocal de pessoas das referências. Usar conteúdos próprios/licenciados.
- Restrições: um documento e um relógio; prévia/exportação compartilham desenho e áudio;
  duração final medida prevalece sobre estimativas de leitura. Não migrar projetos
  antigos nem trocar vozes clonadas/salvas silenciosamente.
- Revisão: branch `feat/chatscene-reference-presets`, testes e imagens locais antes
  de qualquer publicação. A referência não implica promessa de voz idêntica.

## Evidência visual inspecionada

`output/inspirar-analysis/reference-a.png` e `reference-b.png`: 12 quadros por vídeo.
Detalhes do primeiro vídeo em 1, 4, 8 e 24 segundos.

Em 4 s: painel aproximadamente x=77, y=145, largura=925 px em 1080×1920;
cabeçalho ~146 px; texto de mensagem ~46 px. Em 8 s, painel volta a poucas
mensagens, no mesmo topo. A referência às vezes corta parcialmente a bolha inferior;
o produto deve preservar o texto integral, sem reproduzir esse defeito.
O grupo identifica remetentes com nome/cor/avatar; o privado troca o contato.
Papel de parede denso e fundos em movimento fazem parte da referência, mas não
serão extraídos como assets para o produto.

## Transcrição e limites

Análise local em `G:\VaiViral\reference-analysis-env`, separada das dependências
do produto. Script reproduzível: `scripts/analyze-chatscene-references.py`.
Saída: JSON com hash, segmentos, palavras, tempos e avisos em `output/inspirar-analysis`.
ASR não é transcrição humana: erros de nomes, pontuação e sobreposição precisam de revisão.
Não deduz identidade, idade real ou qualidade vocal a partir da transcrição.

Ferramenta: [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper),
SYSTRAN, licença MIT; modelo [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small),
conversão Whisper, MIT no model card. Uso comercial permitido pela licença;
preservar avisos MIT se redistribuir. Instalados somente para análise, não distribuídos
com o aplicativo. Nenhuma licença dos vídeos/vozes de referência foi presumida.

## Decisões de engenharia

- Perfil rápido opt-in ao aplicar formato; projetos antigos conservam o relógio legado.
- Separar voz base, atuação e transformação. Velocidade/pitch são ajustes
  experimentais, não equivalências acústicas de idade.
- Sons nas mudanças de conversa/cartões, sem bip em toda fala; efeitos explícitos
  por mensagem continuam possíveis. Histórico inicial não dispara sons.
- Tipo de conversa calculado por thread, nunca pelo tamanho total do elenco.
- Roteiro original: conflito na abertura, respostas causais, motivos distintos,
  virada preparada, consequência final; cortes de tempo só quando necessários.
