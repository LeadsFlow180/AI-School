'use client';

import { useMemo } from 'react';
import { useStageStore } from '@/lib/store';
import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { getAgaLaunchContext } from '@/lib/aga/launch-payload';
import {
  computeClassroomProgressDisplay,
  type ClassroomProgressDisplay,
} from '@/lib/classroom/classroom-progress-display';

export function useClassroomProgressDisplay(
  playbackCompleted: boolean,
): ClassroomProgressDisplay | null {
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const classroomId = useStageStore((s) => s.stage?.id ?? null);

  return useMemo(() => {
    const agaContext = classroomId ? getAgaLaunchContext(classroomId) : null;
    return computeClassroomProgressDisplay(scenes, currentSceneId, {
      playbackCompleted: playbackCompleted && currentSceneId !== PENDING_SCENE_ID,
      agaContext,
    });
  }, [scenes, currentSceneId, classroomId, playbackCompleted]);
}
