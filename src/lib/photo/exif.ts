/**
 * Escrita e leitura mínima de EXIF em JPEG.
 * Usado para entregar a foto com metadados novos depois de descartar os originais.
 */

export interface PhotoExif {
  make: string;
  model: string;
  software: string;
  dateTime: Date;
  artist?: string | undefined;
  copyright?: string | undefined;
  orientation?: number | undefined;
  gps?: { lat: number; lon: number } | undefined;
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  value: Uint8Array;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 };

function ascii(text: string): Uint8Array {
  const clean = text.replace(/[^\x20-\x7e]/g, "");
  const out = new Uint8Array(clean.length + 1);
  for (let i = 0; i < clean.length; i += 1) out[i] = clean.charCodeAt(i);
  return out;
}

function short(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  new DataView(buf.buffer).setUint16(0, value, true);
  return buf;
}

function long(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value >>> 0, true);
  return buf;
}

function rational(num: number, den: number): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(0, Math.round(num), true);
  view.setUint32(4, Math.round(den), true);
  return buf;
}

function rationals(values: [number, number][]): Uint8Array {
  const out = new Uint8Array(values.length * 8);
  values.forEach(([n, d], i) => out.set(rational(n, d), i * 8));
  return out;
}

function exifDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}:${p(date.getMonth() + 1)}:${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function entrySize(entry: Entry) {
  return (TYPE_SIZE[entry.type] ?? 1) * entry.count;
}

function ifdSize(entries: Entry[]) {
  const header = 2 + entries.length * 12 + 4;
  const data = entries.reduce((n, e) => {
    const size = entrySize(e);
    return n + (size > 4 ? size + (size % 2) : 0);
  }, 0);
  return { header, data, total: header + data };
}

/** Escreve um IFD e devolve os bytes; offsets são relativos ao início do TIFF. */
function writeIfd(entries: Entry[], ifdOffset: number, nextIfd = 0): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const { header, total } = ifdSize(sorted);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, sorted.length, true);
  let dataCursor = header;
  sorted.forEach((entry, i) => {
    const base = 2 + i * 12;
    view.setUint16(base, entry.tag, true);
    view.setUint16(base + 2, entry.type, true);
    view.setUint32(base + 4, entry.count, true);
    const size = entrySize(entry);
    if (size > 4) {
      view.setUint32(base + 8, ifdOffset + dataCursor, true);
      out.set(entry.value.subarray(0, size), dataCursor);
      dataCursor += size + (size % 2);
    } else {
      out.set(entry.value.subarray(0, size), base + 8);
    }
  });
  view.setUint32(2 + sorted.length * 12, nextIfd, true);
  return out;
}

function gpsEntries(lat: number, lon: number): Entry[] {
  const dms = (deg: number): [number, number][] => {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = (abs - d - m / 60) * 3600;
    return [
      [d, 1],
      [m, 1],
      [Math.round(s * 100), 100],
    ];
  };
  return [
    { tag: 0x0000, type: 1, count: 4, value: new Uint8Array([2, 3, 0, 0]) },
    { tag: 0x0001, type: 2, count: 2, value: ascii(lat >= 0 ? "N" : "S") },
    { tag: 0x0002, type: 5, count: 3, value: rationals(dms(lat)) },
    { tag: 0x0003, type: 2, count: 2, value: ascii(lon >= 0 ? "E" : "W") },
    { tag: 0x0004, type: 5, count: 3, value: rationals(dms(lon)) },
  ];
}

