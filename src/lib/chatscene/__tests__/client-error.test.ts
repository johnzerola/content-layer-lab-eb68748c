import { describe, expect, it } from "vitest";
import {
  CHATSCENE_SERVER_DISCONNECTED,
  chatSceneClientError,
} from "../client-error";

describe("ChatScene client errors", () => {
  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource", "fetch failed"])(
    "turns a transport failure into a recovery message: %s",
    (message) => {
      expect(chatSceneClientError(new TypeError(message), "Falha genérica")).toBe(
        CHATSCENE_SERVER_DISCONNECTED,
      );
    },
  );

  it("preserves useful validation returned by the server", () => {
    expect(chatSceneClientError(new Error("A IA não está configurada neste projeto."), "Falha"))
      .toBe("A IA não está configurada neste projeto.");
  });

  it("uses the contextual fallback for an unknown failure", () => {
    expect(chatSceneClientError(null, "Não foi possível gerar as vozes.")).toBe(
      "Não foi possível gerar as vozes.",
    );
  });
});
