import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElevenLabsError,
  assertElevenLabsEncryptionConfigured,
  elevenLabsStorageError,
  fetchElevenLabsVoices,
  synthesizeElevenLabs,
} from "@/lib/elevenlabs.server";
import {
  attachElevenLabsVoice,
  attachPreset,
  effectiveVoice,
} from "@/lib/chatscene/voice-resolution";
import { createChatSceneProject, createMessage, createParticipant } from "@/lib/chatscene/types";
import { PROVIDER_CAPABILITIES } from "@/lib/chatscene/voice-providers";

afterEach(() => vi.useRealTimers());

const synthesisInput = {
  apiKey: "private-api-key",
  voiceId: "voice-1",
  text: "Oi, tudo bem?",
  speed: 1.04,
  stability: 0.38,
  similarityBoost: 0.78,
  style: 0.42,
  speakerBoost: true,
  modelId: "eleven_flash_v2_5",
};

describe("ElevenLabs server adapter", () => {
  it("lists only safe voice metadata and authenticates by header", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          voices: [
            {
              voice_id: "voice-1",
              name: "Adam",
              category: "premade",
              description: "Conversational",
              labels: { gender: "male", accent: "american" },
              secret_internal_field: "never-return-this",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const voices = await fetchElevenLabsVoices("private-api-key", request);

    expect(voices).toEqual([
      {
        id: "voice-1",
        name: "Adam",
        category: "premade",
        description: "Conversational",
        labels: { gender: "male", accent: "american" },
      },
    ]);
    const [, init] = request.mock.calls[0]!;
    expect(new Headers(init.headers).get("xi-api-key")).toBe("private-api-key");
    expect(String(request.mock.calls[0]![0])).not.toContain("private-api-key");
    expect(JSON.stringify(voices)).not.toContain("private-api-key");
  });

  it("maps an invalid key to an actionable error without leaking provider response", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: "secret provider diagnostic" }), { status: 401 }),
      );

    await expect(fetchElevenLabsVoices("bad-private-key", request)).rejects.toMatchObject({
      code: "INVALID_KEY",
      message: "A chave da ElevenLabs não é válida.",
    } satisfies Partial<ElevenLabsError>);
  });

  it("follows catalog cursors and deduplicates voices across pages", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voices: [{ voice_id: "one", name: "One" }],
            has_more: true,
            next_page_token: "next /?token",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voices: [
              { voice_id: "one", name: "One" },
              { voice_id: "two", name: "Two" },
            ],
            has_more: false,
          }),
        ),
      );
    const voices = await fetchElevenLabsVoices("private-api-key", request);
    expect(voices.map((voice) => voice.id)).toEqual(["one", "two"]);
    expect(new URL(request.mock.calls[1]![0]).searchParams.get("next_page_token")).toBe(
      "next /?token",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects repeated pagination cursors rather than looping or returning a partial catalog", async () => {
    const request = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            voices: [{ voice_id: "one", name: "One" }],
            has_more: true,
            next_page_token: "same",
          }),
        ),
    );
    await expect(fetchElevenLabsVoices("private-api-key", request)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("sends the curated PT-BR voice settings and returns the audio bytes", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );

    const audio = await synthesizeElevenLabs({
      apiKey: "private-api-key",
      voiceId: "voice-1",
      text: "Oi, tudo bem?",
      speed: 1.04,
      stability: 0.38,
      similarityBoost: 0.78,
      style: 0.42,
      speakerBoost: true,
      modelId: "eleven_flash_v2_5",
      request,
    });

    expect([...audio]).toEqual([1, 2, 3]);
    const [url, init] = request.mock.calls[0]!;
    expect(url).toContain("/v1/text-to-speech/voice-1");
    expect(JSON.parse(init.body)).toMatchObject({
      language_code: "pt",
      model_id: "eleven_flash_v2_5",
      voice_settings: { speed: 1.04, stability: 0.38, similarity_boost: 0.78 },
    });
  });

  it("clamps the shared project's 1.3 speed to ElevenLabs' 1.2 maximum", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    await synthesizeElevenLabs({ ...synthesisInput, speed: 1.3, request });
    const [, init] = request.mock.calls[0]!;
    expect(JSON.parse(init.body).voice_settings.speed).toBe(1.2);
  });

  it.each([401, 403, 429])(
    "preserves a provider error instead of substituting another voice (%s)",
    async (status) => {
      const request = vi.fn().mockResolvedValue(new Response("private diagnostic", { status }));
      await expect(synthesizeElevenLabs({ ...synthesisInput, request })).rejects.toBeInstanceOf(
        ElevenLabsError,
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects an empty or non-audio success response", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response('{"private":"diagnostic"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(synthesizeElevenLabs({ ...synthesisInput, request })).rejects.toMatchObject({
      code: "INVALID_AUDIO",
    });
    await expect(synthesizeElevenLabs({ ...synthesisInput, request })).rejects.toMatchObject({
      code: "INVALID_AUDIO",
    });
  });

  it("does not report a malformed catalog as a successfully connected empty account", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response('{"detail":"private diagnostic"}', { status: 200 }));
    await expect(fetchElevenLabsVoices("private-api-key", request)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("aborts slow catalog requests with a safe actionable error", async () => {
    vi.useFakeTimers();
    const request = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("private diagnostic", "AbortError")),
          );
        }),
    );
    const result = expect(
      fetchElevenLabsVoices("private-api-key", request as typeof fetch),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(request.mock.calls[0]![1].signal?.aborted).toBe(true);
  });

  it("distinguishes missing secure storage from a disconnected user", () => {
    expect(() => assertElevenLabsEncryptionConfigured({})).toThrow(ElevenLabsError);
    expect(() =>
      assertElevenLabsEncryptionConfigured({ SOCIAL_TOKEN_ENCRYPTION_KEY: "a".repeat(32) }),
    ).not.toThrow();
    expect(elevenLabsStorageError({ code: "42P01" })).toMatchObject({ code: "SERVER_CONFIG" });
    expect(elevenLabsStorageError({ code: "42501" })).toMatchObject({ code: "SERVER_CONFIG" });
    expect(elevenLabsStorageError({ code: "other" })).toMatchObject({ code: "UNAVAILABLE" });
  });
});

