/**
 * FONTES NO RENDERIZADOR
 * O preview desenha no canvas da página (com as fontes da web já carregadas),
 * mas o worker de exportação roda isolado e não enxerga essas fontes. Sem elas
 * o navegador troca por uma fonte padrão, o texto muda de largura e a headline
 * quebra em mais linhas — foi isso que fez o MP4 sair diferente da prévia.
 *
 * Aqui as famílias usadas no template são baixadas uma vez e enviadas ao worker
 * como data URL, para prévia e arquivo final medirem exatamente igual.
 * Só apresentação: nenhuma regra de negócio depende deste módulo.
 */
import type { CustomFont, Template } from "@/lib/template";

/** famílias que todo sistema já tem — não precisam ser embutidas */
const SYSTEM = new Set([
  "arial",
  "arial black",
  "helvetica",
  "impact",
  "courier new",
  "times new roman",
  "georgia",
  "verdana",
  "tahoma",
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "cursive",
]);

/** primeira família da pilha CSS ("Outfit, sans-serif" -> "Outfit") */
export function primaryFamily(stack: string | undefined | null): string {
  const first = (stack ?? "").split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

/** todas as famílias reais usadas pelas camadas de texto do template */
export function collectTemplateFamilies(t: Template): string[] {
  const stacks: (string | undefined)[] = [
    t.name_?.font,
    t.handle?.font,
    t.headline?.font,
    t.cta?.font,
    t.captions?.font,
    ...(t.extras ?? []).map((e) => ("font" in e ? e.font : undefined)),
  ];
  const out = new Set<string>();
  for (const stack of stacks) {
    const fam = primaryFamily(stack);
    if (fam && !SYSTEM.has(fam.toLowerCase())) out.add(fam);
  }
  return [...out];
}

const cache = new Map<string, CustomFont[]>();
const inflight = new Map<string, Promise<CustomFont[]>>();

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    return `data:font/woff2;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** baixa os arquivos woff2 de uma família do Google Fonts (latin, 400..900) */
async function fetchFamily(family: string): Promise<CustomFont[]> {
  const cached = cache.get(family);
  if (cached) return cached;
  const running = inflight.get(family);
  if (running) return running;

  const job = (async () => {
    const css = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family,
    )}:wght@400;500;600;700;800;900&display=swap`;
    const faces: CustomFont[] = [];
    try {
      const res = await fetch(css);
      if (res.ok) {
        const text = await res.text();
        // um arquivo por peso, sempre o bloco latin — é o que o canvas mede
        const byWeight = new Map<string, string>();
        for (const block of text.split("@font-face")) {
          const url = /src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
          if (!url) continue;
          const isLatin = !/unicode-range/.test(block) || /U\+0000-00FF/i.test(block);
          if (!isLatin) continue;
          const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? "400";
          if (!byWeight.has(weight)) byWeight.set(weight, url);
        }
        for (const [weight, url] of byWeight) {
          const dataUrl = await toDataUrl(url);
          if (dataUrl) faces.push({ name: family, dataUrl, weight });
        }
      }
    } catch {
      /* sem rede: segue com a fonte padrão do sistema */
    }
    cache.set(family, faces);
    return faces;
  })();

  inflight.set(family, job);
  try {
    return await job;
  } finally {
    inflight.delete(family);
  }
}

/** fontes prontas para o worker: as enviadas pelo usuário + as da web usadas */
export async function templateFontPayload(t: Template): Promise<CustomFont[]> {
  const custom = t.fonts ?? [];
  const already = new Set(custom.map((f) => f.name.toLowerCase()));
  const families = collectTemplateFamilies(t).filter((f) => !already.has(f.toLowerCase()));
  const web = await Promise.all(families.map((f) => fetchFamily(f)));
  return [...custom, ...web.flat()];
}
