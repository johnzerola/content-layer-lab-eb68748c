/**
 * ACERVO DE ÁUDIO LIVRE (Creative Commons / domínio público).
 *
 * Nada é embutido no bundle: as faixas e efeitos são buscados sob demanda na
 * API pública do Wikimedia Commons (CORS liberado) e só carregam o arquivo
 * quando o usuário pede a prévia ou adiciona na trilha do editor.
 */

export type SoundKind = "music" | "sfx";

export interface SoundAsset {
  id: string;
  name: string;
  /** URL direta do arquivo (mp3/ogg/wav) */
  url: string;
  kind: SoundKind;
  /** categoria do acervo (id) */
  category: string;
  /** rótulo legível do pacote/categoria de origem */
  categoryLabel?: string;
  /** tamanho aproximado em MB */
  sizeMb: number;
  /** crédito obrigatório da licença livre */
  attribution: string;
  /** licença declarada (CC0, CC BY-SA 4.0, Public domain...) */
  license: string;
  pageUrl: string;
}

export interface SoundCategory {
  id: string;
  label: string;
  kind: SoundKind;
  /** consulta usada no acervo livre */
  query: string;
}

export const SOUND_CATEGORIES: SoundCategory[] = [
  { id: "energia", label: "Energia", kind: "music", query: "upbeat electronic music" },
  { id: "lofi", label: "Lo-fi / chill", kind: "music", query: "ambient chill music loop" },
  { id: "epico", label: "Épico", kind: "music", query: "cinematic epic orchestral music" },
  { id: "beats", label: "Beats", kind: "music", query: "drum loop beat" },
  { id: "piano", label: "Piano", kind: "music", query: "piano solo music" },
  { id: "acustico", label: "Acústico", kind: "music", query: "acoustic guitar music" },
  { id: "sintetizador", label: "Synthwave", kind: "music", query: "synthesizer electronic loop" },
  { id: "jazz", label: "Jazz / Soul", kind: "music", query: "jazz instrumental music" },
  { id: "rock", label: "Rock", kind: "music", query: "rock guitar instrumental" },
  { id: "classica", label: "Clássica", kind: "music", query: "classical orchestra recording" },
  { id: "percussao", label: "Percussão", kind: "music", query: "percussion drums rhythm loop" },
  { id: "ambiente", label: "Ambiente", kind: "music", query: "ambient drone soundscape" },
  { id: "transicao", label: "Transições", kind: "sfx", query: "whoosh swoosh transition" },
  { id: "impacto", label: "Impactos", kind: "sfx", query: "impact hit boom sound" },
  { id: "ui", label: "Cliques / UI", kind: "sfx", query: "click beep notification sound" },
  { id: "plateia", label: "Plateia", kind: "sfx", query: "applause crowd laugh" },
  { id: "natureza", label: "Natureza", kind: "sfx", query: "rain wind birds ambience" },
  { id: "memes", label: "Memes", kind: "sfx", query: "cartoon boing pop sound effect" },
  { id: "cidade", label: "Cidade", kind: "sfx", query: "city traffic street ambience" },
  { id: "animais", label: "Animais", kind: "sfx", query: "animal sound dog cat bird" },
  { id: "alarmes", label: "Alarmes", kind: "sfx", query: "alarm siren bell sound" },
  { id: "aguas", label: "Água", kind: "sfx", query: "water river ocean waves sound" },
  { id: "passos", label: "Passos / Foley", kind: "sfx", query: "footsteps door foley sound" },
  { id: "risadas", label: "Vozes", kind: "sfx", query: "human voice shout laugh sample" },
];

/**
 * Pacotes da GALERIA PRONTA: várias consultas combinadas em uma lista única
 * com 100+ músicas e efeitos livres, cada item com autor e licença.
 */
export const SOUND_PACKS: { id: string; label: string; kind: SoundKind; queries: string[] }[] = [
  {
    id: "trilhas",
    label: "Trilhas prontas",
    kind: "music",
    queries: [
      "upbeat electronic music loop",
      "cinematic epic orchestral music",
      "ambient chill music loop",
      "piano solo music",
      "acoustic guitar music",
      "jazz instrumental music",
      "synthesizer music loop",
      "drum beat loop",
    ],
  },
  {
    id: "efeitos",
    label: "Efeitos prontos",
    kind: "sfx",
    queries: [
      "whoosh transition sound",
      "impact boom sound effect",
      "click beep interface sound",
      "applause crowd sound",
      "rain wind ambience sound",
      "cartoon pop boing sound",
      "door footsteps foley sound",
      "bell alarm sound effect",
    ],
  },
];


/** Galeria curada de trilhas livres (CC0 / domínio público) por clima. */
export interface Cc0Mood {
  id: string;
  label: string;
  hint: string;
  query: string;
  /** classes de gradiente para o card da galeria */
  gradient: string;
}

export const CC0_MOODS: Cc0Mood[] = [
  { id: "hype", label: "Hype", hint: "abertura forte", query: "energetic electronic music loop", gradient: "from-primary/70 to-fuchsia-500/40" },
  { id: "chill", label: "Chill", hint: "vlog e bastidores", query: "lofi chill ambient music", gradient: "from-cyan-400/60 to-primary/40" },
  { id: "epico", label: "Épico", hint: "storytelling", query: "cinematic epic orchestral music", gradient: "from-amber-400/60 to-rose-500/40" },
  { id: "emocional", label: "Emocional", hint: "depoimentos", query: "emotional piano music", gradient: "from-sky-400/60 to-indigo-500/40" },
  { id: "urbano", label: "Urbano", hint: "trap e beats", query: "hip hop trap beat loop", gradient: "from-emerald-400/60 to-teal-500/40" },
  { id: "acustico", label: "Acústico", hint: "lifestyle", query: "acoustic guitar background music", gradient: "from-orange-400/60 to-yellow-500/40" },
];


interface CommonsPage {
  title: string;
  imageinfo?: { url: string; mime: string; size: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}

const cache = new Map<string, SoundAsset[]>();

function clean(title: string): string {
  return title
    .replace(/^File:/, "")
    .replace(/\.(mp3|ogg|oga|wav|flac|m4a)$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string | undefined): string {
  if (!value) return "Wikimedia Commons";
  return value.replace(/<[^>]+>/g, "").trim() || "Wikimedia Commons";
}

/**
 * Busca faixas livres sob demanda. O resultado fica em cache por consulta
 * para não repetir requisição a cada troca de aba.
 */
export async function searchFreeSounds(
  query: string,
  kind: SoundKind,
  limit = 24,
): Promise<SoundAsset[]> {
  const key = `${kind}:${query}:${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${query} filetype:audio`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
  });

  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!res.ok) throw new Error("não consegui acessar o acervo livre agora");
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(json.query?.pages ?? {});

  const maxSize = kind === "sfx" ? 3_000_000 : 12_000_000;
  const assets: SoundAsset[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    if (!/^(audio\/(mpeg|ogg|wav|x-wav|flac|mp4)|application\/ogg)/.test(info.mime)) continue;
    if (info.size > maxSize) continue;
    const url = info.url.split("?")[0] ?? info.url;
    assets.push({
      id: url,
      name: clean(page.title),
      url,
      kind,
      category: query,
      sizeMb: Math.round((info.size / 1_000_000) * 10) / 10,
      attribution: stripHtml(info.extmetadata?.["Artist"]?.value) || "Autor não informado",
      license: stripHtml(info.extmetadata?.["LicenseShortName"]?.value ?? info.extmetadata?.["UsageTerms"]?.value),
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org",
    });
  }
  cache.set(key, assets);
  return assets;
}
