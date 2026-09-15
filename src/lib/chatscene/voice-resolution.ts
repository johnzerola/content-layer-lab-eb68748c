import type { ChatMessage, ChatParticipant, ChatSceneProject } from "./types";
import { DEFAULT_MESSAGE_VOICE_DIRECTION, DEFAULT_VOICE, profileFromPreset, type MessageVoiceDirection, type VoiceProfile } from "./voice";

export function voiceProfileOf(project: ChatSceneProject, participant: ChatParticipant): VoiceProfile | null {
  const linked = participant.voiceProfileId ? project.voiceProfiles?.find((v) => v.id === participant.voiceProfileId) : undefined;
  if (linked) return linked;
  return participant.voice ? { ...DEFAULT_VOICE, ...participant.voice } : null;
}

export function effectiveVoice(project: ChatSceneProject, message: ChatMessage): { profile: VoiceProfile; direction: MessageVoiceDirection } | null {
  const participant = project.participants.find((p) => p.id === message.participantId);
  if (!participant) return null;
  const profile = voiceProfileOf(project, participant);
  if (!profile) return null;
  return { profile, direction: { ...DEFAULT_MESSAGE_VOICE_DIRECTION, ...(message.voiceDirection ?? {}) } };
}

export function attachPreset(project: ChatSceneProject, participantId: string, presetId: string): ChatSceneProject {
  const participant = project.participants.find((p) => p.id === participantId);
  if (!participant) return project;
  const previous = voiceProfileOf(project, participant);
  const shared = participant.voiceProfileId && project.participants.some((p) => p.id !== participantId && p.voiceProfileId === participant.voiceProfileId);
  let id = participant.voiceProfileId ?? `voice_${participant.id}`;
  if (shared || !participant.voiceProfileId) {
    const occupied = new Set([
      ...(project.voiceProfiles ?? []).map((p) => p.id),
      ...project.participants.filter((p) => p.id !== participantId).map((p) => p.voiceProfileId),
    ]);
    const baseId = `voice_${participant.id}`;
    id = baseId;
    let suffix = 2;
    while (occupied.has(id)) id = `${baseId}_${suffix++}`;
  }
  // A preset replaces the sound; retain only the participant's saved metadata.
  const metadata: Partial<VoiceProfile> = { id };
  for (const key of ["name", "gain", "provider", "language", "locale", "seed", "providerSettings"] as const) {
    if (previous?.[key] !== undefined) Object.assign(metadata, { [key]: previous[key] });
  }
  const profile = profileFromPreset(presetId, metadata);
  return {
    ...project,
    voiceProfiles: [...(project.voiceProfiles ?? []).filter((p) => p.id !== id), profile],
    participants: project.participants.map((p) => p.id === participantId ? { ...p, voiceProfileId: id, voice: profile } : p),
    messages: project.messages.map((message) => message.participantId === participantId ? { ...message, voiceMs: null } : message),
  };
}
