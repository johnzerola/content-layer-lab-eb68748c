import { describe, expect, it } from "vitest";
import { buildExifApp1, injectExifIntoJpeg, readExifFromJpeg } from "@/lib/photo/exif";
import {
  buildPhotoVariation,
  hashSeed,
  pickCameraIdentity,
  randomPhotoName,
} from "@/lib/photo/variation";

/** JPEG mínimo: SOI + APP1 falso (metadado antigo) + SOS + EOI. */
function fakeJpeg(): ArrayBuffer {
  const old = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const bytes = new Uint8Array([0xff, 0xd8, ...old, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
  return bytes.buffer;
}

describe("EXIF das fotos", () => {
  const meta = {
    make: "Apple",
    model: "iPhone 15 Pro",
    software: "17.4.1",
    dateTime: new Date(2026, 2, 14, 9, 30, 15),
  };

  it("monta um bloco APP1 com assinatura Exif e TIFF little-endian", () => {
    const app1 = buildExifApp1(meta);
    expect(Array.from(app1.subarray(0, 6))).toEqual([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    expect(Array.from(app1.subarray(6, 10))).toEqual([0x49, 0x49, 0x2a, 0x00]);
  });

  it("substitui os metadados antigos e permite reler os novos", () => {
    const out = injectExifIntoJpeg(fakeJpeg(), meta);
    const read = readExifFromJpeg(out);
    expect(read?.make).toBe("Apple");
    expect(read?.model).toBe("iPhone 15 Pro");
    expect(read?.software).toBe("17.4.1");
    expect(read?.dateTime).toBe("2026:03:14 09:30:15");
    expect(read?.hasGps).toBe(false);
    // só um APP1 no arquivo final
    let count = 0;
    for (let i = 0; i < out.length - 1; i += 1) {
      if (out[i] === 0xff && out[i + 1] === 0xe1) count += 1;
    }
    expect(count).toBe(1);
  });

  it("grava GPS quando solicitado", () => {
    const out = injectExifIntoJpeg(fakeJpeg(), { ...meta, gps: { lat: -23.55, lon: -46.63 } });
    expect(readExifFromJpeg(out)?.hasGps).toBe(true);
  });
});

describe("anti-duplicidade de fotos", () => {
  it("é determinística por semente", () => {
    const a = buildPhotoVariation(hashSeed("foto-1"), 0.6);
    const b = buildPhotoVariation(hashSeed("foto-1"), 0.6);
    expect(a).toEqual(b);
  });

  it("gera parâmetros diferentes para sementes diferentes", () => {
    const a = buildPhotoVariation(hashSeed("foto-1"), 0.6);
    const b = buildPhotoVariation(hashSeed("foto-2"), 0.6);
    expect(a.rotate).not.toBe(b.rotate);
  });

  it("mantém as variações dentro de limites seguros", () => {
    for (let i = 0; i < 50; i += 1) {
      const v = buildPhotoVariation(hashSeed(`f${i}`), 1);
      expect(Math.abs(v.rotate)).toBeLessThanOrEqual(0.9);
      expect(v.crop).toBeLessThanOrEqual(0.05);
      expect(v.quality).toBeGreaterThanOrEqual(0.72);
      expect(v.quality).toBeLessThanOrEqual(0.95);
    }
  });

  it("espelha sempre quando o espelhamento está ligado", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(buildPhotoVariation(hashSeed(`mm${i}`), 1, true).mirror).toBe(true);
    }
  });

  it("não espelha quando o espelhamento está desligado", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(buildPhotoVariation(hashSeed(`m${i}`), 1, false).mirror).toBe(false);
    }
  });

  it("escolhe identidade de câmera plausível e nome neutro", () => {
    const identity = pickCameraIdentity(hashSeed("abc"));
    expect(identity.make.length).toBeGreaterThan(0);
    expect(identity.model.length).toBeGreaterThan(0);
    const name = randomPhotoName(hashSeed("abc"), "jpg", new Date(2026, 0, 5));
    expect(name).toMatch(/^IMG_20260105_\d{4}\.jpg$/);
  });
});
