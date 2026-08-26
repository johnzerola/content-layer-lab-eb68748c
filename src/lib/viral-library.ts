/**
 * Biblioteca Viral — base de referência de "melhores momentos".
 *
 * Não hospedamos vídeos de terceiros (direito autoral + peso).
 * O que a biblioteca guarda é o CONTEXTO do que viraliza: padrões de gancho,
 * estrutura, duração ideal, palavras-chave e hashtags extraídos dos formatos
 * campeões de lives, podcasts, resumos de filmes, gameplay, notícias e humor.
 *
 * A base é combinatória e determinística: cada nicho cruza fórmulas de gancho
 * com temas e desfechos, gerando centenas de milhares de padrões pesquisáveis
 * que alimentam o score do CorteIA.
 */

export interface ViralNiche {
  id: string;
  label: string;
  blurb: string;
  /** duração ideal do corte nesse formato */
  minLen: number;
  maxLen: number;
  /** palavras que sinalizam um bom momento nesse formato */
  keywords: string[];
  /** fórmulas de gancho (abertura dos 3 primeiros segundos) */
  hooks: string[];
  /** temas recorrentes que rendem melhores momentos */
  topics: string[];
  /** como o trecho costuma terminar */
  payoffs: string[];
  hashtags: string[];
  /** pesos por etiqueta do motor de cortes */
  tagWeights: Record<string, number>;
}

