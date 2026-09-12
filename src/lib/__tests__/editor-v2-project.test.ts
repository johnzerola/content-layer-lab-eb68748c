import { describe, expect, it } from "vitest";
import { AddClipCommand, CompositionClock, EditorCommandBus, SplitClipCommand, TrimClipCommand, asProjectTime, createEditorProjectV2, projectToSourceTime, sourceToProjectTime, type Clip } from "@/lib/editor-v2";

function clip(): Clip {
  return { id: "clip-1", kind: "video", trackId: "track-video", name: "Fixture", projectStart: asProjectTime(2), projectEnd: asProjectTime(12), sourceIn: 5, sourceOut: 15, playbackRate: 1, enabled: true, effects: [], animations: [] };
}

describe("EditorProjectV2", () => {
  it("serializa sem perder o contrato", () => {
    const project = createEditorProjectV2({ id: "fixture-v2", duration: 12 });
    const restored = JSON.parse(JSON.stringify(project));
    expect(restored).toEqual(project);
    expect(restored.version).toBe(2);
    expect(restored.tracks.map((track: { kind: string }) => track.kind)).toEqual(["video", "overlay", "captions", "voice", "music", "sfx"]);
  });
});

describe("ProjectTime e CompositionClock", () => {
  it("mapeia projectTime e sourceTime nos dois sentidos", () => {
    expect(projectToSourceTime(clip(), asProjectTime(7))).toBe(10);
    expect(sourceToProjectTime(clip(), 10)).toBe(7);
    expect(projectToSourceTime(clip(), asProjectTime(1))).toBeNull();
  });

  it("publica o clip ativo sem criar um segundo relógio", () => {
    const clock = new CompositionClock(() => [clip()]);
    expect(clock.seek(8)).toMatchObject({ projectTime: 8, sourceTime: 11, activeClipId: "clip-1" });
    clock.play();
    expect(clock.tick(0.5).projectTime).toBe(8.5);
  });
});

describe("Command bus", () => {
  it("faz split com undo e redo", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new SplitClipCommand("clip-1", 7, "clip-2"));
    expect(bus.getState().tracks[0]!.clips.map((item) => [item.id, item.sourceIn, item.sourceOut])).toEqual([
      ["clip-1", 5, 10], ["clip-2", 10, 15],
    ]);
    bus.undo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(1);
    bus.redo();
    expect(bus.getState().tracks[0]!.clips).toHaveLength(2);
  });

  it("faz trim com undo e preserva mapeamento da fonte", () => {
    const bus = new EditorCommandBus(createEditorProjectV2({ duration: 12 }));
    bus.execute(new AddClipCommand(clip()));
    bus.execute(new TrimClipCommand("clip-1", 4, 10));
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 4, projectEnd: 10, sourceIn: 7, sourceOut: 13 });
    bus.undo();
    expect(bus.getState().tracks[0]!.clips[0]).toMatchObject({ projectStart: 2, projectEnd: 12, sourceIn: 5, sourceOut: 15 });
  });
});