describe("ElevenLabs casting", () => {
  it("clears the external provider, voice name and settings when selecting an internal preset", () => {
    const project = createChatSceneProject({
      participants: [createParticipant({ id: "ana" }), createParticipant({ id: "pedro" })],
      messages: [
        createMessage("ana", { text: "Oi!", voiceMs: 800 }),
        createMessage("pedro", { text: "Olá!", voiceMs: 700 }),
      ],
    });
    const connected = attachElevenLabsVoice(project, "ana", {
      id: "external-voice",
      name: "Minha voz",
    });
    expect(effectiveVoice(connected, connected.messages[0]!)!.profile).toMatchObject({
      provider: "elevenlabs",
      providerVoiceId: "external-voice",
    });
    const internal = attachPreset(connected, "ana", "adult-male-casual");
    const profile = effectiveVoice(internal, internal.messages[0]!)!.profile;
    expect(profile.provider).toBe("lovable-ai");
    expect(profile.providerVoiceId).not.toBe("external-voice");
    expect(profile.name).not.toContain("ElevenLabs");
    expect(profile.providerSettings).toBeUndefined();
    expect(internal.messages[0]!.voiceMs).toBeNull();
    expect(internal.messages[1]).toBe(project.messages[1]);
  });

  it("does not advertise emotion directions or expression sliders that the adapter ignores", () => {
    expect(PROVIDER_CAPABILITIES["elevenlabs"]!.controls).toMatchObject({
      speed: true,
      pitch: true,
      emotion: false,
      expressiveness: false,
    });
  });
});