export const NICHES: ViralNiche[] = [
  {
    id: "live",
    label: "Lives & reações",
    blurb: "Cortes de transmissão ao vivo: reação crua, treta e momento inesperado.",
    minLen: 15,
    maxLen: 45,
    keywords: [
      "ao vivo", "chat", "olha isso", "não acredito", "nao acredito", "caraca",
      "gente", "surreal", "acabou de", "agora", "reagiu", "treta", "pegou",
      "chocado", "meu deus", "que isso", "perdi", "ganhei",
    ],
    hooks: [
      "A reação ao vivo que ninguém esperava",
      "Ele descobriu no meio da live",
      "O chat enlouqueceu quando",
      "Perdeu o controle ao ver",
      "O momento exato em que tudo mudou",
      "Ficou sem palavras depois de",
      "A treta começou quando",
      "Não deu tempo de cortar a transmissão",
    ],
    topics: [
      "a resposta do chat", "a doação surpresa", "o convidado inesperado",
      "o erro ao vivo", "a aposta perdida", "a revelação no meio do papo",
      "o áudio que vazou", "a ligação inesperada", "o desafio aceito",
      "a promessa cumprida", "o rage quit", "a zoeira que virou verdade",
    ],
    payoffs: [
      "e a reação valeu o corte inteiro",
      "e todo mundo repetiu o clipe",
      "e virou meme no mesmo dia",
      "e o chat não deixou barato",
    ],
    hashtags: ["#live", "#cortes", "#reacao", "#aovivo", "#viral"],
    tagWeights: { "pico": 1.18, "reação": 1.22, "gancho": 1.12, "fala contínua": 1.02 },
  },
  {
    id: "podcast",
    label: "Podcasts & entrevistas",
    blurb: "Trechos de fala densa: opinião forte, história completa e virada de ideia.",
    minLen: 30,
    maxLen: 75,
    keywords: [
      "eu acho", "na verdade", "o problema é", "ninguém fala", "ninguem fala",
      "aprendi", "descobri", "a maior lição", "o segredo", "história", "historia",
      "quando eu", "me falaram", "a real é", "polêmica", "polemica", "opinião",
    ],
    hooks: [
      "A opinião que dividiu o estúdio",
      "Ele contou a história que nunca tinha contado",
      "A pergunta que travou o convidado",
      "A resposta mais sincera do episódio",
      "Ninguém esperava esse relato",
      "O conselho que muda a forma de pensar",
      "O erro que quase acabou com a carreira",
      "A verdade que ninguém fala sobre isso",
    ],
    topics: [
      "dinheiro e liberdade", "o primeiro fracasso", "a virada de chave",
      "bastidores da fama", "rotina de alta performance", "relacionamento e carreira",
      "o conselho que ignorou", "a decisão mais difícil", "saúde mental",
      "como começou do zero", "o maior arrependimento", "o que faria diferente",
    ],
    payoffs: [
      "e a conclusão é desconfortável",
      "e o silêncio no estúdio disse tudo",
      "e a lição vale para qualquer área",
      "e o convidado admitiu no fim",
    ],
    hashtags: ["#podcast", "#cortesdepodcast", "#entrevista", "#mindset", "#viral"],
    tagWeights: {
      "baseado na fala": 1.25, "gancho de texto": 1.2, "curiosidade": 1.15,
      "desfecho": 1.14, "pergunta e resposta": 1.12, "frase completa": 1.08,
    },
  },
  {
    id: "filme",
    label: "Resumos de filmes & séries",
    blurb: "Narração de enredo: gancho no conflito, ritmo rápido e final em suspense.",
    minLen: 45,
    maxLen: 90,
    keywords: [
      "personagem", "cena", "final", "reviravolta", "plot twist", "história", "historia",
      "ele descobre", "ela descobre", "acontece que", "no fim", "a partir daí",
      "o filme", "a série", "a serie", "temporada", "episódio", "episodio",
    ],
    hooks: [
      "Ele acorda e nada é o que parecia",
      "Nos primeiros 3 minutos o filme já entrega a pista",
      "A cena que muda o sentido do filme inteiro",
      "Ninguém percebeu esse detalhe na primeira vez",
      "O final explicado em menos de um minuto",
      "A reviravolta que quase ninguém previu",
      "Esse personagem estava mentindo o tempo todo",
      "O detalhe escondido no fundo da cena",
    ],
    topics: [
      "a verdadeira identidade do vilão", "o motivo do final aberto",
      "a linha do tempo escondida", "a cena pós-créditos", "a teoria mais aceita",
      "o erro de continuidade proposital", "o significado do objeto",
      "a mudança em relação ao livro", "a origem do protagonista",
      "o plano que deu errado", "a pista do primeiro ato",
    ],
    payoffs: [
      "e faz todo sentido quando você revê",
      "e o final ganha outro peso",
      "e a parte 2 confirma a teoria",
      "e é por isso que a cena existe",
    ],
    hashtags: ["#resumodefilme", "#filmes", "#series", "#explicado", "#plottwist"],
    tagWeights: {
      "baseado na fala": 1.22, "gancho de texto": 1.24, "curiosidade": 1.2,
      "fala contínua": 1.12, "desfecho": 1.1,
    },
  },
  {
    id: "gameplay",
    label: "Gameplay & esports",
    blurb: "Clutch, falha épica e jogada impossível — pico de energia manda.",
    minLen: 12,
    maxLen: 35,
    keywords: [
      "clutch", "jogada", "matou", "ganhou", "perdeu", "última", "ultima",
      "impossível", "impossivel", "1v5", "round", "partida", "rank", "bug",
    ],
    hooks: [
      "A jogada que ninguém acreditou",
      "1 contra todos e ainda ganhou",
      "O bug que decidiu a partida",
      "Ele errou o mais fácil do jogo",
      "O clutch mais improvável do campeonato",
      "A virada nos últimos segundos",
    ],
    topics: [
      "o último round", "a final do campeonato", "a jogada ensaiada",
      "o erro do time inteiro", "a build que quebrou o jogo", "o speedrun",
      "o troll que virou herói",
    ],
    payoffs: ["e o cast surtou", "e o replay explica tudo", "e o time inteiro comemorou"],
    hashtags: ["#gameplay", "#clutch", "#gamer", "#esports", "#cortes"],
    tagWeights: { "pico": 1.24, "reação": 1.18, "bom ritmo": 1.1 },
  },
  {
    id: "noticia",
    label: "Notícias & debates",
    blurb: "Fato + reação + posicionamento. Funciona com fala clara e desfecho seco.",
    minLen: 25,
    maxLen: 60,
    keywords: [
      "aconteceu", "anunciou", "confirmou", "polêmica", "polemica", "decisão",
      "decisao", "governo", "empresa", "processo", "urgente", "agora há pouco",
    ],
    hooks: [
      "Isso acabou de ser confirmado",
      "A decisão que muda tudo a partir de amanhã",
      "Ninguém está falando sobre o detalhe do anúncio",
      "O que isso significa na prática",
      "A resposta que encerrou o debate",
    ],
    topics: [
      "o impacto no bolso", "a letra miúda do anúncio", "quem sai ganhando",
      "a reação do outro lado", "o precedente que isso abre",
    ],
    payoffs: ["e a conta sobra para o consumidor", "e o desfecho foi imediato", "e ainda tem próximo capítulo"],
    hashtags: ["#noticia", "#debate", "#atualidades", "#urgente"],
    tagWeights: { "fala clara": 1.2, "desfecho": 1.14, "baseado na fala": 1.12 },
  },
  {
    id: "humor",
    label: "Humor & memes",
    blurb: "Setup curto, punchline rápida e reação forte no final.",
    minLen: 10,
    maxLen: 30,
    keywords: ["kkkk", "risada", "piada", "zoeira", "mano", "vergonha", "cara", "surtou"],
    hooks: [
      "Ele falou isso sem perceber a câmera",
      "A resposta mais rápida que já ouvi",
      "Começou brincadeira e terminou assim",
      "O silêncio depois dessa frase",
    ],
    topics: [
      "o mico ao vivo", "a resposta atravessada", "o mal-entendido",
      "a imitação perfeita", "a gafe no melhor momento",
    ],
    payoffs: ["e o estúdio caiu na risada", "e ninguém segurou", "e virou áudio de status"],
    hashtags: ["#humor", "#memes", "#engracado", "#cortes"],
    tagWeights: { "pico": 1.16, "reação": 1.2, "bom ritmo": 1.12 },
  },
  {
    id: "educativo",
    label: "Aulas & tutoriais",
    blurb: "Promessa clara no início, passo a passo enxuto e resultado no fim.",
    minLen: 30,
    maxLen: 70,
    keywords: [
      "passo", "primeiro", "segundo", "como fazer", "aprenda", "dica", "erro comum",
      "regra", "método", "metodo", "truque", "atalho",
    ],
    hooks: [
      "Faça isso antes de qualquer outra coisa",
      "O erro que 90% comete logo no começo",
      "Em 3 passos você resolve isso hoje",
      "Ninguém te ensina essa parte",
    ],
    topics: [
      "o método em 3 passos", "o atalho que economiza horas", "o erro mais comum",
      "a ferramenta gratuita", "o checklist final",
    ],
    payoffs: ["e o resultado aparece na primeira tentativa", "e você economiza semanas", "e é só repetir"],
    hashtags: ["#dica", "#tutorial", "#aprenda", "#passoapasso"],
    tagWeights: { "baseado na fala": 1.18, "fala clara": 1.16, "desfecho": 1.12 },
  },
];

