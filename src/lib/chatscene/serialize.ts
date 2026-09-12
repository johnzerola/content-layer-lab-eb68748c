/**
 * Guardar e reabrir uma conversa.
 *
 * O arquivo salvo carrega o número da versão do formato, para que conversas
 * antigas continuem abrindo quando o formato evoluir. O rascunho atual também
 * fica no próprio navegador: atualizar a página não perde o trabalho.
 */
import {
  CHATSCENE_PROJECT_VERSION,
  normalizeChatSceneProject,
  type ChatSceneProject,
} from "./types";

const LOCAL_KEY = "vaiviral.chatscene.draft";

export interface SerializedChatScene {
  schemaVersion: number;
  savedAt: string;
  project: ChatSceneProject;
}

export function serializeChatSceneProject(project: ChatSceneProject): string {
  const payload: SerializedChatScene = {
    schemaVersion: CHATSCENE_PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(payload);
}

/** Aceita o formato com versão e também o documento cru de versões antigas. */
export function deserializeChatSceneProject(raw: string): ChatSceneProject {
  const parsed = JSON.parse(raw) as Partial<SerializedChatScene> & Partial<ChatSceneProject>;
  const doc = (parsed as SerializedChatScene).project ?? (parsed as ChatSceneProject);
  return normalizeChatSceneProject(doc);
}

/* ------------------------------ rascunho local ---------------------------- */

export function saveLocalDraft(project: ChatSceneProject, recordId?: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ recordId: recordId ?? null, doc: serializeChatSceneProject(project) }),
    );
  } catch {
    /* armazenamento cheio ou bloqueado: seguimos sem rascunho */
  }
}

export function loadLocalDraft(): { project: ChatSceneProject; recordId: string | null } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const wrap = JSON.parse(raw) as { recordId: string | null; doc: string };
    if (!wrap?.doc) return null;
    return { project: deserializeChatSceneProject(wrap.doc), recordId: wrap.recordId ?? null };
  } catch {
    return null;
  }
}

export function clearLocalDraft(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* nada a fazer */
  }
}
