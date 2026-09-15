import { describe, expect, it } from "vitest";
import { buildPlan } from "../clock";
import { cameraAt, DEFAULT_CAMERA } from "../camera";
import { createChatSceneProject } from "../types";

const project = createChatSceneProject();
const plan = buildPlan(project);

describe("câmera da cena", () => {
  it("fica parada quando está desligada", () => {
    const shot = cameraAt({ mode: "off", intensity: 1 }, plan, 40);
    expect(shot.scale).toBe(1);
  });

  it("é determinística: mesmo quadro, mesmo enquadramento", () => {
    const a = cameraAt({ mode: "cuts", intensity: 0.8 }, plan, 90);
    const b = cameraAt({ mode: "cuts", intensity: 0.8 }, plan, 90);
    expect(a).toEqual(b);
  });

  it("aproxima em algum momento no modo com cortes", () => {
    const frames = [10, 40, 90, 150, 220];
    const zooms = frames.map((f) => cameraAt({ mode: "cuts", intensity: 0.8 }, plan, f).scale);
    expect(Math.max(...zooms)).toBeGreaterThan(1.1);
  });

  it("o modo suave cresce o zoom depois que a bolha entra", () => {
    const entry = plan.entries[1]!;
    const early = cameraAt({ mode: "smooth", intensity: 1 }, plan, entry.appearFrame);
    const later = cameraAt({ mode: "smooth", intensity: 1 }, plan, entry.appearFrame + 15);
    expect(later.scale).toBeGreaterThan(early.scale);
  });

  it("o padrão do projeto é câmera parada", () => {
    expect(DEFAULT_CAMERA.mode).toBe("off");
  });
});
