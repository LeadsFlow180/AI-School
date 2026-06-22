import type { Stage } from '@/lib/types/stage';
import type { TutorGenerationConfig } from '@/lib/types/tutor-voice';
import type { TTSProviderId } from '@/lib/audio/types';
import type { Participant } from '@/lib/types/roundtable';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useSettingsStore } from '@/lib/store/settings';

type StageWithTutor = Stage & { tutorConfig?: TutorGenerationConfig };

/** Classroom-scoped tutor name/avatar saved on the stage (source of truth for playback UI). */
export function resolveStageTutorDisplay(stage: Stage | null): {
  name?: string;
  avatar?: string;
} {
  const tutor = (stage as StageWithTutor | null)?.tutorConfig;
  if (!tutor) return {};
  return {
    name: tutor.name?.trim() || tutor.voicePreset?.name?.trim(),
    avatar: tutor.avatar?.trim(),
  };
}

/** Prefer stage.tutorConfig for the teacher seat so new browsers/tabs show the saved tutor. */
export function applyStageTutorToParticipants(
  participants: Participant[],
  stage: Stage | null,
): Participant[] {
  const { name, avatar } = resolveStageTutorDisplay(stage);
  if (!name && !avatar) return participants;
  return participants.map((participant) =>
    participant.role === 'teacher'
      ? {
          ...participant,
          ...(name ? { name } : {}),
          ...(avatar ? { avatar } : {}),
        }
      : participant,
  );
}

/** How complete a saved tutor identity is (name, avatar, voice). */
export function tutorConfigCompletenessScore(stage: Stage | null): number {
  const tutor = (stage as StageWithTutor | null)?.tutorConfig;
  if (!tutor) return 0;
  let score = 0;
  if (tutor.name?.trim()) score += 1;
  if (tutor.avatar?.trim()) score += 2;
  if (tutor.voicePreset?.providerId?.trim() && tutor.voicePreset?.voiceId?.trim()) score += 2;
  return score;
}

/** Merge tutor fields from two snapshots, keeping the richest value per field. */
export function mergeTutorConfig(
  primary?: TutorGenerationConfig,
  fallback?: TutorGenerationConfig,
): TutorGenerationConfig | undefined {
  if (!primary && !fallback) return undefined;
  const a = primary || {};
  const b = fallback || {};
  const voiceA = a.voicePreset;
  const voiceB = b.voicePreset;
  const mergedVoice =
    voiceA || voiceB
      ? {
          id: voiceA?.id || voiceB?.id || `${voiceA?.providerId || voiceB?.providerId}::${voiceA?.voiceId || voiceB?.voiceId}`,
          name: voiceA?.name || voiceB?.name || a.name || b.name || 'AI Tutor',
          providerId: voiceA?.providerId || voiceB?.providerId || 'browser-native-tts',
          voiceId: voiceA?.voiceId || voiceB?.voiceId || 'default',
        }
      : undefined;

  return {
    name: a.name?.trim() || b.name?.trim() || mergedVoice?.name,
    avatar: a.avatar?.trim() || b.avatar?.trim(),
    description: a.description?.trim() || b.description?.trim(),
    ...(mergedVoice ? { voicePreset: mergedVoice } : {}),
  };
}

/** Apply merged tutorConfig onto a stage without dropping scenes or other fields. */
export function mergeStagePreservingTutor(local: Stage | null, server: Stage): Stage {
  const localTutor = (local as StageWithTutor | null)?.tutorConfig;
  const serverTutor = (server as StageWithTutor).tutorConfig;
  const localScore = tutorConfigCompletenessScore(local);
  const serverScore = tutorConfigCompletenessScore(server);

  if (localScore === 0) return server;
  if (serverScore === 0) {
    return { ...server, tutorConfig: localTutor };
  }

  const richerFirst = localScore >= serverScore ? localTutor : serverTutor;
  const poorerSecond = localScore >= serverScore ? serverTutor : localTutor;
  const tutorConfig = mergeTutorConfig(richerFirst, poorerSecond);
  return tutorConfig ? { ...server, tutorConfig } : server;
}

/** Apply stage.tutorConfig onto the teacher agent + global TTS settings. */
export function applyTutorConfigFromStage(stage: Stage | null): void {
  const tutorCfg = (stage as StageWithTutor | null)?.tutorConfig;
  if (!tutorCfg) return;

  const registry = useAgentRegistry.getState();
  const settingsState = useSettingsStore.getState();
  const selectedIds = settingsState.selectedAgentIds;
  const teacherId =
    selectedIds.find((id) => registry.getAgent(id)?.role === 'teacher') ||
    selectedIds[0] ||
    'default-1';
  const { name: tutorName, avatar: tutorAvatar } = resolveStageTutorDisplay(stage);
  const tutorUpdates = {
    ...(tutorName ? { name: tutorName } : {}),
    ...(tutorAvatar ? { avatar: tutorAvatar } : {}),
    ...(tutorCfg.voicePreset
      ? {
          voiceConfig: {
            providerId: tutorCfg.voicePreset.providerId as TTSProviderId,
            voiceId: tutorCfg.voicePreset.voiceId,
          },
        }
      : {}),
  };
  if (!selectedIds.includes('default-1')) {
    settingsState.setSelectedAgentIds(['default-1', ...selectedIds]);
  }
  registry.updateAgent(teacherId, tutorUpdates);
  if (teacherId !== 'default-1') {
    registry.updateAgent('default-1', tutorUpdates);
  }
  if (tutorCfg.voicePreset?.providerId && tutorCfg.voicePreset?.voiceId) {
    settingsState.setTTSProvider(tutorCfg.voicePreset.providerId as TTSProviderId);
    settingsState.setTTSVoice(tutorCfg.voicePreset.voiceId);
  }
}
