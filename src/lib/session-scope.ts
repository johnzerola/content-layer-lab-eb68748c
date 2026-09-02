/**
 * Isolamento de workspace por conta.
 *
 * Templates, template ativo e preferências do estúdio vivem no localStorage do
 * navegador. Sem escopo, duas contas usando o mesmo computador enxergariam o
 * mesmo lote. Aqui guardamos o dono atual do armazenamento local e limpamos os
 * dados do estúdio quando a conta muda (login, troca de conta ou logout).
 *
 * Só mexe em apresentação/armazenamento local: nenhuma lógica de vídeo,
 * publicação ou contrato de backend é alterada. Os dados da conta continuam
 * vindo do backend (templates, lotes, agendamentos) já filtrados por user_id.
 */
import { onAuth, currentUser } from "@/lib/cloud";

const OWNER_KEY = "vv.owner";
/** Tudo que pertence ao workspace do usuário no navegador. */
const WORKSPACE_PREFIXES = ["vv.", "vv_"];

function isWorkspaceKey(key: string) {
  return key !== OWNER_KEY && WORKSPACE_PREFIXES.some((p) => key.startsWith(p));
}

/** Apaga o workspace local. Devolve true se algo foi realmente removido. */
export function clearLocalWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isWorkspaceKey(k)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    return false;
  }
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (isWorkspaceKey(k)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignora */
  }
  return doomed.length > 0;
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(id: string) {
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {
    /* ignora */
  }
}

/** Aplica o dono atual; recarrega apenas quando havia dados de outra conta. */
function applyOwner(userId: string | null) {
  if (typeof window === "undefined") return;
  const next = userId ?? "anon";
  const current = readOwner();
  if (current === next) return;

  const wiped = clearLocalWorkspace();
  writeOwner(next);

  // Só recarrega quando de fato havia trabalho de outra conta em memória.
  if (wiped && current !== null) window.location.reload();
}

/**
 * Liga o escopo por conta. Chamar uma única vez na raiz do app.
 * Devolve a função de limpeza do listener.
 */
export function installSessionScope(): () => void {
  if (typeof window === "undefined") return () => {};
  void currentUser()
    .then((u) => applyOwner(u?.id ?? null))
    .catch(() => {});
  return onAuth((u) => applyOwner(u?.id ?? null));
}
