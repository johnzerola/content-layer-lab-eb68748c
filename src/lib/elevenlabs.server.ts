import { decryptSocialToken, encryptSocialToken } from "@/lib/social-credentials.server";

const ELEVENLABS_API = "https://api.elevenlabs.io";
const CATALOG_TIMEOUT_MS = 20_000;
const SYNTHESIS_TIMEOUT_MS = 90_000;

export interface ElevenLabsVoice {
  id: string;
  name: string;
  category: string;
  description: string;
  labels: Record<string, string>;
}

export class ElevenLabsError extends Error {
  constructor(
    readonly code:
      | "INVALID_KEY"
      | "FORBIDDEN"
      | "QUOTA"
      | "UNAVAILABLE"
      | "NOT_CONNECTED"
      | "TIMEOUT"
      | "SERVER_CONFIG"
      | "INVALID_AUDIO",
    message: string,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

export function assertElevenLabsEncryptionConfigured(environment = process.env): void {
  if ((environment["SOCIAL_TOKEN_ENCRYPTION_KEY"]?.trim().length ?? 0) < 32) {
    throw new ElevenLabsError(
      "SERVER_CONFIG",
      "O servidor ainda precisa configurar a proteção das chaves de integração. Avise o administrador.",
    );
  }
}

export function elevenLabsStorageError(error: { code?: string }): ElevenLabsError {
  if (["42P01", "PGRST205", "42501"].includes(error.code ?? "")) {
    return new ElevenLabsError(
      "SERVER_CONFIG",
      "O armazenamento seguro das integrações ainda não está configurado no servidor. Avise o administrador.",
    );
  }
  return new ElevenLabsError(
    "UNAVAILABLE",
    "Não foi possível acessar sua conexão ElevenLabs. Tente novamente.",
  );
}

/** Bounds both the request and response body without exposing provider diagnostics or keys. */
async function withRequestTimeout<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (error instanceof ElevenLabsError) throw error;
    if (controller.signal.aborted) {
      throw new ElevenLabsError(
        "TIMEOUT",
        "A ElevenLabs demorou para responder. Aguarde alguns instantes e tente novamente.",
      );
    }
    throw new ElevenLabsError(
      "UNAVAILABLE",
      "Não foi possível acessar a ElevenLabs. Tente novamente em alguns instantes.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function providerError(status: number): ElevenLabsError {
  if (status === 401)
    return new ElevenLabsError("INVALID_KEY", "A chave da ElevenLabs não é válida.");
  if (status === 403)
    return new ElevenLabsError(
      "FORBIDDEN",
      "A chave não tem permissão para listar ou gerar vozes. Revise as restrições da chave.",
    );
  if (status === 429)
    return new ElevenLabsError(
      "QUOTA",
      "O limite de créditos ou de requisições da ElevenLabs foi atingido.",
    );
  if (status === 404 || status === 422)
    return new ElevenLabsError(
      "UNAVAILABLE",
      "Esta voz ou configuração não está disponível na sua conta ElevenLabs. Atualize o catálogo e escolha uma voz disponível.",
    );
  return new ElevenLabsError(
    "UNAVAILABLE",
    "A ElevenLabs não respondeu agora. Tente novamente em alguns instantes.",
  );
}

function asLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export async function fetchElevenLabsVoices(
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<ElevenLabsVoice[]> {
  return withRequestTimeout(CATALOG_TIMEOUT_MS, async (signal) => {
    const voices = new Map<string, ElevenLabsVoice>();
    const visitedTokens = new Set<string>();
    let nextToken: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${ELEVENLABS_API}/v2/voices`);
      url.searchParams.set("page_size", "100");
      url.searchParams.set("sort", "name");
      url.searchParams.set("include_total_count", "false");
      if (nextToken) url.searchParams.set("next_page_token", nextToken);
      const response = await request(url.toString(), {
        headers: { "xi-api-key": apiKey, Accept: "application/json" },
        signal,
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw providerError(response.status);
      }
      const payload = (await response.json()) as {
        voices?: unknown;
        has_more?: unknown;
        next_page_token?: unknown;
      };
      if (!Array.isArray(payload?.voices)) throw new Error("Invalid voice catalog");
      for (const item of payload.voices) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        if (typeof row["voice_id"] !== "string" || typeof row["name"] !== "string") continue;
        voices.set(row["voice_id"], {
          id: row["voice_id"],
          name: row["name"],
          category: typeof row["category"] === "string" ? row["category"] : "voice",
          description: typeof row["description"] === "string" ? row["description"] : "",
          labels: asLabels(row["labels"]),
        });
      }
      if (payload.has_more !== true) return [...voices.values()];
      if (
        typeof payload.next_page_token !== "string" ||
        !payload.next_page_token ||
        visitedTokens.has(payload.next_page_token)
      ) {
        throw new Error("Invalid voice catalog pagination");
      }
      nextToken = payload.next_page_token;
      visitedTokens.add(nextToken);
    }
    throw new Error("Voice catalog pagination limit exceeded");
  });
}

export async function saveElevenLabsCredential(input: {
  userId: string;
  apiKey: string;
  accountLabel: string;
  voiceCount: number;
}) {
  assertElevenLabsEncryptionConfigured();
  const encrypted = encryptSocialToken(input.apiKey);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_provider_credentials").upsert(
    {
      user_id: input.userId,
      provider: "elevenlabs",
      api_key_ciphertext: encrypted,
      masked_key: `••••••${input.apiKey.slice(-4)}`,
      account_label: input.accountLabel,
      metadata: { voiceCount: input.voiceCount, validatedAt: new Date().toISOString() },
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw elevenLabsStorageError(error);
}

export async function resolveElevenLabsApiKey(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_provider_credentials")
    .select("api_key_ciphertext")
    .eq("user_id", userId)
    .eq("provider", "elevenlabs")
    .maybeSingle();
  if (error) throw elevenLabsStorageError(error);
  if (!data?.api_key_ciphertext) {
    throw new ElevenLabsError(
      "NOT_CONNECTED",
      "Conecte sua conta ElevenLabs em Contas e credenciais.",
    );
  }
  assertElevenLabsEncryptionConfigured();
  try {
    return decryptSocialToken(data.api_key_ciphertext);
  } catch {
    throw new ElevenLabsError(
      "NOT_CONNECTED",
      "Não foi possível recuperar a chave salva. Reconecte sua ElevenLabs em Contas e credenciais.",
    );
  }
}

export async function synthesizeElevenLabs(input: {
  apiKey: string;
  voiceId: string;
  text: string;
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
  modelId: string;
  request?: typeof fetch;
}): Promise<Buffer> {
  return withRequestTimeout(SYNTHESIS_TIMEOUT_MS, async (signal) => {
    const request = input.request ?? fetch;
    const response = await request(
      `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal,
        redirect: "error",
        headers: {
          "xi-api-key": input.apiKey,
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          model_id: input.modelId,
          language_code: "pt",
          voice_settings: {
            stability: input.stability,
            similarity_boost: input.similarityBoost,
            style: input.style,
            use_speaker_boost: input.speakerBoost,
            speed: input.speed,
          },
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw providerError(response.status);
    }
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (
      contentType &&
      !contentType.startsWith("audio/") &&
      contentType !== "application/octet-stream"
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new ElevenLabsError(
        "INVALID_AUDIO",
        "A ElevenLabs não devolveu um áudio válido. Tente gerar a fala novamente.",
      );
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) {
      throw new ElevenLabsError(
        "INVALID_AUDIO",
        "A ElevenLabs devolveu um áudio vazio. Tente gerar a fala novamente.",
      );
    }
    return audio;
  });
}
