/** Saúde das conexões sociais e tradução de erros de publicação para linguagem simples. */

export type ConnectionLevel = "ok" | "warn" | "expired" | "missing";

export type ConnectionHealth = {
  level: ConnectionLevel;
  /** rótulo curto para badge */
  badge: string | null;
  /** frase explicativa */
  message: string | null;
  daysLeft: number | null;
};

export const EXPIRY_WARNING_DAYS = 7;

export function connectionHealth(input: {
  connectionStatus?: string | null;
  tokenExpiresAt?: string | null;
  accountStatus?: string | null;
  now?: number;
}): ConnectionHealth {
  const now = input.now ?? Date.now();
  const connected =
    input.connectionStatus === "conectado" ||
    input.connectionStatus === "connected" ||
    input.accountStatus === "conectado" ||
    input.accountStatus === "connected";

  if (!connected) {
    return {
      level: "missing",
      badge: "Conectar",
      message: "Esta conta ainda não tem conexão oficial ativa — a publicação automática não roda.",
      daysLeft: null,
    };
  }

  if (!input.tokenExpiresAt) {
    return { level: "ok", badge: null, message: null, daysLeft: null };
  }

  const expiresAt = new Date(input.tokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return { level: "ok", badge: null, message: null, daysLeft: null };
  }

  const msLeft = expiresAt - now;
  const daysLeft = Math.floor(msLeft / 86_400_000);

  if (msLeft <= 0) {
    return {
      level: "expired",
      badge: "Reconectar",
      message: "A conexão desta conta expirou. Reconecte para os agendamentos publicarem.",
      daysLeft: 0,
    };
  }

  if (msLeft <= EXPIRY_WARNING_DAYS * 86_400_000) {
    return {
      level: "warn",
      badge: daysLeft <= 0 ? "Expira hoje" : `Expira em ${daysLeft}d`,
      message:
        daysLeft <= 0
          ? "A conexão desta conta expira hoje. Reconecte para não perder os agendamentos."
          : `A conexão desta conta expira em ${daysLeft} dia(s). Reconecte antes disso.`,
      daysLeft,
    };
  }

  return { level: "ok", badge: null, message: null, daysLeft };
}

/** A conexão continuará válida no horário agendado? */
export function connectionValidAt(tokenExpiresAt: string | null | undefined, at: Date): boolean {
  if (!tokenExpiresAt) return true;
  const expires = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(expires)) return true;
  return expires > at.getTime();
}

const FRIENDLY_ERRORS: Record<string, string> = {
  AUTH_INVALID: "A conexão da conta expirou ou foi revogada. Reconecte a conta e tente de novo.",
  META_AUTH_INVALID: "A conexão da conta expirou ou foi revogada. Reconecte a conta.",
  ACCOUNT_NOT_CONNECTED: "Esta conta ainda não está conectada por API oficial.",
  ACCOUNT_MISMATCH: "A conta conectada não confere com a conta do agendamento. Reconecte-a.",
  CAPABILITY_UNAVAILABLE: "Esta plataforma ainda não permite publicação automática por aqui.",
  MEDIA_INVALID: "O vídeo não atende às regras da plataforma (formato, duração ou proporção).",
  MEDIA_NOT_FOUND: "O arquivo do vídeo não foi encontrado no armazenamento. Envie novamente.",
  PROVIDER_RATE_LIMIT: "A plataforma limitou os envios agora. Tente de novo em alguns minutos.",
  PROVIDER_TEMPORARY_ERROR: "A plataforma teve uma falha temporária. Vale tentar de novo.",
  PROVIDER_PERMANENT_ERROR: "A plataforma recusou esta publicação.",
  DATABASE_ERROR: "Falha temporária no sistema durante o envio. Tente de novo.",
  NOT_FOUND: "Agendamento não encontrado.",
  ALREADY_PUBLISHED: "Esta publicação já foi enviada.",
  ALREADY_PROCESSING: "Esta publicação já está sendo enviada.",
  SERVER_CONFIG_MISSING: "Falta configuração no servidor para esta integração.",
};

/** Mensagem amigável para um erro de publicação. */
export function friendlyPublishError(
  code: string | null | undefined,
  raw?: string | null,
): string {
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code]!;
  if (!raw) return "Não foi possível publicar. Tente de novo.";
  const lower = raw.toLowerCase();
  if (lower.includes("token") || lower.includes("credencial") || lower.includes("oauth")) {
    return FRIENDLY_ERRORS["AUTH_INVALID"]!;
  }
  if (lower.includes("limite") || lower.includes("rate")) return FRIENDLY_ERRORS["PROVIDER_RATE_LIMIT"]!;
  return raw;
}
