import type { Stage, Scene } from '@/lib/types/stage';
import type { TutorGenerationConfig } from '@/lib/types/tutor-voice';
import type { Participant } from '@/lib/types/roundtable';
import { USER_AVATAR } from '@/lib/types/roundtable';
import { resolveStageTutorDisplay } from '@/lib/classroom/tutor-config';
import { useUserProfileStore } from '@/lib/store/user-profile';

type StageWithTutor = Stage & { tutorConfig?: TutorGenerationConfig };

const GAMMA_DESCRIPTION = 'Generated via Gamma AI';

export function isGammaClassroom(stage: Stage | null, scenes: Scene[] = []): boolean {
  if (!stage) return false;
  if (stage.description === GAMMA_DESCRIPTION) return true;
  return scenes.some((scene) => {
    if (/gamma slide/i.test(scene.title || '')) return true;
    if (scene.type === 'slide' && scene.content.type === 'slide') {
      const imageElement = scene.content.canvas.elements.find((el) => el.type === 'image');
      const imageSrc = imageElement && imageElement.type === 'image' ? imageElement.src : '';
      return typeof imageSrc === 'string' && imageSrc.includes('/api/gamma/page-image/');
    }
    return false;
  });
}

/** Gamma classrooms use a single tutor seat — no preset student agents with i18n names. */
export function buildGammaClassroomParticipants(
  stage: Stage | null,
  t?: (key: string) => string,
): Participant[] {
  const { name, avatar } = resolveStageTutorDisplay(stage);
  const tutorCfg = (stage as StageWithTutor | null)?.tutorConfig;
  const teacherName =
    name || tutorCfg?.voicePreset?.name?.trim() || t?.('roundtable.teacher') || 'AI Tutor';
  const teacherAvatar = avatar || '/avatars/teacher.png';

  const userProfile = useUserProfileStore.getState();
  const userName = userProfile.nickname || t?.('common.you') || 'You';
  const userAvatar = userProfile.avatar || USER_AVATAR;

  return [
    {
      id: 'default-1',
      name: teacherName,
      role: 'teacher',
      avatar: teacherAvatar,
      isOnline: true,
      isSpeaking: false,
    },
    {
      id: 'user-1',
      name: userName,
      role: 'user',
      avatar: userAvatar,
      isOnline: true,
      isSpeaking: false,
    },
  ];
}

export const GAMMA_CLASSROOM_AGENT_IDS = ['default-1'] as const;
