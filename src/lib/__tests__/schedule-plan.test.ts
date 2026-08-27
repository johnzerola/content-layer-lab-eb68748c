import { describe, expect, it } from "vitest";
import {
  autoSlots,
  buildSchedulePlan,
  daySlots,
  groupPlanByDay,
  mediaTypeOf,
  sortByName,
} from "@/lib/schedule-plan";

const start = new Date(2026, 8, 1, 0, 0, 0, 0); // 01/09/2026
const now = new Date(2026, 7, 31, 12, 0, 0, 0);

describe("autoSlots", () => {
  it("espalha os horários dentro da janela", () => {
    expect(autoSlots(3, "08:00", "20:00")).toEqual(["08:00", "14:00", "20:00"]);
  });

  it("usa o início da janela quando é um post por dia", () => {
    expect(autoSlots(1, "09:30", "22:00")).toEqual(["09:30"]);
  });
});

describe("daySlots", () => {
  it("ordena horários fixos e repete para completar a quantidade", () => {
    expect(daySlots({ start, perDay: 4, mode: "fixed", times: ["19:00", "09:00", "13:00"] })).toEqual([
      "09:00",
      "13:00",
      "19:00",
      "09:00",
    ]);
  });

  it("cai no automático quando não há horários válidos", () => {
    expect(daySlots({ start, perDay: 2, mode: "fixed", times: ["xx"], windowStart: "10:00", windowEnd: "18:00" })).toEqual([
      "10:00",
      "18:00",
    ]);
  });
});

describe("buildSchedulePlan", () => {
  it("divide 30 itens em 3 por dia = 10 dias", () => {
    const plan = buildSchedulePlan(30, {
      start,
      perDay: 3,
      mode: "fixed",
      times: ["09:00", "13:00", "19:00"],
      now,
    });
    expect(plan).toHaveLength(30);
    expect(groupPlanByDay(plan)).toHaveLength(10);
    expect(plan[0]?.getHours()).toBe(9);
    expect(plan[2]?.getHours()).toBe(19);
    expect(plan[3]?.getDate()).toBe(2);
  });

  it("lida com sobra (7 itens, 3 por dia)", () => {
    const plan = buildSchedulePlan(7, { start, perDay: 3, mode: "auto", windowStart: "08:00", windowEnd: "20:00", now });
    const days = groupPlanByDay(plan);
    expect(plan).toHaveLength(7);
    expect(days).toHaveLength(3);
    expect(days[2]?.items).toHaveLength(1);
  });

  it("pula dias da semana não permitidos", () => {
    const plan = buildSchedulePlan(2, {
      start,
      perDay: 1,
      mode: "fixed",
      times: ["10:00"],
      weekdays: [1], // apenas segundas
      now,
    });
    expect(plan[0]?.getDay()).toBe(1);
    expect(plan[1]?.getDay()).toBe(1);
    expect(plan[1]!.getTime() - plan[0]!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("ignora horários já passados quando começa hoje", () => {
    const today = new Date(2026, 7, 31, 0, 0, 0, 0);
    const plan = buildSchedulePlan(2, {
      start: today,
      perDay: 2,
      mode: "fixed",
      times: ["09:00", "18:00"],
      now,
    });
    expect(plan[0]?.getHours()).toBe(18);
    expect(plan[0]?.getDate()).toBe(31);
    expect(plan[1]?.getDate()).toBe(1);
  });
});

describe("ordenação e tipo de mídia", () => {
  it("ordena por nome numericamente", () => {
    const sorted = sortByName([{ name: "video10.mp4" }, { name: "video2.mp4" }, { name: "video1.mp4" }]);
    expect(sorted.map((f) => f.name)).toEqual(["video1.mp4", "video2.mp4", "video10.mp4"]);
  });

  it("detecta imagem por mime ou extensão", () => {
    expect(mediaTypeOf({ type: "image/jpeg", name: "a.jpg" })).toBe("image");
    expect(mediaTypeOf({ type: "", name: "a.PNG" })).toBe("image");
    expect(mediaTypeOf({ type: "video/mp4", name: "a.mp4" })).toBe("video");
  });
});
