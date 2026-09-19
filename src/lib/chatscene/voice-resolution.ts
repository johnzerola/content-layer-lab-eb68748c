import type { ChatMessage, ChatParticipant, ChatSceneProject } from "./types";
import { DEFAULT_MESSAGE_VOICE_DIRECTION, DEFAULT_VOICE, profileFromPreset, voicePreset, type MessageVoiceDirection, type VoiceProfile } from "./voice";

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
  const targetPreset = voicePreset(presetId);
  const providerChanged = previous?.provider !== (targetPreset.provider ?? DEFAULT_VOICE.provider);
  const metadata: Partial<VoiceProfile> = { id };
  for (const key of ["name", "gain", "provider", "language", "locale", "seed", "providerSettings"] as const) {
    if (key === "provider") continue;
    if (key === "providerSettings" && providerChanged) continue;
    if (key === "name" && previous?.provider === "elevenlabs") continue;
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

/** Vincula uma identidade vocal externa sem misturá-la aos presets sintéticos internos. */
export function attachElevenLabsVoice(
  project: ChatSceneProject,
  participantId: string,
  voice: { id: string; name: string },
): ChatSceneProject {
  const originalParticipant = project.participants.find((item) => item.id === participantId);
  const previous = originalParticipant ? voiceProfileOf(project, originalParticipant) : null;
  const seeded = attachPreset(project, participantId, "adult-male-casual");
  const participant = seeded.participants.find((item) => item.id === participantId);
  if (!participant) return project;
  const current = voiceProfileOf(seeded, participant);
  if (!current?.id) return project;
  const profileId = current.id;
  const currentPreset = voicePreset(current.presetId);
  const profile: VoiceProfile = {
    ...current,
    provider: "elevenlabs",
    providerVoiceId: voice.id,
    name: `ElevenLabs · ${voice.name}`,
    ageStyle: previous?.ageStyle ?? current.ageStyle ?? currentPreset.age,
    genderStyle: previous?.genderStyle ?? current.genderStyle ?? currentPreset.gender,
    speed: 1.04,
    pitch: 0,
    style: "animada",
    energy: 0.72,
    expressiveness: 0.75,
    transform: undefined,
    providerSettings: {
      modelId: "eleven_flash_v2_5",
      stability: 0.38,
      similarityBoost: 0.78,
      style: 0.42,
      speakerBoost: true,
    },
  };
  return {
    ...seeded,
    voiceProfiles: (seeded.voiceProfiles ?? []).map((item) =>
      item.id === profile.id ? profile : item,
    ),
    participants: seeded.participants.map((item) =>
      item.id === participantId ? { ...item, voiceProfileId: profileId, voice: profile } : item,
    ),
    messages: seeded.messages.map((message) =>
      message.participantId === participantId ? { ...message, voiceMs: null } : message,
    ),
  };
}

/** Only fill unassigned participants; existing saved casting remains untouched. */
export function preselectLocalVoices(project: ChatSceneProject): ChatSceneProject {
  return project.participants.reduce((next, participant, index) => voiceProfileOf(next, participant) ? next : attachPreset(next, participant.id, index === 0 ? "faber-viral" : "faber-natural"), project);
}

export function attachVoiceReference(project: ChatSceneProject, participantId: string, reference: NonNullable<VoiceProfile["reference"]>): ChatSceneProject {
  const next = attachPreset(project, participantId, "piper-faber-local");
  const person = next.participants.find(p => p.id === participantId);
  if (!person) return project;
  const profile: VoiceProfile = { ...voiceProfileOf(next, person)!, provider: "chatterbox", providerVoiceId: "reference", reference, name: `Voz de ${person.name}`, pitch: 0, speed: 1, transform: undefined };
  return { ...next, voiceProfiles: (next.voiceProfiles ?? []).map(p => p.id === profile.id ? profile : p), participants: next.participants.map(p => p.id === participantId ? { ...p, voice: profile } : p) };
}
