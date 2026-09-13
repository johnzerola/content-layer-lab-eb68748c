import { describe, expect, it } from "vitest";
import { applyJsonPatch, diffJson, jsonSize } from "../json-diff";

describe("json-diff", () => {
  it("retorna null quando os valores são iguais", () => {
    expect(diffJson({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBeNull();
    expect(diffJson("x", "x")).toBeNull();
  });

  it("captura campos alterados, adicionados e removidos", () => {
    const base = { a: 1, b: { c: "x", d: 2 }, gone: true };
    const next = { a: 1, b: { c: "y", d: 2 }, novo: [1] };
    const patch = diffJson(base, next);
    expect(patch).not.toBeNull();
    expect(applyJsonPatch(base, patch!)).toEqual(next);
  });

  it("substitui arrays inteiros em vez de diffar item a item", () => {
    const base = { list: [1, 2, 3] };
    const next = { list: [1, 9, 3, 4] };
    const patch = diffJson(base, next)!;
    expect(applyJsonPatch(base, patch)).toEqual(next);
  });

  it("lida com mudança de tipo (objeto vira string)", () => {
    const base = { v: { nested: 1 } };
    const next = { v: "texto" };
    expect(applyJsonPatch(base, diffJson(base, next)!)).toEqual(next);
  });

  it("diff de template típico fica muito menor que o snapshot", () => {
    const layers = Array.from({ length: 20 }, (_, i) => ({
      id: `l${i}`,
      type: "text",
      text: `Frase de exemplo número ${i} com bastante conteúdo repetido`,
      x: 10,
      y: 20,
      style: { font: "Outfit", size: 48, color: "#ffffff", weight: 700 },
    }));
    const base = { name: "Template", video: "v1", layers };
    const next = {
      ...base,
      layers: layers.map((l, i) => (i === 3 ? { ...l, text: "Texto editado" } : l)),
    };
    const patch = diffJson(base as never, next as never)!;
    expect(jsonSize(patch)).toBeLessThan(jsonSize(next) * 0.3);
    expect(applyJsonPatch(base as never, patch)).toEqual(next);
  });

  it("primitivos e null", () => {
    expect(applyJsonPatch(1 as never, diffJson(1 as never, 2 as never)!)).toBe(2);
    expect(applyJsonPatch(null, diffJson(null, { a: 1 })!)).toEqual({ a: 1 });
  });
});
