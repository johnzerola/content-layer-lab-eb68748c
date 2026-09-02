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
  /** tamanho aproximado em MB */
  sizeMb: number;
  /** crédito obrigatório da licença livre */
  attribution: string;
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
  { id: "transicao", label: "Transições", kind: "sfx", query: "whoosh swoosh transition" },
  { id: "impacto", label: "Impactos", kind: "sfx", query: "impact hit boom sound" },
  { id: "ui", label: "Cliques / UI", kind: "sfx", query: "click beep notification sound" },
  { id: "plateia", label: "Plateia", kind: "sfx", query: "applause crowd laugh" },
  { id: "natureza", label: "Natureza", kind: "sfx", query: "rain wind birds ambience" },
  { id: "memes", label: "Memes", kind: "sfx", query: "cartoon boing pop sound effect" },
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
    if (!/^audio\/(mpeg|ogg|wav|x-wav|flac|mp4)/.test(info.mime)) continue;
    if (info.size > maxSize) continue;
    const url = info.url.split("?")[0] ?? info.url;
    assets.push({
      id: url,
      name: clean(page.title),
      url,
      kind,
      category: query,
      sizeMb: Math.round((info.size / 1_000_000) * 10) / 10,
      attribution: stripHtml(info.extmetadata?.["Artist"]?.value ?? info.extmetadata?.["LicenseShortName"]?.value),
      pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org",
    });
  }
  cache.set(key, assets);
  return assets;
}
