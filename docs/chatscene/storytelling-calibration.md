# Direção narrativa de conversas animadas

## Evidência e alcance

Pedido do usuário: calibrar o gerador usando o canal
[Léo Conversas Animadas](https://www.youtube.com/@LeoConversasAnimadas/shorts).
A listagem direta do YouTube teve acesso limitado nesta sessão. Foram analisadas
as transcrições automáticas dos três arquivos já fornecidos em `Desktop/inspirar`.
O endpoint público oficial oEmbed confirmou título, autor e URL do canal dos três
IDs em 18/09/2026. Portanto a análise se refere a essa amostra, não a todo o canal.

- [A mãe mais antiga da casa](https://www.youtube.com/watch?v=yOo8_Hij0Vs)
- [O preço do meu rim](https://www.youtube.com/watch?v=Du9uVH8kM8o)
- [Quebrei a mesa de desenho do professor](https://www.youtube.com/watch?v=PmZ_2UEKL8s)

Transcrições locais: `output/inspirar-analysis/*.transcript.json`. Não são incluídas
no Git. Nenhuma fala, roteiro integral, voz ou mídia das referências é distribuída
pela funcionalidade.

## Observação transformada em regra de criação

O conflito já começou na primeira fala. Uma recusa, acusação ou regra força a
réplica seguinte. A graça surge da diferença entre o que a pessoa diz e faz, de
respostas literais, desculpas que pioram o problema e inversões de autoridade.
Uma pista muda a relação de poder; em parte da amostra, a revelação humaniza quem
parecia egoísta. A reparação acontece por uma atitude concreta. A última réplica
retoma um motivo inicial sob outra interpretação.

O preset pede histórias novas com esses recursos, respeitando o tema e o clima
escolhidos. Não força reconciliação, tragédia ou piada em todo roteiro. O modo
Livre continua disponível. Não há promessa de retenção, viralização ou igualdade
de qualidade com o canal: essas propriedades exigem avaliação editorial e dados
de audiência.

## Ritmo e limites

As referências têm 266,5 a 280,2 palavras por minuto pelas transcrições. Segmentos
ASR não equivalem a bolhas; não são usados como contagem obrigatória de mensagens.
O orçamento já existente de 4,3 palavras por segundo é mantido como orientação.
A duração final segue o áudio gerado.

O briefing passa de 400 para 5.000 caracteres, com limite compartilhado entre UI
e validação no servidor. Aumentar espaço para instruções não alonga automaticamente
o vídeo: a duração desejada continua sendo um controle independente. O limite de
240 caracteres por fala mantém as mensagens legíveis.

## Implementação

- `story-style.ts`: limite e direção narrativa compartilhados.
- `story-generation.ts`: perfil padrão, opção Livre e tema enviado como dados.
- `StoryPanel.tsx`: direção pré-selecionada, explicação recolhível e contador ampliado.
- Testes cobrem briefing integral no limite, rejeição sem corte, clientes antigos,
  direção Livre e manutenção das validações de roteiro.

Geração real com IA e revisão editorial de roteiros gerados não foram executadas
nesta etapa; os ensaios de contrato usam dados controlados e não consomem créditos.

O formulário real foi exercitado em navegador isolado: envio integral de 5.000
caracteres, seleção Livre, bloqueio durante geração simulada, abertura da explicação
por teclado e preservação do briefing ao alternar para Reddit e voltar. Não houve
overflow nas larguras 375, 390, 768, 1280, 1366 e 1440 pixels, nem erros de console
nesse fluxo. Isso valida o formulário, não a qualidade editorial da saída da IA.