/** Monta o payload do segmento APP1 ("Exif\0\0" + TIFF). */
export function buildExifApp1(meta: PhotoExif): Uint8Array {
  const stamp = ascii(exifDate(meta.dateTime));

  const exifIfd: Entry[] = [
    { tag: 0x9003, type: 2, count: stamp.length, value: stamp },
    { tag: 0x9004, type: 2, count: stamp.length, value: stamp },
    { tag: 0xa000, type: 7, count: 4, value: new Uint8Array([0x30, 0x32, 0x33, 0x30]) },
  ];
  const gps = meta.gps ? gpsEntries(meta.gps.lat, meta.gps.lon) : [];

  const zero: Entry[] = [
    { tag: 0x010f, type: 2, count: ascii(meta.make).length, value: ascii(meta.make) },
    { tag: 0x0110, type: 2, count: ascii(meta.model).length, value: ascii(meta.model) },
    { tag: 0x0112, type: 3, count: 1, value: short(meta.orientation ?? 1) },
    { tag: 0x0131, type: 2, count: ascii(meta.software).length, value: ascii(meta.software) },
    { tag: 0x0132, type: 2, count: stamp.length, value: stamp },
  ];
  if (meta.artist) {
    zero.push({ tag: 0x013b, type: 2, count: ascii(meta.artist).length, value: ascii(meta.artist) });
  }
  if (meta.copyright) {
    zero.push({
      tag: 0x8298,
      type: 2,
      count: ascii(meta.copyright).length,
      value: ascii(meta.copyright),
    });
  }
  // ponteiros (valores reais preenchidos depois do cálculo de layout)
  zero.push({ tag: 0x8769, type: 4, count: 1, value: long(0) });
  if (gps.length) zero.push({ tag: 0x8825, type: 4, count: 1, value: long(0) });

  const zeroTotal = ifdSize(zero).total;
  const exifOffset = 8 + zeroTotal;
  const gpsOffset = exifOffset + ifdSize(exifIfd).total;

  const pointerExif = zero.find((e) => e.tag === 0x8769)!;
  pointerExif.value = long(exifOffset);
  const pointerGps = zero.find((e) => e.tag === 0x8825);
  if (pointerGps) pointerGps.value = long(gpsOffset);

  const tiff: Uint8Array[] = [
    new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
    writeIfd(zero, 8),
    writeIfd(exifIfd, exifOffset),
  ];
  if (gps.length) tiff.push(writeIfd(gps, gpsOffset));

  const tiffLength = tiff.reduce((n, part) => n + part.length, 0);
  const payload = new Uint8Array(6 + tiffLength);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  let cursor = 6;
  for (const part of tiff) {
    payload.set(part, cursor);
    cursor += part.length;
  }
  return payload;
}

/** Remove APP1/APP2 antigos e injeta o EXIF novo logo depois do SOI. */
export function injectExifIntoJpeg(jpeg: ArrayBuffer, meta: PhotoExif): Uint8Array {
  const src = new Uint8Array(jpeg);
  if (src[0] !== 0xff || src[1] !== 0xd8) return src;

  const keep: Uint8Array[] = [];
  let i = 2;
  while (i + 3 < src.length) {
    if (src[i] !== 0xff) break;
    const marker = src[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) break; // início dos dados comprimidos
    const length = (src[i + 2]! << 8) | src[i + 3]!;
    const segment = src.subarray(i, i + 2 + length);
    const isMetadata = marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xee;
    if (!isMetadata) keep.push(segment);
    i += 2 + length;
  }
  const rest = src.subarray(i);

  const payload = buildExifApp1(meta);
  const app1 = new Uint8Array(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = ((payload.length + 2) >> 8) & 0xff;
  app1[3] = (payload.length + 2) & 0xff;
  app1.set(payload, 4);

  const size =
    2 + app1.length + keep.reduce((n, segment) => n + segment.length, 0) + rest.length;
  const out = new Uint8Array(size);
  out.set([0xff, 0xd8], 0);
  let cursor = 2;
  out.set(app1, cursor);
  cursor += app1.length;
  for (const segment of keep) {
    out.set(segment, cursor);
    cursor += segment.length;
  }
  out.set(rest, cursor);
  return out;
}

export interface ReadExif {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  hasGps: boolean;
}

/** Leitura simples (little-endian) só para conferência e testes. */
export function readExifFromJpeg(bytes: Uint8Array): ReadExif | null {
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xda) return null;
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker === 0xe1) {
      const tiffStart = i + 4 + 6;
      const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart);
      const little = view.getUint16(0, true) === 0x4949;
      const ifd0 = view.getUint32(4, little);
      const count = view.getUint16(ifd0, little);
      const out: ReadExif = { hasGps: false };
      for (let e = 0; e < count; e += 1) {
        const base = ifd0 + 2 + e * 12;
        const tag = view.getUint16(base, little);
        const size = view.getUint32(base + 4, little);
        const inline = size <= 4;
        const offset = inline ? base + 8 : view.getUint32(base + 8, little);
        const text = () => {
          let value = "";
          for (let c = 0; c < size - 1; c += 1) value += String.fromCharCode(view.getUint8(offset + c));
          return value;
        };
        if (tag === 0x010f) out.make = text();
        if (tag === 0x0110) out.model = text();
        if (tag === 0x0131) out.software = text();
        if (tag === 0x0132) out.dateTime = text();
        if (tag === 0x8825) out.hasGps = true;
      }
      return out;
    }
    i += 2 + length;
  }
  return null;
}