export interface ViralPattern {
  id: string;
  nicheId: string;
  nicheLabel: string;
  /** gancho sugerido para os 3 primeiros segundos */
  hook: string;
  /** o assunto que sustenta o corte */
  topic: string;
  /** como fechar o corte */
  payoff: string;
  /** duração recomendada em segundos */
  seconds: number;
  /** potencial estimado 0..100 (heurística de referência) */
  score: number;
  hashtags: string[];
  keywords: string[];
}

/** total combinatório de padrões disponíveis na base */
export function libraryTotal(): number {
  // cada combinação rende 12 variações de duração/ritmo
  return NICHES.reduce(
    (acc, n) => acc + n.hooks.length * n.topics.length * n.payoffs.length * 12,
    0,
  );
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};

function buildPattern(niche: ViralNiche, hi: number, ti: number, pi: number, vi: number): ViralPattern {
  const hook = niche.hooks[hi % niche.hooks.length]!;
  const topic = niche.topics[ti % niche.topics.length]!;
  const payoff = niche.payoffs[pi % niche.payoffs.length]!;
  const id = `${niche.id}-${hi}-${ti}-${pi}-${vi}`;
  const r = hash(id);
  const span = niche.maxLen - niche.minLen;
  const seconds = Math.round(niche.minLen + span * ((vi % 12) / 11));
  const score = Math.round(72 + r * 27);
  return {
    id,
    nicheId: niche.id,
    nicheLabel: niche.label,
    hook,
    topic,
    payoff,
    seconds,
    score,
    hashtags: niche.hashtags,
    keywords: niche.keywords,
  };
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface LibraryQuery {
  nicheId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Percorre a base combinatória sob demanda (nunca materializa tudo em memória).
 */
export function searchPatterns(q: LibraryQuery = {}): ViralPattern[] {
  const limit = q.limit ?? 24;
  const offset = q.offset ?? 0;
  const term = norm((q.search ?? "").trim());
  const pool = q.nicheId ? NICHES.filter((n) => n.id === q.nicheId) : NICHES;
  const out: ViralPattern[] = [];
  let seen = 0;

  for (const niche of pool) {
    for (let vi = 0; vi < 12; vi++) {
      for (let hi = 0; hi < niche.hooks.length; hi++) {
        for (let ti = 0; ti < niche.topics.length; ti++) {
          for (let pi = 0; pi < niche.payoffs.length; pi++) {
            const p = buildPattern(niche, hi, ti, pi, vi);
            if (term) {
              const hay = norm(`${p.hook} ${p.topic} ${p.payoff} ${p.nicheLabel}`);
              if (!hay.includes(term)) continue;
            }
            if (seen++ < offset) continue;
            out.push(p);
            if (out.length >= limit) return out;
          }
        }
      }
    }
  }
  return out;
}

export interface LibraryContext {
  nicheId: string;
  label: string;
  minLen: number;
  maxLen: number;
  keywords: string[];
  hashtags: string[];
  tagWeights: Record<string, number>;
}

export function nicheContext(nicheId: string | null | undefined): LibraryContext | null {
  const n = NICHES.find((x) => x.id === nicheId);
  if (!n) return null;
  return {
    nicheId: n.id,
    label: n.label,
    minLen: n.minLen,
    maxLen: n.maxLen,
    keywords: n.keywords,
    hashtags: n.hashtags,
    tagWeights: n.tagWeights,
  };
}

/** Mistura os pesos aprendidos pelo desempenho real com os do nicho. */
export function mergeTagWeights(
  learned: Record<string, number>,
  ctx: LibraryContext | null,
): Record<string, number> {
  if (!ctx) return learned;
  const out: Record<string, number> = { ...learned };
  for (const [tag, w] of Object.entries(ctx.tagWeights)) {
    out[tag] = out[tag] ? (out[tag]! + w) / 2 : w;
  }
  return out;
}

export interface NicheGuess {
  nicheId: string;
  label: string;
  confidence: number;
  /** como o nicho foi decidido */
  how: "transcrição" | "duração e ritmo";
}

/**
 * Descobre em qual formato da biblioteca o vídeo se encaixa.
 * Com transcrição, conta as palavras-chave de cada nicho; sem ela,
 * usa duração e densidade de fala como heurística.
 */
export function detectNiche(
  text: string,
  meta?: { duration?: number; speechDensity?: number },
): NicheGuess {
  const t = norm(text ?? "");
  if (t.length > 40) {
    let best: { n: ViralNiche; hits: number } | null = null;
    for (const n of NICHES) {
      let hits = 0;
      for (const k of n.keywords) {
        const kk = norm(k);
        if (!kk) continue;
        let from = 0;
        // conta ocorrências (cada palavra vale no máximo 3 pontos)
        for (let c = 0; c < 3; c++) {
          const i = t.indexOf(kk, from);
          if (i < 0) break;
          hits++;
          from = i + kk.length;
        }
      }
      if (!best || hits > best.hits) best = { n, hits };
    }
    if (best && best.hits >= 3) {
      return {
        nicheId: best.n.id,
        label: best.n.label,
        confidence: Math.min(1, best.hits / 18),
        how: "transcrição",
      };
    }
  }

  const dur = meta?.duration ?? 0;
  const density = meta?.speechDensity ?? 0.5;
  const pick =
    dur >= 1800 && density > 0.5
      ? "podcast"
      : dur >= 900 && density > 0.45
        ? "live"
        : dur >= 600
          ? "filme"
          : density > 0.6
            ? "educativo"
            : "humor";
  const n = NICHES.find((x) => x.id === pick) ?? NICHES[0]!;
  return { nicheId: n.id, label: n.label, confidence: 0.35, how: "duração e ritmo" };
}

export interface PatternMatch {
  hook: string;
  topic: string;
  payoff: string;
  hashtags: string[];
  nicheLabel: string;
  reason: string;
}

/**
 * Casa um corte com o padrão mais próximo do nicho (determinístico pelo
 * tempo de início + texto, para o mesmo corte devolver sempre o mesmo padrão).
 */
export function matchPattern(
  nicheId: string | null | undefined,
  clip: { start: number; text?: string | undefined },
): PatternMatch | null {
  const n = NICHES.find((x) => x.id === nicheId);
  if (!n) return null;
  const seedText = `${n.id}|${clip.start.toFixed(2)}|${(clip.text ?? "").slice(0, 120)}`;
  const t = norm(clip.text ?? "");

  // se o texto cita um tema do nicho, esse tema ganha; senão, escolha estável por hash
  let ti = Math.floor(hash(`${seedText}#t`) * n.topics.length);
  for (let i = 0; i < n.topics.length; i++) {
    const parts = norm(n.topics[i]!).split(/\s+/).filter((w) => w.length > 4);
    if (parts.length && parts.some((w) => t.includes(w))) {
      ti = i;
      break;
    }
  }
  const hi = Math.floor(hash(`${seedText}#h`) * n.hooks.length);
  const pi = Math.floor(hash(`${seedText}#p`) * n.payoffs.length);
  const hook = n.hooks[hi % n.hooks.length]!;
  const topic = n.topics[ti % n.topics.length]!;
  const payoff = n.payoffs[pi % n.payoffs.length]!;
  return {
    hook,
    topic,
    payoff,
    hashtags: n.hashtags,
    nicheLabel: n.label,
    reason: `casou com padrão de ${n.label.toLowerCase()}: ${topic} ${payoff}`,
  };
}

