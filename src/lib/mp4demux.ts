/**
 * Demuxer MP4/MOV mínimo — extrai a tabela de amostras da trilha de vídeo para
 * alimentar o `VideoDecoder` (WebCodecs). Sem dependências: lê apenas os boxes
 * necessários (moov/trak/mdia/minf/stbl) e ignora o mdat, que é lido sob demanda.
 */

export interface Mp4Sample {
  /** posição no arquivo */
  offset: number;
  size: number;
  /** tempo de apresentação em segundos */
  cts: number;
  /** duração em segundos */
  duration: number;
  sync: boolean;
}

export interface Mp4Track {
  codec: string;
  description: Uint8Array | undefined;
  width: number;
  height: number;
  duration: number;
  samples: Mp4Sample[];
}

interface Box {
  type: string;
  start: number;
  size: number;
  /** início do conteúdo */
  body: number;
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta"]);

function readBox(view: DataView, pos: number, limit: number): Box | null {
  if (pos + 8 > limit) return null;
  let size = view.getUint32(pos);
  const type = String.fromCharCode(
    view.getUint8(pos + 1 + 0),
    view.getUint8(pos + 2),
    view.getUint8(pos + 3),
    view.getUint8(pos + 4),
  );
  // reconstrói o tipo corretamente (offsets acima seriam frágeis)
  const t = String.fromCharCode(
    view.getUint8(pos + 4),
    view.getUint8(pos + 5),
    view.getUint8(pos + 6),
    view.getUint8(pos + 7),
  );
  void type;
  let body = pos + 8;
  if (size === 1) {
    if (pos + 16 > limit) return null;
    const hi = view.getUint32(pos + 8);
    const lo = view.getUint32(pos + 12);
    size = hi * 2 ** 32 + lo;
    body = pos + 16;
  } else if (size === 0) {
    size = limit - pos;
  }
  if (size < 8 || pos + size > limit) return null;
  return { type: t, start: pos, size, body };
}

function children(view: DataView, box: Box): Box[] {
  const out: Box[] = [];
  let pos = box.body;
  const end = box.start + box.size;
  while (pos < end) {
    const b = readBox(view, pos, end);
    if (!b) break;
    out.push(b);
    pos = b.start + b.size;
  }
  return out;
}

function find(view: DataView, box: Box, type: string): Box | null {
  for (const c of children(view, box)) if (c.type === type) return c;
  return null;
}

function findPath(view: DataView, box: Box, path: string[]): Box | null {
  let cur: Box | null = box;
  for (const p of path) {
    if (!cur) return null;
    cur = find(view, cur, p);
  }
  return cur;
}

function hex2(n: number) {
  return n.toString(16).padStart(2, "0");
}

/** Localiza o box `moov` lendo apenas os cabeçalhos de nível superior. */
async function readMoov(file: File): Promise<ArrayBuffer | null> {
  let pos = 0;
  const size = file.size;
  while (pos + 8 <= size) {
    const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    if (head.byteLength < 8) return null;
    let boxSize = head.getUint32(0);
    const type = String.fromCharCode(
      head.getUint8(4),
      head.getUint8(5),
      head.getUint8(6),
      head.getUint8(7),
    );
    let header = 8;
    if (boxSize === 1) {
      if (head.byteLength < 16) return null;
      boxSize = head.getUint32(8) * 2 ** 32 + head.getUint32(12);
      header = 16;
    } else if (boxSize === 0) {
      boxSize = size - pos;
    }
    if (boxSize < header) return null;
    if (type === "moov") return await file.slice(pos, pos + boxSize).arrayBuffer();
    pos += boxSize;
  }
  return null;
}

function parseVideoTrack(view: DataView, moov: Box): Mp4Track | null {
  for (const trak of children(view, moov).filter((b) => b.type === "trak")) {
    const hdlr = findPath(view, trak, ["mdia", "hdlr"]);
    if (!hdlr) continue;
    const handler = String.fromCharCode(
      view.getUint8(hdlr.body + 8),
      view.getUint8(hdlr.body + 9),
      view.getUint8(hdlr.body + 10),
      view.getUint8(hdlr.body + 11),
    );
    if (handler !== "vide") continue;

    const mdhd = findPath(view, trak, ["mdia", "mdhd"]);
    if (!mdhd) continue;
    const version = view.getUint8(mdhd.body);
    const timescale = version === 1 ? view.getUint32(mdhd.body + 20) : view.getUint32(mdhd.body + 12);
    const durRaw =
      version === 1
        ? view.getUint32(mdhd.body + 24) * 2 ** 32 + view.getUint32(mdhd.body + 28)
        : view.getUint32(mdhd.body + 16);
    if (!timescale) continue;

    const stbl = findPath(view, trak, ["mdia", "minf", "stbl"]);
    if (!stbl) continue;

    const stsd = find(view, stbl, "stsd");
    if (!stsd) continue;
    const entry = readBox(view, stsd.body + 8, stsd.start + stsd.size);
    if (!entry) continue;
    const fmt = entry.type;
    // VisualSampleEntry: 6 reserved + 2 dri + 16 pre + w/h
    const width = view.getUint16(entry.body + 24);
    const height = view.getUint16(entry.body + 26);
    let codec = "";
    let description: Uint8Array | undefined;
    if (fmt === "avc1" || fmt === "avc3") {
      const avcC = children(view, { ...entry, body: entry.body + 78 }).find((b) => b.type === "avcC");
      if (!avcC) continue;
      const p = avcC.body;
      codec = `${fmt}.${hex2(view.getUint8(p + 1))}${hex2(view.getUint8(p + 2))}${hex2(view.getUint8(p + 3))}`;
      description = new Uint8Array(view.buffer, view.byteOffset + p, avcC.start + avcC.size - p);
    } else {
      // outros codecs (HEVC/VP9/AV1) seguem pelo caminho de fallback
      continue;
    }

    // ---- tabelas de amostras ----
    const stts = find(view, stbl, "stts");
    const stsz = find(view, stbl, "stsz");
    const stsc = find(view, stbl, "stsc");
    const stco = find(view, stbl, "stco") ?? find(view, stbl, "co64");
    if (!stts || !stsz || !stsc || !stco) continue;
    const ctts = find(view, stbl, "ctts");
    const stss = find(view, stbl, "stss");

    // deltas de tempo
    const dts: number[] = [];
    const delta: number[] = [];
    {
      const n = view.getUint32(stts.body + 4);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const count = view.getUint32(stts.body + 8 + i * 8);
        const d = view.getUint32(stts.body + 12 + i * 8);
        for (let j = 0; j < count; j++) {
          dts.push(t);
          delta.push(d);
          t += d;
        }
      }
    }
    const total = dts.length;
    if (!total) continue;

    // offsets de composição
    const cOff = new Int32Array(total);
    if (ctts) {
      const n = view.getUint32(ctts.body + 4);
      let k = 0;
      for (let i = 0; i < n && k < total; i++) {
        const count = view.getUint32(ctts.body + 8 + i * 8);
        const off = view.getInt32(ctts.body + 12 + i * 8);
        for (let j = 0; j < count && k < total; j++) cOff[k++] = off;
      }
    }

    // tamanhos
    const sizes = new Uint32Array(total);
    {
      const uniform = view.getUint32(stsz.body + 4);
      if (uniform) sizes.fill(uniform);
      else for (let i = 0; i < total; i++) sizes[i] = view.getUint32(stsz.body + 12 + i * 4);
    }

    // sync samples
    let syncSet: Set<number> | null = null;
    if (stss) {
      syncSet = new Set<number>();
      const n = view.getUint32(stss.body + 4);
      for (let i = 0; i < n; i++) syncSet.add(view.getUint32(stss.body + 8 + i * 4) - 1);
    }

    // chunks
    const is64 = stco.type === "co64";
    const chunkCount = view.getUint32(stco.body + 4);
    const chunkOffset = (i: number) =>
      is64
        ? view.getUint32(stco.body + 8 + i * 8) * 2 ** 32 + view.getUint32(stco.body + 12 + i * 8)
        : view.getUint32(stco.body + 8 + i * 4);

    const scCount = view.getUint32(stsc.body + 4);
    const sc: { first: number; per: number }[] = [];
    for (let i = 0; i < scCount; i++) {
      sc.push({
        first: view.getUint32(stsc.body + 8 + i * 12) - 1,
        per: view.getUint32(stsc.body + 12 + i * 12),
      });
    }
    if (!sc.length) continue;

    const samples: Mp4Sample[] = [];
    let sample = 0;
    for (let c = 0; c < chunkCount && sample < total; c++) {
      let per = sc[sc.length - 1]!.per;
      for (let i = 0; i < sc.length; i++) {
        const next = sc[i + 1];
        if (c >= sc[i]!.first && (!next || c < next.first)) {
          per = sc[i]!.per;
          break;
        }
      }
      let off = chunkOffset(c);
      for (let j = 0; j < per && sample < total; j++) {
        samples.push({
          offset: off,
          size: sizes[sample]!,
          cts: (dts[sample]! + cOff[sample]!) / timescale,
          duration: delta[sample]! / timescale,
          sync: syncSet ? syncSet.has(sample) : true,
        });
        off += sizes[sample]!;
        sample++;
      }
    }
    if (samples.length < 2) continue;
    samples.sort((a, b) => a.cts - b.cts || a.offset - b.offset);
    // alinha ao mesmo referencial do <video> (primeiro quadro em t=0)
    const base = samples[0]!.cts;
    if (base > 0) for (const s of samples) s.cts -= base;

    return {
      codec,
      description,
      width,
      height,
      duration: durRaw / timescale,
      samples,
    };
  }
  return null;
}

/** Retorna a trilha de vídeo (H.264) do arquivo, ou null quando não suportado. */
export async function demuxMp4(file: File): Promise<Mp4Track | null> {
  try {
    const moovBuf = await readMoov(file);
    if (!moovBuf) return null;
    const view = new DataView(moovBuf);
    const moov = readBox(view, 0, moovBuf.byteLength);
    if (!moov || moov.type !== "moov") return null;
    void CONTAINERS;
    return parseVideoTrack(view, moov);
  } catch {
    return null;
  }
}
