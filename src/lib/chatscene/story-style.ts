/** Shared between the form and server validation so a long brief is never truncated. */
export const STORY_TOPIC_MAX_CHARS = 5000;
export const STORY_NARRATIVE_STYLES = ["animated-chat", "free"] as const;
export type StoryNarrativeStyle = (typeof STORY_NARRATIVE_STYLES)[number];
export const DEFAULT_STORY_NARRATIVE_STYLE: StoryNarrativeStyle = "animated-chat";

/** Craft rules calibrated from the user's three reference videos, not their scripts. */
export const ANIMATED_CHAT_DIRECTION = [
  "DIREÇÃO NARRATIVA: CONVERSA ANIMADA.",
  "O motor da história é uma relação reconhecível: família, escola, amizade ou trabalho. Comece no instante em que alguém precisa de algo e outra pessoa impõe uma regra, faz uma acusação ou esconde uma informação. O assunto e o conflito vêm do briefing; não transforme todos os temas em histórias de família.",
  "GANCHO: nas primeiras 1 ou 2 falas, exponha uma situação concreta que pareça contraditória, injusta ou urgente. O público deve querer saber por quê. Evite chamadas vagas como 'você não vai acreditar' ou promessas de algo que só será explicado no final.",
  "HUMOR: faça a graça nascer da diferença entre a intenção e a interpretação, de uma resposta literal, de uma desculpa que piora a situação ou de alguém invertendo a autoridade. Uma pessoa fala com convicção; a outra desmonta a lógica com uma réplica curta. O personagem não sabe que está contando uma piada. Prefira ironia cotidiana e detalhes específicos a insultos aleatórios, bordões ou piadas de narrador.",
  "PERSONAGENS: dê a cada um um desejo, uma fragilidade e uma estratégia para vencer a conversa. Quem parece mandão pode estar preocupado; quem parece irresponsável pode esconder um motivo compreensível. Revele isso por evidências. A pessoa mais velha pode ser a mais espirituosa; a mais nova pode perceber o absurdo primeiro. Não use idade como personalidade inteira.",
  "ESCALADA E RETENÇÃO: a cada 3 a 6 mensagens, acrescente uma descoberta, uma consequência, um impedimento ou uma mudança de poder que obrigue a continuar lendo. Cada tentativa deve causar a próxima complicação. Responda às perguntas que abriu enquanto planta uma nova dúvida; não adie tudo por frases vazias. Em histórias curtas, comprima essas etapas em vez de empilhá-las.",
  "VIRADA: plante cedo um objeto, uma frase ou um detalhe com dois sentidos. Por volta dos últimos 25% da história, revele um fato que faça o público reinterpretar o conflito. Pode ser um engano, uma prova, uma motivação escondida ou a inversão de quem tinha razão. Evite aplicar sempre a mesma receita de doença, pobreza ou tragédia como surpresa.",
  "DESFECHO: reserve as últimas 2 a 4 falas para a consequência. Quando houver reconciliação, alguém toma uma atitude concreta; não basta dizer que aprendeu uma lição. Na comédia, feche com uma réplica curta que retoma o objeto ou a regra do começo com um novo sentido (callback). Encerre nessa batida, sem explicar por que ela é engraçada.",
  "TOM: a direção organiza a história, mas o clima escolhido prevalece. Comédia usa contraste, escalada e callback; emotivo pode alternar humor com uma revelação humana; drama preserva o peso; suspense entrega uma resposta coerente. Não force uma piada em um desfecho sério.",
  "RITMO DE MENSAGENS: respostas de 1 a 5 palavras intercaladas com falas de 6 a 14, uma intenção por bolha. Duas mensagens consecutivas podem criar preparação e reação. Pontuação, silêncio e emoção só onde ajudam; nada de gritaria, emojis ou reticências em todas as falas.",
  "VARIEDADE E ORIGINALIDADE: invente premissa, nomes, objetos, falas, pistas e solução. Não reproduza roteiro, sequência de acontecimentos ou bordões de um vídeo de referência. Preserve a mecânica narrativa e crie uma história nova. Se o usuário trouxer muitos detalhes, priorize o conflito e o final que ele pediu; não tente narrar cada detalhe em 60 segundos.",
  "REVISÃO SILENCIOSA: antes do JSON, verifique se o gancho é específico, cada complicação vem da anterior, as vozes textuais são diferentes, a pista antecede a virada e o final paga a promessa inicial. Reescreva as falas genéricas. Não exponha essa revisão ao usuário.",
].join("\n");
